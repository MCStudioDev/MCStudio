import { describe, expect, it } from "vitest";
import type { RecipeCatalogDoc } from "../lib/domain";
import type { Recipe } from "../lib/types";
import {
  createRecipeIngredientCompatibilityEvaluator,
  evaluateRecipeIngredientEvidence,
  evaluateRecipePrimaryIngredientCompatibility,
  filterPrimaryIngredientCompatibleRecipes,
  hasExclusiveRequestedProteinForm,
  specializeCatalogRecipeForRequestedProteins
} from "../services/recipePrimaryIngredientCompatibility";

function recipe(input: {
  id: string;
  title: string;
  requiredCanonicals: string[];
  optionalCanonicals?: string[];
}): RecipeCatalogDoc {
  const canonicals = [...input.requiredCanonicals, ...(input.optionalCanonicals ?? [])];
  return {
    id: input.id,
    title: input.title,
    slug: input.id,
    description: input.title,
    ingredients: canonicals.map((canonical, index) => ({
      name: canonical,
      canonical,
      required: index < input.requiredCanonicals.length
    })),
    ingredientCanonicals: canonicals,
    requiredCanonicals: input.requiredCanonicals,
    optionalCanonicals: input.optionalCanonicals ?? [],
    dietTags: [],
    allergenTags: [],
    mealType: "dinner",
    cuisine: "Global",
    prepMinutes: 10,
    cookMinutes: 20,
    totalMinutes: 30,
    difficulty: "easy",
    calories: 400,
    protein: 20,
    carbs: 30,
    fat: 15,
    calorieBand: "301_500",
    servings: 4,
    steps: ["Cook until done."],
    image: { storagePath: "" },
    searchTokens: canonicals,
    popularityScore: 50,
    qualityScore: 80,
    isActive: true,
    createdAt: 0,
    updatedAt: 0
  };
}

