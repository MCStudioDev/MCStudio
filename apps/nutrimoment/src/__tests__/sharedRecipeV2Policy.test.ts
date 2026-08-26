import { describe, expect, it } from "vitest";
import type { RecipeCatalogDoc } from "@/lib/domain";
import { RECIPE_CONTENT_VERSION } from "@/services/recipeContentQualityService";
import { RECIPE_PHOTO_ASSET_VALIDATOR_HASH } from "@/services/recipePhotoReusePolicy";
import {
  SHARED_RECIPE_VALIDATOR_HASH
} from "@/services/sharedRecipePoolQualityService";
import {
  buildSharedRecipeV2Document,
  isSharedRecipeV2Searchable,
  mergeSharedRecipeV2Results,
  planSharedRecipeV2Fulfillment
} from "@/services/sharedRecipeV2PolicyService";

function recipe(id: string, title: string): RecipeCatalogDoc {
  return {
    id,
    title,
    slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    description: `${title} recipe`,
    ingredients: [
      { canonical: "rice", name: "1 cup rice", quantity: 1, required: true, unit: "cup" }
    ],
    ingredientCanonicals: ["rice"],
    ingredientLookupCanonicals: ["rice"],
    requiredCanonicals: ["rice"],
    optionalCanonicals: [],
    dietTags: ["vegan", "vegetarian", "dairy-free"],
    allergenTags: [],
    mealType: "dinner",
    cuisine: "Egyptian",
    prepMinutes: 10,
    cookMinutes: 20,
    totalMinutes: 30,
    difficulty: "easy",
    calories: 400,
    protein: 12,
    carbs: 65,
    fat: 8,
    calorieBand: "301_500",
    servings: 4,
    steps: ["Rinse the rice.", "Cook the rice for 20 minutes."],
    image: {
      storagePath: "",
      status: "pending"
    },
    source: { provider: "premium-validated" },
    searchTokens: [title.toLowerCase(), "rice"],
    popularityScore: 70,
    qualityScore: 90,
    qualityStatus: "verified",
    contentVersion: RECIPE_CONTENT_VERSION,
    validatorHash: SHARED_RECIPE_VALIDATOR_HASH,
    isActive: true,
    createdAt: 1,
    updatedAt: 1
  };
}

function withReadyPhoto(source: RecipeCatalogDoc): RecipeCatalogDoc {
  const imageUrl = `https://firebasestorage.googleapis.com/v0/b/nutrimoment/o/shared-recipes-v2%2F${source.id}%2Fphoto.webp?alt=media`;
  return {
    ...source,
    image: {
      ...source.image,
      source: "replicate",
      sourceQuery: source.title,
      status: "ready",
      storagePath: imageUrl,
      thumbPath: imageUrl,
      validatedAt: 10,
      validatorHash: RECIPE_PHOTO_ASSET_VALIDATOR_HASH
    }
  };
}

