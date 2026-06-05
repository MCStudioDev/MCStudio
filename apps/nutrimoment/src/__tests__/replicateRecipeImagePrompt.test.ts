import { describe, expect, it } from "vitest";
import { buildRecipePhotoIdentity } from "../lib/recipePhotoIdentity";
import {
  buildRecipeImageNegativePromptForTest,
  buildRecipeImagePromptForTest
} from "../lib/replicateRecipeImage";

describe("replicate recipe image prompts", () => {
  it("does not ask Replicate to draw eggs for vegan shakshuka", () => {
    const prompt = buildRecipeImagePromptForTest(
      "vegan shakshuka",
      ["tomato", "bell pepper", "onion", "chickpeas", "olive oil"],
      { exactRecipeName: "Vegan Shakshuka with Chickpeas" }
    );
    const negativePrompt = buildRecipeImageNegativePromptForTest("vegan shakshuka", [
      "tomato",
      "bell pepper",
      "onion",
      "chickpeas",
      "olive oil"
    ]);

    expect(prompt).toContain("vegan shakshuka");
    expect(prompt).toContain("eggless vegan tomato skillet");
    expect(prompt).toContain("no whole eggs");
    expect(prompt).toContain("Do not show or imply: eggs");
    expect(negativePrompt).toContain("egg yolks");
    expect(negativePrompt).toContain("cheese");
  });

  it("forces soup recipes to render as soup in a bowl", () => {
    const prompt = buildRecipeImagePromptForTest(
      "mushroom vegetable soup",
      ["mushrooms", "carrot", "celery", "vegetable broth"],
      { exactRecipeName: "Mushroom Vegetable Soup" }
    );

    expect(prompt).toContain("served in a bowl with visible liquid");
    expect(prompt).toContain("deep bowl or soup crock");
    expect(prompt).toContain("do not show dry sauteed vegetables");
    expect(prompt).toContain("the vessel and liquid must make it unmistakably soup");
  });

  it("describes exact potato forms for Replicate", () => {
    const friesPrompt = buildRecipeImagePromptForTest("crispy french fries", ["potatoes", "oil", "salt"], {
      exactRecipeName: "Crispy French Fries"
    });
    const smashedPrompt = buildRecipeImagePromptForTest("smashed potatoes", ["potatoes", "olive oil"], {
      exactRecipeName: "Smashed Potatoes"
    });
    const kumpirPrompt = buildRecipeImagePromptForTest("Turkish kumpir", ["potatoes", "corn", "pickles"], {
      exactRecipeName: "Turkish Kumpir"
    });
    const negativePrompt = buildRecipeImageNegativePromptForTest("crispy french fries", ["potatoes", "oil"]);

    expect(friesPrompt).toContain("long thin potato sticks");
    expect(friesPrompt).toContain("not wedges, cubes, mash");
    expect(smashedPrompt).toContain("pressed flat into irregular discs");
    expect(smashedPrompt).toContain("not smooth mashed potatoes");
    expect(kumpirPrompt).toContain("large baked potato split open");
    expect(kumpirPrompt).toContain("stuffed baked potato");
    expect(negativePrompt).toContain("wrong potato form");
    expect(negativePrompt).toContain("smashed potatoes");
  });

  it("locks hawawshi variants to opened stuffed bread with ground meat inside", () => {
    const prompt = buildRecipeImagePromptForTest(
      "Alexandrian baladi hawawshi",
      ["baladi bread", "ground beef", "onion", "cumin", "pepper"],
      { exactRecipeName: "Alexandrian Baladi Hawawshi" }
    );
    const identity = buildRecipePhotoIdentity("Alexandrian baladi hawawshi");

    expect(identity.canonicalDishKey).toBe("hawawshi");
    expect(prompt).toContain("bread opened, cut in half, or cut into triangular wedges");
    expect(prompt).toContain("spiced minced meat filling visible inside the bread");
    expect(prompt).toContain("not an open flatbread");
    expect(prompt).toContain("No toppings should sit on top");
    expect(prompt).toContain("random flatbread with toppings");
  });

  it("translates Arabic stew terms before prompting Replicate", () => {
    const prompt = buildRecipeImagePromptForTest(
      "يخنة عدس بالخضار",
      ["عدس", "خضار", "مرقة"],
      { exactRecipeName: "يخنة عدس بالخضار" }
    );
    const negativePrompt = buildRecipeImageNegativePromptForTest("يخنة عدس بالخضار", ["عدس", "خضار", "مرقة"]);
    const identity = buildRecipePhotoIdentity("يخنة عدس بالخضار");

    expect(identity.mealTypeKey).toBe("stew");
    expect(prompt).toContain("يخنة / يخنه / yakhna means a savory stew or soup-like dish");
    expect(prompt).toContain("never a dessert");
    expect(prompt).toContain("served in a bowl with visible liquid");
    expect(prompt).toContain("lentils suspended in the soup");
    expect(negativePrompt).toContain("dessert");
    expect(negativePrompt).toContain("sweet pudding");
  });

  it("locks Arabic lentil yakhna to soup instead of rice or chicken tenders", () => {
    const yakhnaAdas = "\u064a\u062e\u0646\u0647 \u0639\u062f\u0633";
    const prompt = buildRecipeImagePromptForTest(yakhnaAdas, ["\u0639\u062f\u0633", "\u0645\u0631\u0642\u0629"], {
      exactRecipeName: yakhnaAdas
    });
    const negativePrompt = buildRecipeImageNegativePromptForTest(yakhnaAdas, ["\u0639\u062f\u0633", "\u0645\u0631\u0642\u0629"]);

    expect(prompt).toContain("lentil soup in a bowl");
    expect(prompt).toContain("lentils suspended in the soup");
    expect(prompt).toContain("not dry beans on a plate");
    expect(prompt).toContain("do not show chicken tenders");
    expect(negativePrompt).toContain("dry rice plate");
    expect(negativePrompt).toContain("chicken tenders");
    expect(negativePrompt).toContain("no visible liquid");
  });

  it("translates Arabic macaroni terms as pasta", () => {
    const prompt = buildRecipeImagePromptForTest(
      "معكرونة بالصلصة",
      ["معكرونة", "صلصة طماطم"],
      { exactRecipeName: "معكرونة بالصلصة" }
    );
    const negativePrompt = buildRecipeImageNegativePromptForTest("معكرونة بالصلصة", ["معكرونة", "صلصة طماطم"]);
    const identity = buildRecipePhotoIdentity("معكرونة بالصلصة");

    expect(identity.mealTypeKey).toBe("pasta");
    expect(identity.starchKey).toBe("pasta");
    expect(prompt).toContain("معكرونة / مكرونة / makarona means pasta or macaroni");
    expect(prompt).toContain("Present it as a pasta dish");
    expect(prompt).toContain("pasta/macaroni (arabic: makarona)");
    expect(negativePrompt).not.toContain("pasta, spaghetti, noodles, macaroni");
  });

  it("keeps ful medames as coarse mashed fava puree instead of whole beans", () => {
    const prompt = buildRecipeImagePromptForTest(
      "فول مدمس بالطماطم",
      ["فول", "طماطم", "زيت زيتون", "كمون"],
      { exactRecipeName: "فول مدمس بالطماطم" }
    );
    const identity = buildRecipePhotoIdentity("فول مدمس بالطماطم");

    expect(identity.canonicalDishKey).toBe("alexandrian-ful");
    expect(prompt).toContain("crushed ful medames fava bean mash");
    expect(prompt).toContain("mashed fava texture rather than intact beans");
    expect(prompt).toContain("plain whole brown beans");
    expect(prompt).toContain("ful medames fava bean mash");
  });

  it("routes specific ful variants before plain ful medames", () => {
    expect(buildRecipePhotoIdentity("ful bil zeit").canonicalDishKey).toBe("ful-bil-zeit");
    expect(buildRecipePhotoIdentity("spicy ful with tahini lemon cumin").canonicalDishKey).toBe("spicy-ful-bil-zeit");
    expect(buildRecipePhotoIdentity("ful sandwich in baladi bread").canonicalDishKey).toBe("ful-sandwich");
    expect(buildRecipePhotoIdentity("plain ful mudammas").canonicalDishKey).toBe("ful-medames");
  });

  it("reads Arabic avocado tomato toast as toast, not rice", () => {
    const arabicTitle = "\u0623\u0641\u0648\u0643\u0627\u062f\u0648 \u0637\u0645\u0627\u0637\u0645 \u0633\u0627\u0648\u0631\u062f\u0648\u063a \u062a\u0648\u0633\u062a";
    const identity = buildRecipePhotoIdentity(arabicTitle);
    const prompt = buildRecipeImagePromptForTest(arabicTitle, ["\u0623\u0641\u0648\u0643\u0627\u062f\u0648", "\u0637\u0645\u0627\u0637\u0645", "\u062a\u0648\u0633\u062a"], {
      exactRecipeName: arabicTitle
    });

    expect(identity.canonicalDishKey).toBe("avocado-tomato-toast");
    expect(identity.starchKey).toBe("bread");
    expect(prompt).toContain("avocado tomato sourdough toast");
    expect(prompt).toContain("bread must be clearly visible");
    expect(prompt).toContain("not a rice plate");
    expect(prompt).toContain("Do not show or imply: rice");
  });

  it("reads Arabic eggplant tomato pasta as eggplant pasta, not plain red sauce pasta", () => {
    const arabicTitle = "\u0628\u0627\u0630\u0646\u062c\u0627\u0646 \u0637\u0645\u0627\u0637\u0645 \u0645\u0643\u0631\u0648\u0646\u0629 \u0635\u064a\u0646\u064a\u0629";
    const identity = buildRecipePhotoIdentity(arabicTitle);
    const prompt = buildRecipeImagePromptForTest(arabicTitle, ["\u0628\u0627\u0630\u0646\u062c\u0627\u0646", "\u0637\u0645\u0627\u0637\u0645", "\u0645\u0643\u0631\u0648\u0646\u0629"], {
      exactRecipeName: arabicTitle
    });

    expect(identity.canonicalDishKey).toBe("eggplant-tomato-pasta");
    expect(identity.starchKey).toBe("pasta");
    expect(prompt).toContain("eggplant tomato pasta");
    expect(prompt).toContain("visible chunks or slices of roasted or sauteed eggplant");
    expect(prompt).toContain("rather than plain red sauce pasta");
    expect(prompt).toContain("Do not show or imply: plain pasta with only red sauce");
  });

  it("keeps koshary visually complete instead of plain lentil rice", () => {
    const identity = buildRecipePhotoIdentity("\u0643\u0634\u0631\u064a \u0645\u0635\u0631\u064a");
    const prompt = buildRecipeImagePromptForTest(
      "\u0643\u0634\u0631\u064a \u0645\u0635\u0631\u064a",
      ["\u0623\u0631\u0632", "\u0639\u062f\u0633"],
      { exactRecipeName: "\u0643\u0634\u0631\u064a \u0645\u0635\u0631\u064a" }
    );

    expect(identity.canonicalDishKey).toBe("koshary");
    expect(prompt).toContain("short macaroni pasta");
    expect(prompt).toContain("whole chickpeas");
    expect(prompt).toContain("red tomato sauce topping");
    expect(prompt).toContain("crispy fried onions");
    expect(prompt).toContain("plain lentil rice");
  });

  it("uses stable English visual identities for vegetarian catalog examples", () => {
    const palakIdentity = buildRecipePhotoIdentity("Vegan Palak Paneer With Tofu");
    const palakPrompt = buildRecipeImagePromptForTest(
      "Vegan Palak Paneer With Tofu",
      ["tofu", "spinach", "tomato", "coconut milk"],
      { exactRecipeName: "Vegan Palak Paneer With Tofu" }
    );
    const shellsIdentity = buildRecipePhotoIdentity("Roasted Vegetables Stuffed Shells");
    const shellsPrompt = buildRecipeImagePromptForTest(
      "Roasted Vegetables Stuffed Shells",
      ["pasta shells", "roasted vegetables", "tomato sauce", "tofu ricotta"],
      { exactRecipeName: "Roasted Vegetables Stuffed Shells" }
    );
    const tacosPrompt = buildRecipeImagePromptForTest(
      "Easy Roasted Veggie Tacos",
      ["corn tortillas", "cauliflower", "sweet potato", "beans", "avocado"],
      { exactRecipeName: "Easy Roasted Veggie Tacos" }
    );

    expect(palakIdentity.canonicalDishKey).toBe("vegan-palak-tofu");
    expect(palakPrompt).toContain("green spinach curry gravy");
    expect(palakPrompt).toContain("Tofu cubes must be visible");
    expect(palakPrompt).toContain("Do not show or imply: paneer cheese");

    expect(shellsIdentity.canonicalDishKey).toBe("roasted-vegetable-stuffed-shells");
    expect(shellsPrompt).toContain("large jumbo pasta shells filled with roasted vegetables");
    expect(shellsPrompt).toContain("shell shape and filling must be visible");
    expect(shellsPrompt).toContain("Do not show or imply: spaghetti");

    expect(tacosPrompt).toContain("corn tortillas filled with roasted cauliflower");
    expect(tacosPrompt).toContain("Do not show or imply: meat tacos");
  });

  it("uses stable English visual identities for meat catalog examples", () => {
    const surfIdentity = buildRecipePhotoIdentity("Garlic Butter Steak and Shrimp");
    const surfPrompt = buildRecipeImagePromptForTest(
      "Garlic Butter Steak and Shrimp",
      ["steak", "shrimp", "garlic", "parsley", "lemon"],
      { exactRecipeName: "Garlic Butter Steak and Shrimp" }
    );
    const ribsIdentity = buildRecipePhotoIdentity("Ribs with Hot-Pepper-Jelly Glaze");
    const ribsPrompt = buildRecipeImagePromptForTest(
      "Ribs with Hot-Pepper-Jelly Glaze",
      ["ribs", "hot pepper jelly", "spice rub", "herbs"],
      { exactRecipeName: "Ribs with Hot-Pepper-Jelly Glaze" }
    );
    const kalbiPrompt = buildRecipeImagePromptForTest(
      "Kalbi Ribs and Grilled Corn with Kalbi Butter",
      ["short ribs", "corn", "soy sauce", "scallion", "sesame"],
      { exactRecipeName: "Kalbi Ribs and Grilled Corn with Kalbi Butter" }
    );
    const lazankiPrompt = buildRecipeImagePromptForTest(
      "Polish Lazanki",
      ["pasta", "cabbage", "mushrooms", "kielbasa", "dill"],
      { exactRecipeName: "Polish Lazanki" }
    );

    expect(surfIdentity.canonicalDishKey).toBe("garlic-butter-steak-shrimp");
    expect(surfPrompt).toContain("Both steak and shrimp must be visible");
    expect(surfPrompt).toContain("Do not show or imply: steak alone");

    expect(ribsIdentity.canonicalDishKey).toBe("ribs-hot-pepper-jelly-glaze");
    expect(ribsPrompt).toContain("visible bones and a red-orange sticky hot pepper jelly glaze");
    expect(ribsPrompt).toContain("Do not show or imply: plain steak");

    expect(kalbiPrompt).toContain("Korean-style cross-cut beef short ribs");
    expect(kalbiPrompt).toContain("grilled corn");

    expect(lazankiPrompt).toContain("wide square or ribbon pasta tossed with cabbage");
    expect(lazankiPrompt).toContain("Do not show or imply: Italian red sauce pasta");
  });

  it("uses stable English visual identities for ground meat variants", () => {
    const lettuceIdentity = buildRecipePhotoIdentity("Orange Beef Lettuce Wraps");
    const lettucePrompt = buildRecipeImagePromptForTest(
      "Orange Beef Lettuce Wraps",
      ["ground beef", "lettuce", "carrot", "scallion", "orange sauce"],
      { exactRecipeName: "Orange Beef Lettuce Wraps" }
    );
    const zucchiniIdentity = buildRecipePhotoIdentity("Ground Beef Zucchini Boats");
    const zucchiniPrompt = buildRecipeImagePromptForTest(
      "Ground Beef Zucchini Boats",
      ["ground beef", "zucchini", "tomato sauce", "bell pepper"],
      { exactRecipeName: "Ground Beef Zucchini Boats" }
    );
    const burritoPrompt = buildRecipeImagePromptForTest(
      "Ground Beef Burritos",
      ["ground beef", "flour tortillas", "beans", "salsa"],
      { exactRecipeName: "Ground Beef Burritos" }
    );
    const lasagnaPrompt = buildRecipeImagePromptForTest(
      "Lasagna alla Bolognese",
      ["ground beef", "lasagna sheets", "tomato sauce", "bechamel"],
      { exactRecipeName: "Lasagna alla Bolognese" }
    );

    expect(lettuceIdentity.canonicalDishKey).toBe("orange-beef-lettuce-wraps");
    expect(lettucePrompt).toContain("large crisp lettuce leaves shaped as cups");
    expect(lettucePrompt).toContain("browned crumbled ground beef");
    expect(lettucePrompt).toContain("Do not show or imply: tacos");

    expect(zucchiniIdentity.canonicalDishKey).toBe("ground-beef-zucchini-boats");
    expect(zucchiniPrompt).toContain("zucchini halves hollowed into long green boats");
    expect(zucchiniPrompt).toContain("The zucchini boat structure must be visible");
    expect(zucchiniPrompt).toContain("Do not show or imply: loose ground beef skillet");

    expect(burritoPrompt).toContain("Show one burrito cut open");
    expect(burritoPrompt).toContain("Do not show or imply: open tacos");

    expect(lasagnaPrompt).toContain("layered lasagna with pasta sheets");
    expect(lasagnaPrompt).toContain("red ground-beef ragu");
    expect(lasagnaPrompt).toContain("Do not show or imply: plain spaghetti");
  });

  it("uses distinct visual identities for kofta variants", () => {
    const moroccanPrompt = buildRecipeImagePromptForTest(
      "Moroccan Beef Kofta",
      ["ground beef", "parsley", "cumin", "lemon"],
      { exactRecipeName: "Moroccan Beef Kofta" }
    );
    const lebanesePrompt = buildRecipeImagePromptForTest(
      "Lebanese Beef Kofta",
      ["ground beef", "parsley", "onion", "pita"],
      { exactRecipeName: "Lebanese Beef Kofta" }
    );
    const curryIdentity = buildRecipePhotoIdentity("Pakistani Beef Kofta Curry");
    const curryPrompt = buildRecipeImagePromptForTest(
      "Pakistani Beef Kofta Curry",
      ["ground beef", "tomato", "onion", "spices", "cilantro"],
      { exactRecipeName: "Pakistani Beef Kofta Curry" }
    );

    expect(buildRecipePhotoIdentity("Moroccan Beef Kofta").canonicalDishKey).toBe("moroccan-beef-kofta");
    expect(moroccanPrompt).toContain("grilled Moroccan beef kofta");
    expect(moroccanPrompt).toContain("oval patties or short logs");
    expect(moroccanPrompt).toContain("Do not show or imply: burger patty");

    expect(buildRecipePhotoIdentity("Lebanese Beef Kofta").canonicalDishKey).toBe("lebanese-beef-kofta");
    expect(lebanesePrompt).toContain("Lebanese kafta");
    expect(lebanesePrompt).toContain("long kebab logs or skewers");

    expect(curryIdentity.canonicalDishKey).toBe("pakistani-beef-kofta-curry");
    expect(curryPrompt).toContain("round ground-beef kofta meatballs");
    expect(curryPrompt).toContain("thick spiced tomato-onion curry gravy");
    expect(curryPrompt).toContain("Do not show or imply: dry grilled kofta");
  });
});
