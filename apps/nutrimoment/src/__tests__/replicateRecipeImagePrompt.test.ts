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
});