describe("shared recipe V2 policy", () => {
  it("keeps a recipe out of search until its exact photo is ready", () => {
    const pending = buildSharedRecipeV2Document(recipe("recipe-1", "Koshary"));
    const published = buildSharedRecipeV2Document(withReadyPhoto(recipe("recipe-1", "Koshary")));

    expect(pending.publicationStatus).toBe("pending_photo");
    expect(isSharedRecipeV2Searchable(pending)).toBe(false);
    expect(published.publicationStatus).toBe("published");
    expect(isSharedRecipeV2Searchable(published)).toBe(true);
  });

  it("publishes the same hierarchical ingredient lookup keys used by retrieval", () => {
    const source = recipe("recipe-1", "Kofta Kebab");
    const published = buildSharedRecipeV2Document({
      ...source,
      ingredientCanonicals: ["ground beef", "rice"],
      ingredientLookupCanonicals: ["ground beef", "rice"],
      requiredCanonicals: ["ground beef", "rice"]
    });

    expect(published.ingredientLookupCanonicals).toEqual(expect.arrayContaining([
      "ground beef",
      "ground meat",
      "beef",
      "meat",
      "rice"
    ]));
  });

  it("removes stale meat-family tags from recipes that only contain ground spices", () => {
    const source = recipe("recipe-1", "Spiced Tomato Rice");
    const published = buildSharedRecipeV2Document({
      ...source,
      ingredientCanonicals: ["rice", "tomato", "ground cumin"],
      ingredientLookupCanonicals: ["rice", "tomato", "ground cumin", "ground meat", "meat"],
      requiredCanonicals: ["rice", "tomato", "ground cumin"]
    });

    expect(published.ingredientLookupCanonicals).not.toContain("ground meat");
    expect(published.ingredientLookupCanonicals).not.toContain("meat");
  });

  it("returns available V2 matches to free users without creating a Gemini deficit", () => {
    const plan = planSharedRecipeV2Fulfillment({
      canGenerateDeficit: false,
      matches: ["one", "two", "three"],
      requestedCount: 10
    });

    expect(plan.existing).toEqual(["one", "two", "three"]);
    expect(plan.generationDeficit).toBe(0);
    expect(plan.unfilledCount).toBe(7);
  });

  it("asks premium generation for only the missing V2 count", () => {
    const plan = planSharedRecipeV2Fulfillment({
      canGenerateDeficit: true,
      matches: ["one", "two", "three"],
      requestedCount: 10
    });

    expect(plan.existing).toEqual(["one", "two", "three"]);
    expect(plan.generationDeficit).toBe(7);
    expect(plan.unfilledCount).toBe(7);
  });

  it("gives a credited free action the same V2 deficit as premium", () => {
    const creditedFreeAction = planSharedRecipeV2Fulfillment({
      canGenerateDeficit: true,
      matches: ["one", "two", "three"],
      requestedCount: 10
    });
    const premiumAction = planSharedRecipeV2Fulfillment({
      canGenerateDeficit: true,
      matches: ["one", "two", "three"],
      requestedCount: 10
    });

    expect(creditedFreeAction).toEqual(premiumAction);
    expect(creditedFreeAction.generationDeficit).toBe(7);
  });

  it("serves the identical validated V2 matches to free and premium users", () => {
    const matches = ["one", "two", "three", "four", "five", "six", "seven"];
    const freePlan = planSharedRecipeV2Fulfillment({
      canGenerateDeficit: false,
      matches,
      requestedCount: 10
    });
    const premiumPlan = planSharedRecipeV2Fulfillment({
      canGenerateDeficit: true,
      matches,
      requestedCount: 10
    });

    expect(freePlan.existing).toEqual(premiumPlan.existing);
    expect(freePlan.unfilledCount).toBe(premiumPlan.unfilledCount);
    expect(freePlan.generationDeficit).toBe(0);
    expect(premiumPlan.generationDeficit).toBe(3);
  });

  it("never asks Gemini to regenerate a complete V2 result set", () => {
    const plan = planSharedRecipeV2Fulfillment({
      canGenerateDeficit: true,
      matches: Array.from({ length: 12 }, (_, index) => `recipe-${index}`),
      requestedCount: 10
    });

    expect(plan.existing).toHaveLength(10);
    expect(plan.generationDeficit).toBe(0);
    expect(plan.unfilledCount).toBe(0);
  });

  it("merges new premium recipes after V2 matches without duplicates", () => {
    const existing = [
      { id: "one", name: "Koshary" },
      { id: "two", name: "Ful Medames" }
    ];
    const generated = [
      { id: "two", name: "Ful Medames" },
      { id: "three", name: "Fattah" }
    ];

    expect(mergeSharedRecipeV2Results(existing, generated, 3)).toEqual([
      existing[0],
      existing[1],
      generated[1]
    ]);
  });

  it("increments the V2 version only when corrected recipe content changes", () => {
    const initial = buildSharedRecipeV2Document(withReadyPhoto(recipe("recipe-1", "Koshary")));
    const unchanged = buildSharedRecipeV2Document(initial, initial);
    const corrected = buildSharedRecipeV2Document({
      ...initial,
      steps: [...initial.steps, "Rest for 5 minutes before serving."]
    }, initial);

    expect(initial.version).toBe(1);
    expect(unchanged.version).toBe(1);
    expect(corrected.version).toBe(2);
    expect(corrected.contentHash).not.toBe(initial.contentHash);
  });
});
