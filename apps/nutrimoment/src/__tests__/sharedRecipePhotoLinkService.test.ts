import { describe, expect, it } from "vitest";
import type { RecipeCatalogDoc } from "@/lib/domain";
import { isReusableSharedRecipePhotoEntry, type SharedRecipePhotoEntry } from "@/lib/sharedRecipePhotoCache";
import { auditSharedRecipePoolDocument } from "@/services/sharedRecipePoolQualityService";
import { createPremiumRecipeValidationReceipt } from "@/services/recipeValidationContractService";
import { mapCatalogRecipeToUiRecipe } from "@/services/recipeSearchService";
import {
  buildLinkedSharedRecipePhotoUpdate,
  buildSharedRecipePhotoLinkSearchTokens,
  canLinkGeneratedPhotoToSharedRecipe,
  validateSharedRecipePhotoCandidate,
  type SharedRecipePhotoLinkInput
} from "@/services/sharedRecipePhotoLinkService";

function validatedShrimpFriedRice(): RecipeCatalogDoc {
  const source: RecipeCatalogDoc = {
    id: "shared-shrimp-fried-rice",
    title: "Shrimp Fried Rice",
    slug: "shrimp-fried-rice",
    description: "Asian shrimp fried rice with vegetables.",
    ingredients: [
      { name: "1 lb shrimp", canonical: "shrimp", quantity: 1, unit: "lb", required: true },
      { name: "2 cups rice", canonical: "rice", quantity: 2, unit: "cups", required: true },
      { name: "1 cup vegetables", canonical: "vegetables", quantity: 1, unit: "cup", required: true }
    ],
    ingredientCanonicals: ["shrimp", "rice", "vegetables"],
    requiredCanonicals: ["shrimp", "rice", "vegetables"],
    optionalCanonicals: [],
    dietTags: ["pescatarian"],
    allergenTags: ["shellfish"],
    mealType: "lunch",
    cuisine: "Asian",
    prepMinutes: 15,
    cookMinutes: 20,
    totalMinutes: 35,
    difficulty: "medium",
    calories: 480,
    protein: 25,
    carbs: 65,
    fat: 12,
    calorieBand: "301_500",
    servings: 4,
    steps: [
      "Rinse and cook the rice, then spread it on a tray to cool before frying.",
      "Sear the shrimp over medium-high heat for 3 minutes until opaque, then set it aside.",
      "Stir-fry the vegetables and rice for 5 minutes, return the shrimp, season, and serve hot."
    ],
    image: { storagePath: "", sourceQuery: "shrimp fried rice", status: "pending" },
    source: { provider: "premium-validated" },
    searchTokens: ["Shrimp Fried Rice", "shrimp fried rice"],
    popularityScore: 70,
    qualityScore: 90,
    isActive: true,
    createdAt: 1,
    updatedAt: 1
  };
  source.validationReceipt = createPremiumRecipeValidationReceipt(source, {
    acceptanceScore: 92,
    acceptanceReasons: ["recipe_contract_passed"],
    acceptedAt: 1
  }) ?? undefined;
  return auditSharedRecipePoolDocument(source, 2).document;
}

function generatedPhoto(overrides: Partial<SharedRecipePhotoLinkInput> = {}): SharedRecipePhotoLinkInput {
  return {
    cuisine: "Asian",
    diets: ["pescatarian"],
    exactNames: ["Shrimp Fried Rice"],
    imageUrl: "https://firebasestorage.googleapis.com/v0/b/app/o/recipe-photo-cache%2Fdiet%3Apescatarian%3Agenerated%3Astrict-v7%3Ashrimp-fried-rice.jpg?alt=media",
    query: "pescatarian shrimp fried rice",
    signature: "diet:pescatarian:generated:strict-v7:shrimp-fried-rice",
    ...overrides
  };
}