describe("recipe primary ingredient compatibility", () => {
  const pantry = ["bell pepper", "tomato", "cucumber", "lemon", "egg", "banana", "water", "juice"];

  it("rejects an unrequested animal protein even when secondary ingredients match", () => {
    const fishWithLemon = recipe({
      id: "fish-with-lemon",
      title: "Grilled Fish with Lemon",
      requiredCanonicals: ["fish", "lemon"]
    });

    expect(evaluateRecipePrimaryIngredientCompatibility(fishWithLemon, pantry)).toMatchObject({
      compatible: false,
      reason: "unrequested_primary_protein"
    });
  });

  it("accepts a recipe whose primary protein was supplied", () => {
    const shakshuka = recipe({
      id: "shakshuka",
      title: "Shakshuka",
      requiredCanonicals: ["egg", "tomato", "bell pepper"]
    });

    expect(evaluateRecipePrimaryIngredientCompatibility(shakshuka, pantry)).toMatchObject({
      compatible: true,
      requestedProteinFamilies: ["egg"],
      recipeProteinFamilies: ["egg"]
    });
  });

  it("keeps ground lamb recipes compatible with a lamb request", () => {
    const kafta = recipe({
      id: "lebanese-lamb-kafta",
      title: "Lebanese Lamb Kafta",
      requiredCanonicals: ["ground lamb", "parsley", "onion", "black pepper"]
    });

    expect(evaluateRecipePrimaryIngredientCompatibility(kafta, ["lamb", "parsley"])).toMatchObject({
      compatible: true,
      requestedProteinFamilies: ["lamb"],
      recipeProteinFamilies: ["lamb"]
    });
  });

  it("allows egg as a secondary ingredient beside a requested seafood protein", () => {
    const padThai = recipe({
      id: "shrimp-pad-thai",
      title: "Shrimp Pad Thai with Egg",
      requiredCanonicals: ["shrimp", "egg", "rice noodles"]
    });

    expect(evaluateRecipePrimaryIngredientCompatibility(padThai, ["shrimp", "rice noodles"])).toMatchObject({
      compatible: true,
      requestedProteinFamilies: ["shrimp"],
      recipeProteinFamilies: ["egg", "shrimp"]
    });
  });

  it("allows egg as a supporting binder in a vegetable-centered recipe", () => {
    const fritters = recipe({
      id: "zucchini-fritters",
      title: "Zucchini Fritters",
      requiredCanonicals: ["zucchini", "egg", "flour"]
    });

    expect(evaluateRecipePrimaryIngredientCompatibility(fritters, ["zucchini"])).toMatchObject({
      compatible: true,
      reason: "compatible",
      recipeProteinFamilies: ["egg"]
    });
  });

  it("still rejects an egg-centered dish when egg was not requested", () => {
    const omelette = recipe({
      id: "vegetable-omelette",
      title: "Vegetable Omelette",
      requiredCanonicals: ["egg", "zucchini", "tomato"]
    });

    expect(evaluateRecipePrimaryIngredientCompatibility(omelette, ["zucchini", "tomato"]))
      .toMatchObject({ compatible: false, reason: "unrequested_primary_protein" });
  });

  it("treats animal-specific liver labels as liver rather than a second meat protein", () => {
    const chickenLivers: Recipe = {
      name: "Pan-Seared Liver",
      dish_identity: "Pan-Seared Chicken Livers",
      cuisine: "Global",
      ingredients: ["1 lb chicken livers"],
      missing_ingredients: ["1 onion", "2 tbsp butter"],
      steps: ["Cook until done."],
      calories: 320,
      protein: "25g",
      carbs: "8g",
      fat: "20g",
      cook_time: "20 minutes",
      difficulty: "Easy",
      dish_intent: {
        dish_name: "Butter Chicken",
        cuisine: "Indian",
        visual_keywords: ["butter chicken"],
        exclude_keywords: []
      },
      photo_identity: {
        dish_slug: "pan-seared-chicken-livers",
        english_name: "Pan-Seared Chicken Pate",
        protein: "chicken"
      }
    };

    expect(evaluateRecipePrimaryIngredientCompatibility(chickenLivers, ["liver", "onion"]))
      .toMatchObject({
        compatible: true,
        reason: "compatible",
        requestedProteinFamilies: ["liver"],
        recipeProteinFamilies: ["liver"]
      });
  });

  it("normalizes possessive species labels on liver without allowing separate meat", () => {
    const lambLiver = recipe({
      id: "pan-fried-lambs-liver",
      title: "Pan-Fried Lamb's Liver",
      requiredCanonicals: ["lamb's liver", "onion"]
    });
    const liverWithLamb = recipe({
      id: "liver-with-lamb-chops",
      title: "Liver with Lamb Chops",
      requiredCanonicals: ["liver", "lamb chops", "onion"]
    });

    expect(evaluateRecipePrimaryIngredientCompatibility(lambLiver, ["liver"]))
      .toMatchObject({ compatible: true, recipeProteinFamilies: ["liver"] });
    expect(evaluateRecipePrimaryIngredientCompatibility(liverWithLamb, ["liver"]))
      .toMatchObject({
        compatible: false,
        incompatibleProteinFamilies: ["lamb"],
        reason: "unrequested_primary_protein"
      });
  });

  it("allows plural liver names and supporting cooking fat", () => {
    const friedLivers = recipe({
      id: "fried-livers",
      title: "Fried Livers",
      requiredCanonicals: ["livers", "chicken fat", "egg", "onion"]
    });

    expect(evaluateRecipePrimaryIngredientCompatibility(friedLivers, ["liver", "onion"]))
      .toMatchObject({
        compatible: true,
        incompatibleProteinFamilies: [],
        recipeProteinFamilies: ["egg", "liver"]
      });
  });

  it("accepts an authentic optional shrimp variant without selecting its chicken alternative", () => {
    const friedRice = recipe({
      id: "khao-pad",
      title: "Khao Pad",
      requiredCanonicals: ["rice", "egg", "onion"],
      optionalCanonicals: ["shrimp", "chicken", "lime"]
    });

    expect(evaluateRecipePrimaryIngredientCompatibility(friedRice, ["shrimp", "rice"])).toMatchObject({
      compatible: true,
      requestedProteinFamilies: ["shrimp"],
      recipeProteinFamilies: ["egg", "shrimp"]
    });

    const specialized = specializeCatalogRecipeForRequestedProteins(friedRice, ["shrimp", "rice"]);
    expect(specialized.optionalCanonicals).toEqual(["shrimp", "lime"]);
    expect(specialized.ingredientCanonicals).not.toContain("chicken");
  });

  it("accepts shrimp glass-noodle salad while removing optional pork", () => {
    const salad = recipe({
      id: "yam-woon-sen",
      title: "Yam Woon Sen",
      requiredCanonicals: ["glass noodles", "lime", "chili"],
      optionalCanonicals: ["shrimp", "ground pork", "cilantro"]
    });

    expect(evaluateRecipePrimaryIngredientCompatibility(salad, ["shrimp", "rice noodles"]).compatible).toBe(true);
    expect(specializeCatalogRecipeForRequestedProteins(salad, ["shrimp"]).optionalCanonicals)
      .toEqual(["shrimp", "cilantro"]);
  });

  it("does not treat fish sauce as the requested fish protein", () => {
    const papayaSalad = recipe({
      id: "som-tam",
      title: "Som Tam",
      requiredCanonicals: ["green papaya", "lime", "chili"],
      optionalCanonicals: ["fish sauce", "peanuts"]
    });

    expect(evaluateRecipePrimaryIngredientCompatibility(papayaSalad, ["white fish", "lime"])).toMatchObject({
      compatible: true,
      reason: "compatible",
      recipeProteinFamilies: []
    });
    expect(evaluateRecipePrimaryIngredientCompatibility(papayaSalad, ["white fish"])).toMatchObject({
      compatible: false,
      reason: "requested_primary_protein_missing",
      recipeProteinFamilies: []
    });
  });

  it("does not replace a mandatory chicken identity with optional shrimp", () => {
    const greenCurryChicken = recipe({
      id: "green-curry-chicken",
      title: "Thai Green Curry Chicken",
      requiredCanonicals: ["chicken", "green curry paste", "coconut milk"],
      optionalCanonicals: ["shrimp", "basil"]
    });

    expect(evaluateRecipePrimaryIngredientCompatibility(greenCurryChicken, ["shrimp", "coconut milk"]))
      .toMatchObject({ compatible: false, reason: "unrequested_primary_protein" });
  });

  it("allows requested non-protein anchors while removing conflicting animal proteins", () => {
    const candidates = [
      recipe({ id: "shakshuka", title: "Shakshuka", requiredCanonicals: ["egg", "tomato"] }),
      recipe({ id: "cucumber-salad", title: "Cucumber Salad", requiredCanonicals: ["cucumber", "lemon"] }),
      recipe({ id: "fish", title: "Broiled Grouper", requiredCanonicals: ["grouper", "lemon"] }),
      recipe({ id: "shrimp", title: "Tom Yum Goong", requiredCanonicals: ["shrimp", "lemon"] }),
      recipe({ id: "lamb", title: "Adana Kebab", requiredCanonicals: ["lamb", "bell pepper"] }),
      recipe({ id: "beef", title: "Beef Curry", requiredCanonicals: ["beef", "tomato"] })
    ];

    expect(filterPrimaryIngredientCompatibleRecipes(candidates, pantry).map((item) => item.id)).toEqual([
      "shakshuka",
      "cucumber-salad"
    ]);
  });

  it("rejects a sauce-only recipe when the user requested chicken", () => {
    const tomatoSauce = recipe({
      id: "tomato-sauce",
      title: "Italian Tomato Sauce",
      requiredCanonicals: ["tomato", "garlic", "olive oil"]
    });

    expect(evaluateRecipePrimaryIngredientCompatibility(tomatoSauce, ["chicken"])).toMatchObject({
      compatible: false,
      reason: "requested_primary_protein_missing",
      requestedProteinFamilies: ["chicken"],
      recipeProteinFamilies: []
    });
  });

  it("does not substitute ground beef recipes for a requested steak cut", () => {
    const meatballs = recipe({
      id: "meatballs",
      title: "Beef Meatballs",
      requiredCanonicals: ["ground beef", "tomato"]
    });

    expect(evaluateRecipePrimaryIngredientCompatibility(meatballs, ["steak", "tomato"]))
      .toMatchObject({ compatible: false, reason: "requested_protein_form_mismatch" });
  });

  it("does not require fish on rice and onion cards in a mixed-anchor request", () => {
    const ricePilaf = recipe({
      id: "rice-pilaf",
      title: "Rice Pilaf",
      requiredCanonicals: ["rice", "onion"]
    });
    const arrozConPollo = recipe({
      id: "arroz-con-pollo",
      title: "Arroz con Pollo",
      requiredCanonicals: ["rice", "onion", "chicken"]
    });

    expect(evaluateRecipePrimaryIngredientCompatibility(ricePilaf, ["fish", "rice", "onion"]))
      .toMatchObject({ compatible: true, reason: "compatible" });
    expect(evaluateRecipePrimaryIngredientCompatibility(arrozConPollo, ["fish", "rice", "onion"]))
      .toMatchObject({ compatible: false, reason: "unrequested_primary_protein" });
    expect(evaluateRecipePrimaryIngredientCompatibility(ricePilaf, ["fish"]))
      .toMatchObject({ compatible: false, reason: "requested_primary_protein_missing" });
  });

  it("recognizes common named fish species as fish", () => {
    const halibut = recipe({
      id: "pan-seared-halibut",
      title: "Pan-Seared Halibut",
      requiredCanonicals: ["halibut", "onion"]
    });

    expect(evaluateRecipePrimaryIngredientCompatibility(halibut, ["fish", "onion"]))
      .toMatchObject({ compatible: true, recipeProteinFamilies: ["fish"] });
  });

  it("does not substitute a generic beef stew for a requested steak cut", () => {
    const beefStew = recipe({
      id: "beef-stew",
      title: "Classic Beef Stew",
      requiredCanonicals: ["beef", "potato", "carrot"]
    });

    expect(evaluateRecipePrimaryIngredientCompatibility(beefStew, ["steak"]))
      .toMatchObject({ compatible: false, reason: "requested_protein_form_mismatch" });
  });

  it("scopes a requested steak form to beef cards in a mixed-protein pantry", () => {
    const chicken = recipe({
      id: "roast-chicken",
      title: "Roast Chicken",
      requiredCanonicals: ["chicken", "onion"]
    });
    const fish = recipe({
      id: "baked-fish",
      title: "Baked Fish",
      requiredCanonicals: ["fish", "onion"]
    });
    const beefStew = recipe({
      id: "mixed-pantry-beef-stew",
      title: "Beef Stew",
      requiredCanonicals: ["beef", "onion"]
    });

    expect(evaluateRecipePrimaryIngredientCompatibility(chicken, ["steak", "chicken", "fish", "onion"]))
      .toMatchObject({ compatible: true, reason: "compatible" });
    expect(evaluateRecipePrimaryIngredientCompatibility(fish, ["steak", "chicken", "fish", "onion"]))
      .toMatchObject({ compatible: true, reason: "compatible" });
    expect(evaluateRecipePrimaryIngredientCompatibility(beefStew, ["steak", "chicken", "fish", "onion"]))
      .toMatchObject({ compatible: false, reason: "requested_protein_form_mismatch" });
    expect(hasExclusiveRequestedProteinForm(["steak", "onion"], "beef")).toBe(true);
    expect(hasExclusiveRequestedProteinForm(["steak", "chicken", "onion"], "beef")).toBe(false);
    expect(hasExclusiveRequestedProteinForm(["beef", "onion"], "beef")).toBe(false);
  });

  it("does not substitute an intact steak recipe for requested ground beef", () => {
    const ribeye = recipe({
      id: "grilled-ribeye",
      title: "Grilled Ribeye Steak",
      requiredCanonicals: ["ribeye steak", "black pepper"]
    });

    expect(evaluateRecipePrimaryIngredientCompatibility(ribeye, ["ground beef", "black pepper"]))
      .toMatchObject({ compatible: false, reason: "requested_protein_form_mismatch" });
  });

  it("allows ground and intact beef dishes when broad beef and ground beef are both requested", () => {
    const fattah = recipe({
      id: "egyptian-beef-fattah",
      title: "Egyptian Beef Fattah",
      requiredCanonicals: ["beef", "rice", "bread"]
    });
    const grilledBeef = recipe({
      id: "egyptian-grilled-beef",
      title: "Egyptian Grilled Beef Kebabs",
      requiredCanonicals: ["beef", "onion", "bell pepper"]
    });
    const kofta = recipe({
      id: "egyptian-ground-beef-kofta",
      title: "Egyptian Ground Beef Kofta",
      requiredCanonicals: ["ground beef", "onion", "parsley"]
    });
    const request = ["beef", "meat", "ground beef"];

    expect(evaluateRecipePrimaryIngredientCompatibility(fattah, request))
      .toMatchObject({ compatible: true, reason: "compatible" });
    expect(evaluateRecipePrimaryIngredientCompatibility(grilledBeef, request))
      .toMatchObject({ compatible: true, reason: "compatible" });
    expect(evaluateRecipePrimaryIngredientCompatibility(kofta, request))
      .toMatchObject({ compatible: true, reason: "compatible" });
    expect(hasExclusiveRequestedProteinForm(request, "beef")).toBe(false);
  });

  it("does not mistake minced garlic in a steak recipe for ground beef", () => {
    const koreanSteak = recipe({
      id: "korean-steak",
      title: "Korean Marinated Steak",
      requiredCanonicals: ["sirloin steak", "minced garlic", "soy sauce"]
    });

    expect(evaluateRecipePrimaryIngredientCompatibility(koreanSteak, ["steak"]))
      .toMatchObject({ compatible: true, reason: "compatible" });
  });

  it("recognizes London Broil as an intact steak preparation", () => {
    const londonBroil = recipe({
      id: "london-broil",
      title: "London Broil",
      requiredCanonicals: ["beef", "olive oil", "garlic"]
    });

    expect(evaluateRecipePrimaryIngredientCompatibility(londonBroil, ["steak"]))
      .toMatchObject({ compatible: true, reason: "compatible" });
  });

  it("treats a source recipe's generic meat slot as evidence for requested ground beef", () => {
    const doner = recipe({
      id: "doner-kebab",
      title: "Doner Kebab",
      requiredCanonicals: ["meat", "spices"]
    });

    expect(evaluateRecipeIngredientEvidence(doner, ["ground beef", "tomato"]))
      .toMatchObject({ compatible: true, matchedIngredientIds: ["ground_beef"] });
  });

  it.each([
    ["Black-Eyed Peas And Spareribs", ["black-eyed peas", "spareribs"]],
    ["Hot Clam Dip", ["clam", "cream cheese"]],
    ["Land And Sea Linguini", ["linguini", "shrimp", "beef"]],
    ["Chicken And Scampi", ["chicken", "scampi", "garlic"]],
    ["Italian Pinwheels", ["tortilla", "ham", "bell pepper"]]
  ])("rejects hidden or regional unrequested proteins in %s", (title, requiredCanonicals) => {
    const candidate = recipe({
      id: title.toLowerCase().replace(/\s+/g, "-"),
      title,
      requiredCanonicals
    });

    expect(evaluateRecipePrimaryIngredientCompatibility(candidate, pantry)).toMatchObject({
      compatible: false,
      reason: "unrequested_primary_protein"
    });
  });

  it("rejects a recipe that only matches low-signal pantry staples", () => {
    const fries = recipe({
      id: "oven-fries",
      title: "Oven French Fries",
      requiredCanonicals: ["potato", "water", "salt"]
    });

    expect(evaluateRecipeIngredientEvidence(fries, pantry)).toMatchObject({
      compatible: false,
      reason: "no_meaningful_ingredient_match",
      matchedIngredientIds: []
    });
  });

  it("rejects Arabic pork dishes from an Arabic chicken request", () => {
    const porkDish = recipe({
      id: "arabic-pork-dish",
      title: "\u062f\u062c\u0627\u062c \u0639\u0644\u0649 \u0627\u0644\u0637\u0631\u064a\u0642\u0629 \u0627\u0644\u0625\u064a\u0637\u0627\u0644\u064a\u0629 \u0645\u0639 \u0644\u062d\u0645 \u0627\u0644\u062e\u0646\u0632\u064a\u0631",
      requiredCanonicals: ["chicken", "\u0644\u062d\u0645 \u0627\u0644\u062e\u0646\u0632\u064a\u0631", "tomato"]
    });

    expect(evaluateRecipePrimaryIngredientCompatibility(
      porkDish,
      ["\u0641\u0631\u0627\u062e", "\u0637\u0645\u0627\u0637\u0645"]
    )).toMatchObject({
      compatible: false,
      reason: "unrequested_primary_protein",
      recipeProteinFamilies: ["chicken", "pork"]
    });
  });

  it("accepts a recipe with a meaningful vegetable or egg match", () => {
    const pepperCabbage = recipe({
      id: "pepper-cabbage",
      title: "Pepper Cabbage",
      requiredCanonicals: ["bell pepper", "cabbage"]
    });

    expect(evaluateRecipeIngredientEvidence(pepperCabbage, pantry)).toMatchObject({
      compatible: true,
      matchedIngredientIds: ["bell_pepper"]
    });
  });

  it("reuses one normalized pantry context across candidate evaluations", () => {
    const evaluator = createRecipeIngredientCompatibilityEvaluator(pantry);
    const eggRecipe = recipe({
      id: "egg-pepper",
      title: "Egg and Pepper Skillet",
      requiredCanonicals: ["egg", "bell pepper"]
    });
    const fishRecipe = recipe({
      id: "fish-pepper",
      title: "Fish and Pepper Skillet",
      requiredCanonicals: ["fish", "bell pepper"]
    });

    expect(evaluator.evaluatePrimary(eggRecipe).compatible).toBe(true);
    expect(evaluator.evaluateEvidence(eggRecipe).compatible).toBe(true);
    expect(evaluator.evaluatePrimary(fishRecipe).compatible).toBe(false);
  });
});
