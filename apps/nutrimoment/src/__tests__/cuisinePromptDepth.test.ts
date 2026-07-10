import { describe, expect, it } from "vitest";
import { buildMealPlanPrompt, buildRecipeGenerationPrompt } from "../lib/aiPrompts";
import { getCuisineDishReferenceText } from "../lib/cuisineDishCatalog";

describe("cuisine prompt depth", () => {
  it("keeps Italian generation anchored to iconic dishes including pizza", () => {
    const prompt = buildRecipeGenerationPrompt(
      [
        { name: "flatbread", quantity: "2 pieces" },
        { name: "tomato sauce", quantity: "1 cup" },
        { name: "mozzarella", quantity: "150g" },
        { name: "basil", quantity: "small bunch" }
      ],
      {
        recipeLanguage: "English",
        preferredCuisine: "Italian",
        calorieTarget: 1800,
        maxMissingIngredients: 4,
        recipeCount: 10,
        diets: [],
        conditions: [],
        allergens: []
      }
    );

    expect(prompt).toContain("Italian pizza rule");
    expect(prompt).toContain("pizza margherita");
    expect(prompt).toContain("before generic toast, sandwich, or baked bread");
    expect(prompt).toContain("at least half of the selected-cuisine cards should be recognizable named dishes");
  });

  it("keeps Italian weekly plans from collapsing into generic pasta and bowls", () => {
    const prompt = buildMealPlanPrompt({
      pantry: ["pasta", "tomato sauce", "bread", "rice", "chicken", "eggplant"],
      pantryItems: [
        { name: "pasta", quantity: "500g" },
        { name: "tomato sauce", quantity: "2 cups" },
        { name: "bread", quantity: "1 loaf" },
        { name: "rice", quantity: "2 cups" },
        { name: "chicken", quantity: "500g" },
        { name: "eggplant", quantity: "2 whole" }
      ],
      diets: [],
      conditions: [],
      allergens: [],
      recipeLanguage: "English",
      preferredCuisine: "Italian",
      calorieTarget: 2000
    });

    expect(prompt).toContain("pizza margherita");
    expect(prompt).toContain("pasta alla norma");
    expect(prompt).toContain("chicken cacciatore");
    expect(prompt).toContain("Do not output multiple generic pasta cards");
  });

  it("promotes shawarma when Middle Eastern pantry signals fit", () => {
    const prompt = buildRecipeGenerationPrompt(
      [
        { name: "chicken", quantity: "500g" },
        { name: "pita", quantity: "4 pieces" },
        { name: "garlic", quantity: "3 cloves" },
        { name: "lemon", quantity: "1 whole" },
        { name: "tahini", quantity: "2 tbsp" }
      ],
      {
        recipeLanguage: "English",
        preferredCuisine: "Middle Eastern",
        calorieTarget: 1800,
        maxMissingIngredients: 4,
        recipeCount: 10,
        diets: [],
        conditions: [],
        allergens: []
      }
    );

    expect(prompt).toContain("Middle Eastern shawarma rule");
    expect(prompt).toContain("Shawarma family rule is active");
    expect(prompt).toContain("chicken shawarma wrap");
    expect(prompt).toContain("before a generic grilled meat plate");
  });

  it("treats protein, vegetable, and bread scans as combined dish-family signals", () => {
    const prompt = buildRecipeGenerationPrompt(
      [
        { name: "bell peper", quantity: "2 whole" },
        { name: "chicken breast", quantity: "500g" },
        { name: "bread", quantity: "4 pieces" }
      ],
      {
        recipeLanguage: "English",
        preferredCuisine: "Any",
        calorieTarget: 1800,
        maxMissingIngredients: 4,
        recipeCount: 5,
        diets: [],
        conditions: [],
        allergens: []
      }
    );

    expect(prompt).toContain("General pantry expansion rule");
    expect(prompt).toContain("applies to all ingredient types");
    expect(prompt).toContain("Ingredient relationship planner: protein + vegetable + bread");
    expect(prompt).toContain("wraps, sandwiches, stuffed breads, skewers/kebabs");
    expect(prompt).toContain("fajitas");
    expect(prompt).toContain("shawarma");
    expect(prompt).toContain("A plain protein breast/fillet/steak card may appear at most once");
  });

  it("uses a variation seed to rotate same-ingredient recipe sets", () => {
    const prompt = buildRecipeGenerationPrompt(
      [{ name: "chicken", quantity: "500g" }],
      {
        recipeLanguage: "English",
        preferredCuisine: "Any",
        calorieTarget: 1800,
        maxMissingIngredients: 4,
        recipeCount: 5,
        diets: [],
        conditions: [],
        allergens: [],
        variationSeed: "test-seed-123"
      }
    );

    expect(prompt).toContain("Run variation seed: test-seed-123");
    expect(prompt).toContain("Same-ingredients rotation rule");
    expect(prompt).toContain("do not return the same card set by default");
    expect(prompt).toContain("Do not merely reorder the same recipes");
  });

  it("treats mixed proteins and supports as a menu-composition problem", () => {
    const prompt = buildRecipeGenerationPrompt(
      [
        { name: "salmon", quantity: "300g" },
        { name: "shrimp", quantity: "300g" },
        { name: "chicken", quantity: "500g" },
        { name: "steak", quantity: "400g" },
        { name: "ground meat", quantity: "500g" },
        { name: "tomato", quantity: "4 whole" },
        { name: "bell pepper", quantity: "2 whole" },
        { name: "onion", quantity: "2 whole" },
        { name: "mozzarella", quantity: "150g" }
      ],
      {
        recipeLanguage: "English",
        preferredCuisine: "Any",
        calorieTarget: 1800,
        maxMissingIngredients: 4,
        recipeCount: 5,
        diets: [],
        conditions: [],
        allergens: []
      }
    );

    expect(prompt).toContain("Multi-protein menu planner is active");
    expect(prompt).toContain("do not combine unrelated proteins into one confused recipe");
    expect(prompt).toContain("internally research and rank");
    expect(prompt).toContain("Examples are illustrative patterns, not a whitelist");
    expect(prompt).toContain("choose the highest-scoring pantry fit");
    expect(prompt).toContain("Reject low-research pairings");
  });

  it("forces Any cuisine to rotate beyond the usual nearby cuisines", () => {
    const recipePrompt = buildRecipeGenerationPrompt(
      [
        { name: "chicken", quantity: "500g" },
        { name: "rice", quantity: "2 cups" },
        { name: "tomato sauce", quantity: "1 cup" },
        { name: "pasta", quantity: "300g" },
        { name: "bread", quantity: "1 loaf" },
        { name: "egg", quantity: "6 whole" }
      ],
      {
        recipeLanguage: "English",
        preferredCuisine: "Any",
        calorieTarget: 1800,
        maxMissingIngredients: 4,
        recipeCount: 10,
        diets: [],
        conditions: [],
        allergens: []
      }
    );
    const mealPlanPrompt = buildMealPlanPrompt({
      pantry: ["chicken", "rice", "tomato sauce", "pasta", "bread", "egg"],
      diets: [],
      conditions: [],
      allergens: [],
      recipeLanguage: "English",
      preferredCuisine: "Any",
      calorieTarget: 2000
    });

    expect(recipePrompt).toContain("Any-cuisine rotation rule");
    expect(recipePrompt).toContain("not only Egyptian, Turkish, and Mediterranean");
    expect(recipePrompt).toContain("Italian, Mexican, Indian, Thai");
    expect(mealPlanPrompt).toContain("Any-cuisine rotation rule");
    expect(mealPlanPrompt).toContain("Do not let Egyptian + Turkish + Mediterranean together");
  });

  it("adds broad named vegetarian dinner families and respects dairy-free egg bans", () => {
    const vegetarianPrompt = buildRecipeGenerationPrompt(
      [
        { name: "black beans", quantity: "2 cups" },
        { name: "sweet potato", quantity: "2 whole" },
        { name: "mushrooms", quantity: "300g" },
        { name: "pasta", quantity: "300g" }
      ],
      {
        recipeLanguage: "English",
        preferredCuisine: "Any",
        calorieTarget: 1800,
        maxMissingIngredients: 4,
        recipeCount: 10,
        diets: ["vegetarian", "dairyFree"],
        conditions: [],
        allergens: []
      }
    );

    expect(vegetarianPrompt).toContain("Southern-inspired vegetarian dinner variety");
    expect(vegetarianPrompt).toContain("Good Food-inspired vegetarian dinner variety");
    expect(vegetarianPrompt).toContain("Everyday vegetarian dinner variety");
    expect(vegetarianPrompt).toContain("Vegetable-forward mandate");
    expect(vegetarianPrompt).toContain("Vegetable technique ladder");
    expect(vegetarianPrompt).toContain("Vegetable-specific dish map");
    expect(vegetarianPrompt).toContain("black bean enchiladas");
    expect(vegetarianPrompt).toContain("chickpea shawarma bowls");
    expect(vegetarianPrompt).toContain("mushroom curry");
    expect(vegetarianPrompt).toContain("zucchini boats");
    expect(vegetarianPrompt).toContain("broccoli oat-milk soup");
    expect(vegetarianPrompt).toContain("no eggs, and no dairy");
    expect(vegetarianPrompt).toContain("almond milk, oat milk, coconut milk");
    expect(vegetarianPrompt).toContain("vegan pancakes");
    expect(vegetarianPrompt).toContain("Do not use eggs or dairy as shortcuts");
  });

  it("adds vegetable-forward cuisine references and shawarma to Egyptian and Turkish", () => {
    expect(getCuisineDishReferenceText("Egyptian", 80)).toContain("egyptian chicken shawarma wrap");
    expect(getCuisineDishReferenceText("Egyptian", 80)).toContain("vegetarian egyptian mixed mahshi");
    expect(getCuisineDishReferenceText("Egyptian", 80)).toContain("egyptian vegetarian moussaka");

    expect(getCuisineDishReferenceText("Turkish", 80)).toContain("turkish chicken shawarma doner wrap");
    expect(getCuisineDishReferenceText("Turkish", 80)).toContain("vegetarian sarma");
    expect(getCuisineDishReferenceText("Turkish", 80)).toContain("imam bayildi");

    expect(getCuisineDishReferenceText("Italian", 80)).toContain("pasta primavera");
    expect(getCuisineDishReferenceText("Mexican", 80)).toContain("calabacitas");
    expect(getCuisineDishReferenceText("Asian", 80)).toContain("vegetable lo mein");
  });

  it("adds visual vegetarian recipe references across cuisines", () => {
    expect(getCuisineDishReferenceText("Mediterranean", 120)).toContain("avocado and chickpea salad cups");
    expect(getCuisineDishReferenceText("Mediterranean", 120)).toContain("greek salad upgrade in a jar");
    expect(getCuisineDishReferenceText("Mediterranean", 120)).toContain("creamy spicy fasolada");
    expect(getCuisineDishReferenceText("Mediterranean", 120)).toContain("yiayia's creamy pasta");
    expect(getCuisineDishReferenceText("Mediterranean", 120)).toContain("creamy greek potato salad");

    expect(getCuisineDishReferenceText("Indian", 120)).toContain("vegan palak paneer with tofu");
    expect(getCuisineDishReferenceText("Indian", 120)).toContain("vegan tikka masala");

    expect(getCuisineDishReferenceText("American", 120)).toContain("southwestern pinto bean burgers");
    expect(getCuisineDishReferenceText("American", 120)).toContain("low carb cheesy cauliflower pizza breadsticks");
    expect(getCuisineDishReferenceText("American", 120)).toContain("low carb easy eggplant lasagna");

    expect(getCuisineDishReferenceText("Mexican", 120)).toContain("easy roasted veggie tacos");
    expect(getCuisineDishReferenceText("Italian", 120)).toContain("roasted vegetables stuffed shells");
  });

  it("adds visual meat and seafood recipe references across cuisines", () => {
    const american = getCuisineDishReferenceText("American", 180);
    const asian = getCuisineDishReferenceText("Asian", 180);
    const italian = getCuisineDishReferenceText("Italian", 180);
    const mexican = getCuisineDishReferenceText("Mexican", 180);
    const mediterranean = getCuisineDishReferenceText("Mediterranean", 180);
    const middleEastern = getCuisineDishReferenceText("Middle Eastern", 180);

    expect(american).toContain("easy beef pot roast");
    expect(american).toContain("garlic butter steak and shrimp");
    expect(american).toContain("ribs with hot-pepper-jelly glaze");
    expect(american).toContain("polish lazanki");
    expect(american).toContain("orange beef lettuce wraps");
    expect(american).toContain("ground beef zucchini boats");
    expect(american).toContain("cheesy ground beef and cauliflower casserole");

    expect(asian).toContain("crispy beef bok choy stir-fry");
    expect(asian).toContain("kalbi ribs and grilled corn");
    expect(asian).toContain("beef stroganoff ramen");

    expect(italian).toContain("tuscan-style veal chops");
    expect(italian).toContain("sofrito bolognese");
    expect(italian).toContain("smothered italian sausage");
    expect(italian).toContain("ground beef lasagna");

    expect(mexican).toContain("carne asada with black beans");
    expect(mexican).toContain("churrasco with chimichurri");
    expect(mexican).toContain("frijoles peruanos");
    expect(mexican).toContain("ground beef tacos");
    expect(mexican).toContain("ground beef burritos");

    expect(mediterranean).toContain("slow-grilled rack of lamb with mustard and herbs");
    expect(middleEastern).toContain("moroccan beef kofta");
    expect(middleEastern).toContain("lebanese beef kofta");
    expect(getCuisineDishReferenceText("Indian", 180)).toContain("pakistani beef kofta curry");
  });

  it("fans out ground meat into named recipe families", () => {
    const prompt = buildRecipeGenerationPrompt(
      [{ name: "ground beef", quantity: "500g" }],
      {
        recipeLanguage: "English",
        preferredCuisine: "Any",
        calorieTarget: 1800,
        maxMissingIngredients: 5,
        recipeCount: 10,
        diets: [],
        conditions: [],
        allergens: []
      }
    );

    expect(prompt).toContain("Ground-meat distinct-card mode is active");
    expect(prompt).toContain("Sparse pantry expansion rule");
    expect(prompt).toContain("actively propose complete real recipes");
    expect(prompt).toContain("add reasonable support ingredients to missing_ingredients");
    expect(prompt).toContain("For any anchor ingredient");
    expect(prompt).toContain("proteins, seafood, eggs, dairy, legumes, grains, vegetables, fruit");
    expect(prompt).toContain("Moroccan beef kofta");
    expect(prompt).toContain("Lebanese beef kofta");
    expect(prompt).toContain("ground beef tacos");
    expect(prompt).toContain("ground beef burritos");
    expect(prompt).toContain("orange beef lettuce wraps");
    expect(prompt).toContain("ground beef zucchini boats");
    expect(prompt).toContain("cheesy ground beef cauliflower casserole");
    expect(prompt).toContain("lasagna alla bolognese");
  });

  it("prevents shrimp recipes from clustering around garlic lemon seasoning", () => {
    const prompt = buildRecipeGenerationPrompt(
      [{ name: "shrimp", quantity: "1 kg" }],
      {
        recipeLanguage: "English",
        preferredCuisine: "Any",
        calorieTarget: 1800,
        maxMissingIngredients: 5,
        recipeCount: 10,
        diets: [],
        conditions: [],
        allergens: []
      }
    );

    expect(prompt).toContain("Shrimp anti-clustering rule");
    expect(prompt).toContain("at most ONE simple garlic/lemon/cumin shrimp card");
    expect(prompt).toContain("butterfly shrimp");
    expect(prompt).toContain("sweet chili shrimp");
    expect(prompt).toContain("shrimp soup");
    expect(prompt).toContain("shrimp tacos");
    expect(prompt).toContain("Cajun shrimp boil");
  });

  it("prevents vegetarian lentil and eggplant plans from repeating mujadara only", () => {
    const prompt = buildRecipeGenerationPrompt(
      [
        { name: "lentils", quantity: "2 cups" },
        { name: "eggplant", quantity: "2 whole" },
        { name: "rice", quantity: "2 cups" },
        { name: "tomato sauce", quantity: "1 cup" }
      ],
      {
        recipeLanguage: "English",
        preferredCuisine: "Any",
        calorieTarget: 1800,
        maxMissingIngredients: 5,
        recipeCount: 10,
        diets: ["vegetarian"],
        conditions: [],
        allergens: []
      }
    );

    expect(prompt).toContain("Vegetarian lentil anti-clustering rule");
    expect(prompt).toContain("Mujadara is only one lentil family");
    expect(prompt).toContain("lentil kofta");
    expect(prompt).toContain("koshary");
    expect(prompt).toContain("Vegetarian eggplant anti-clustering rule");
    expect(prompt).toContain("pickled eggplant");
    expect(prompt).toContain("eggplant bechamel casserole");
    expect(prompt).toContain("stuffed eggplant with rice and vegetables");
  });

  it("caps rice and legume clustering in vegan weekly meal plans", () => {
    const prompt = buildMealPlanPrompt({
      pantry: ["rice", "lentils", "chickpeas", "tomato", "eggplant", "potato", "mushroom"],
      pantryItems: [
        { name: "rice", quantity: "2 cups" },
        { name: "lentils", quantity: "2 cups" },
        { name: "chickpeas", quantity: "2 cans" },
        { name: "eggplant", quantity: "2 whole" },
        { name: "potato", quantity: "4 whole" },
        { name: "mushroom", quantity: "300g" }
      ],
      diets: ["vegan", "vegetarian", "dairyFree"],
      conditions: [],
      allergens: [],
      preferredCuisine: "Any"
    });

    expect(prompt).toContain("Plant-based weekly variety cap");
    expect(prompt).toContain("do not let rice appear in more than about one-third");
    expect(prompt).toContain("potatoes, pasta, noodles, quinoa");
  });

  it("ignores pantry items that conflict with the selected weekly-plan diet", () => {
    const prompt = buildMealPlanPrompt({
      pantry: ["chicken", "ground beef", "zucchini", "mushrooms", "tomato", "pasta"],
      pantryItems: [
        { name: "chicken", quantity: "1 kg" },
        { name: "ground beef", quantity: "500g" },
        { name: "zucchini", quantity: "3 whole" },
        { name: "mushrooms", quantity: "300g" },
        { name: "tomato", quantity: "4 whole" },
        { name: "pasta", quantity: "500g" }
      ],
      diets: ["vegetarian"],
      conditions: [],
      allergens: [],
      preferredCuisine: "Italian",
      recipeLanguage: "English"
    });

    expect(prompt).toContain("Diet-first pantry mode");
    expect(prompt).toContain("Pantry cannot override user preference");
    expect(prompt).toContain("Diet-compatible pantry items for this user: zucchini, mushrooms, tomato, pasta.");
    expect(prompt).toContain("Ignored pantry items for this plan because they conflict");
    expect(prompt).toContain("chicken, ground beef");

    const arabicPrompt = buildMealPlanPrompt({
      pantry: ["chicken", "ground beef", "zucchini", "mushrooms", "tomato", "pasta"],
      pantryItems: [
        { name: "chicken", quantity: "1 kg" },
        { name: "ground beef", quantity: "500g" },
        { name: "zucchini", quantity: "3 whole" },
        { name: "mushrooms", quantity: "300g" },
        { name: "tomato", quantity: "4 whole" },
        { name: "pasta", quantity: "500g" }
      ],
      diets: ["vegetarian"],
      conditions: [],
      allergens: [],
      preferredCuisine: "Italian",
      recipeLanguage: "Arabic"
    });

    expect(arabicPrompt).toContain("مكونات المستخدم المتوافقة مع النظام الغذائي");
    expect(arabicPrompt).toContain("zucchini, mushrooms, tomato, pasta");
    expect(arabicPrompt).toContain("Ignored pantry items for this plan because they conflict");
  });

  it("requires recipe photo identity and supports empty-pantry meal planning", () => {
    const recipePrompt = buildRecipeGenerationPrompt(
      [{ name: "Chicken", quantity: "1 kg" }],
      {
        recipeLanguage: "English",
        preferredCuisine: "Italian",
        calorieTarget: 1650,
        maxMissingIngredients: 5,
        recipeCount: 5,
        diets: [],
        conditions: ["cholesterol", "highBloodPressure", "weightLoss"],
        allergens: []
      }
    );
    const mealPlanPrompt = buildMealPlanPrompt({
      pantry: [],
      pantryItems: [],
      diets: [],
      conditions: ["cholesterol", "highBloodPressure", "weightLoss"],
      allergens: [],
      preferredCuisine: "Italian"
    });

    expect(recipePrompt).toContain("Every recipe MUST also include a photo_identity object");
    expect(recipePrompt).toContain("Each recipe object must include: name, cuisine, dish_intent, photo_identity");
    expect(mealPlanPrompt).toContain("Empty-or-incompatible-pantry creative mode");
    expect(mealPlanPrompt).toContain("Build a full shoppingList");
  });

  it("teaches vegetarian mahshi and sarma as stuffed dish families", () => {
    const prompt = buildRecipeGenerationPrompt(
      [
        { name: "grape leaves", quantity: "1 jar" },
        { name: "cabbage", quantity: "1 head" },
        { name: "rice", quantity: "2 cups" },
        { name: "tomato", quantity: "4 whole" }
      ],
      {
        recipeLanguage: "English",
        preferredCuisine: "Any",
        calorieTarget: 1800,
        maxMissingIngredients: 5,
        recipeCount: 10,
        diets: ["vegan", "vegetarian", "dairyFree"],
        conditions: [],
        allergens: []
      }
    );

    expect(prompt).toContain("Vegetarian stuffed knowledge");
    expect(prompt).toContain("mahshi, sarma, dolma");
    expect(prompt).toContain("pickled stuffed eggplant");
    expect(prompt).toContain("Do not add meat to mahshi, sarma, dolma");
  });

  it("prevents chicken recipes from clustering around plain grilled chicken", () => {
    const prompt = buildRecipeGenerationPrompt(
      [{ name: "chicken", quantity: "1 kg" }],
      {
        recipeLanguage: "English",
        preferredCuisine: "Any",
        calorieTarget: 1800,
        maxMissingIngredients: 5,
        recipeCount: 10,
        diets: [],
        conditions: [],
        allergens: []
      }
    );

    expect(prompt).toContain("Chicken distinct-card mode is active");
    expect(prompt).toContain("at most ONE plain grilled");
    expect(prompt).toContain("chicken negresco pasta");
    expect(prompt).toContain("stuffed fried chicken cutlet");
    expect(prompt).toContain("sweet and sour chicken");
    expect(prompt).toContain("honey garlic chicken");
    expect(prompt).toContain("sweet chili chicken");
    expect(prompt).toContain("creamy chicken soup");
    expect(prompt).toContain("BBQ chicken");
  });

  it("keeps missing ingredients from replacing the scanned chicken protein", () => {
    const prompt = buildRecipeGenerationPrompt(
      [
        { name: "فراخ", quantity: "1 kg" },
        { name: "عيش", quantity: "4 pieces" },
        { name: "طماطم", quantity: "3 whole" },
        { name: "بصل", quantity: "2 whole" }
      ],
      {
        recipeLanguage: "Arabic",
        preferredCuisine: "Egyptian",
        calorieTarget: 2000,
        maxMissingIngredients: 5,
        recipeCount: 5,
        diets: [],
        conditions: [],
        allergens: []
      }
    );

    expect(prompt).toContain("Missing-ingredient boundary");
    expect(prompt).toContain("If the pantry contains chicken, keep chicken-centered recipes");
    expect(prompt).toContain("do not output ground meat, beef, lamb, fish, shrimp, egg, or dairy-centered dishes");
  });

  it("requires exact potato forms in generated recipe photo identities", () => {
    const prompt = buildRecipeGenerationPrompt(
      [{ name: "potatoes", quantity: "1 kg" }],
      {
        recipeLanguage: "English",
        preferredCuisine: "Any",
        calorieTarget: 1800,
        maxMissingIngredients: 5,
        recipeCount: 10,
        diets: [],
        conditions: [],
        allergens: []
      }
    );

    expect(prompt).toContain("Potato visual-form ladder");
    expect(prompt).toContain("fries");
    expect(prompt).toContain("smashed crispy potatoes");
    expect(prompt).toContain("Turkish kumpir/compir stuffed baked potato");
    expect(prompt).toContain("potato bechamel casserole");
    expect(prompt).toContain("do not use generic potato recipe");
  });

  it("treats empty or sparse pantry as a varied cuisine and diet brief", () => {
    const emptyPantryPrompt = buildRecipeGenerationPrompt([], {
      recipeLanguage: "English",
      preferredCuisine: "Italian",
      calorieTarget: 1800,
      maxMissingIngredients: 5,
      recipeCount: 10,
      diets: ["heartHealthy"],
      conditions: ["high cholesterol"],
      allergens: []
    });
    const shrimpPrompt = buildRecipeGenerationPrompt(
      [{ name: "shrimp", quantity: "1 kg" }],
      {
        recipeLanguage: "English",
        preferredCuisine: "Any",
        calorieTarget: 1800,
        maxMissingIngredients: 5,
        recipeCount: 10,
        diets: [],
        conditions: [],
        allergens: []
      }
    );

    expect(emptyPantryPrompt).toContain("Sparse/empty pantry productivity rule");
    expect(emptyPantryPrompt).toContain("treat Italian, diets, allergens, health conditions, and calorie target as creative design constraints");
    expect(emptyPantryPrompt).toContain("Health adaptation rule");
    expect(emptyPantryPrompt).toContain("Dish-promise integrity rule");
    expect(shrimpPrompt).toContain("at least 6 visible forms");
    expect(shrimpPrompt).toContain("BBQ or smoked");
    expect(shrimpPrompt).toContain("breaded or crusted");
    expect(shrimpPrompt).toContain("saucy or glazed");
  });
});