describe("shared recipe photo linking", () => {
  it("queries shared recipes with case- and hyphen-normalized title tokens", () => {
    expect(buildSharedRecipePhotoLinkSearchTokens(["Garlic Ginger Broccoli Stir-Fry"])).toEqual([
      "Garlic Ginger Broccoli Stir-Fry",
      "garlic ginger broccoli stir-fry",
      "garlic ginger broccoli stir fry"
    ]);
  });

  it("normalizes common transliteration variants for shared recipe linking", () => {
    expect(buildSharedRecipePhotoLinkSearchTokens(["Frakh Meshwi"])).toEqual([
      "Frakh Meshwi",
      "frakh meshwi",
      "farakh meshwi"
    ]);
  });

  it("accepts a valid generated image when optional attribution is absent", () => {
    const input = generatedPhoto({ attributionName: undefined, attributionUrl: undefined });
    expect(canLinkGeneratedPhotoToSharedRecipe(validatedShrimpFriedRice(), input)).toBe(true);
  });

  it("links an exact generated photo to a validated shared recipe", () => {
    expect(canLinkGeneratedPhotoToSharedRecipe(validatedShrimpFriedRice(), generatedPhoto())).toBe(true);
  });

  it("does not link a same-title photo to a different V2 recipe document", () => {
    expect(canLinkGeneratedPhotoToSharedRecipe(validatedShrimpFriedRice(), generatedPhoto({
      sourceRecipeId: "shared-another-shrimp-fried-rice"
    }))).toBe(false);
  });

  it("rejects a generated photo whose stored slug describes another dish", () => {
    expect(canLinkGeneratedPhotoToSharedRecipe(validatedShrimpFriedRice(), generatedPhoto({
      imageUrl: "https://firebasestorage.googleapis.com/v0/b/app/o/recipe-photo-cache%2Fgenerated%3Agrilled-pigeon-with-rice.jpg?alt=media",
      signature: "generated:grilled-pigeon-with-rice"
    }))).toBe(false);
  });

  it("rejects a same-protein photo for a different recipe form", () => {
    expect(canLinkGeneratedPhotoToSharedRecipe(validatedShrimpFriedRice(), generatedPhoto({
      imageUrl: "https://firebasestorage.googleapis.com/v0/b/app/o/recipe-photo-cache%2Fgenerated%3Astrict-v7%3Ashrimp-noodle-soup.jpg?alt=media",
      signature: "generated:strict-v7:shrimp-noodle-soup"
    }))).toBe(false);
  });

  it("does not link a pescatarian recipe into a vegan photo scope", () => {
    expect(canLinkGeneratedPhotoToSharedRecipe(validatedShrimpFriedRice(), generatedPhoto({ diets: ["vegan"] }))).toBe(false);
  });

  it("does not treat provider-search photos as reusable cross-account assets", () => {
    expect(isReusableSharedRecipePhotoEntry({
      imageUrl: "https://images.pexels.com/photos/123/pexels-photo-123.jpeg",
      query: "shrimp fried rice",
      signature: "pexels:shrimp-fried-rice",
      source: "pexels_search"
    })).toBe(false);
  });

  it("builds a persistent shared-recipe link from a validated generated photo", () => {
    const recipe = validatedShrimpFriedRice();
    const uiRecipe = mapCatalogRecipeToUiRecipe(recipe, [], "good", 0, 0, [], "English");
    const candidate: SharedRecipePhotoEntry = {
      dietTags: ["pescatarian"],
      imageUrl: generatedPhoto().imageUrl,
      query: generatedPhoto().query,
      signature: generatedPhoto().signature,
      source: "generated"
    };
    const linked = validateSharedRecipePhotoCandidate(uiRecipe, candidate, ["pescatarian"]);

    expect(linked?.photo_asset?.status).toBe("ready");
    const update = buildLinkedSharedRecipePhotoUpdate(recipe, linked!, candidate);
    expect(update.image).toMatchObject({
      sharedCacheKey: candidate.signature,
      source: "replicate",
      sourceQuery: candidate.query,
      status: "ready",
      storagePath: candidate.imageUrl,
      thumbPath: candidate.imageUrl
    });
    expect(update).toMatchObject({
      poolVersion: 2,
      publicationStatus: "published"
    });
  });
});
