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
});
