import { describe, expect, it } from "vitest";
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
});
