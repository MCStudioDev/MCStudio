import { describe, expect, it } from "vitest";
import {
  isRecipePhotoDietCompatible,
  scopeRecipePhotoAliasesForDiet
} from "@/services/recipePhotoDietCompatibility";

describe("recipe photo diet compatibility", () => {
  it("rejects an animal-food cache entry for a vegan request", () => {
    expect(isRecipePhotoDietCompatible({
      imageUrl: "https://images.pexels.com/photos/27359375/pexels-photo-27359375.jpeg",
      mainIngredientKey: "lamb",
      query: "fattah lamb",
      signature: "exact:en:fattah",
      source: "pexels_search"
    }, { diets: ["vegan"] })).toBe(false);
  });

  it("rejects legacy provider URLs mislabeled as generated for constrained requests", () => {
    expect(isRecipePhotoDietCompatible({
      imageUrl: "https://images.pexels.com/photos/37164878/pexels-photo-37164878.jpeg",
      query: "okra tomato stew",
      signature: "generated:strict-v6:bamia-tomato-stew",
      source: "generated"
    }, { diets: ["vegan"] })).toBe(false);
  });

  it("requires plant-based proof for adaptable kofta and kebab photos", () => {
    expect(isRecipePhotoDietCompatible({
      imageUrl: "https://images.pexels.com/photos/37080238/pexels-photo-37080238.jpeg",
      query: "kofta",
      signature: "exact:en:kofta",
      source: "wikimedia"
    }, { diets: ["vegan"] })).toBe(false);

    expect(isRecipePhotoDietCompatible({
      dietTags: ["vegan"],
      imageUrl: "https://firebasestorage.googleapis.com/v0/b/app/o/vegan-kofta.jpg?alt=media",
      query: "vegan chickpea kofta",
      signature: "diet:vegan:exact:en:kofta",
      source: "generated"
    }, { diets: ["vegan"] })).toBe(true);
  });

  it("rejects provider URLs whose stored source metadata names another provider", () => {
    expect(isRecipePhotoDietCompatible({
      imageUrl: "https://images.pexels.com/photos/123/vegetable-stew.jpeg",
      query: "vegan vegetable stew",
      source: "wikimedia"
    }, { diets: ["vegan"] })).toBe(false);
  });

  it("does not accept a diet tag alone as proof for an adaptable provider photo", () => {
    expect(isRecipePhotoDietCompatible({
      dietTags: ["vegan"],
      imageUrl: "https://images.pexels.com/photos/37080238/pexels-photo-37080238.jpeg",
      query: "kofta",
      source: "pexels_search"
    }, { diets: ["vegan"] })).toBe(false);

    expect(isRecipePhotoDietCompatible({
      dietTags: ["vegan"],
      imageUrl: "https://images.pexels.com/photos/123/vegan-kofta.jpeg",
      query: "vegan chickpea kofta",
      source: "pexels_search"
    }, { diets: ["vegan"] })).toBe(true);
  });

  it("requires vegan proof for other traditionally animal-associated dish photos", () => {
    for (const query of ["fattah base", "Egyptian torly", "roz meammar", "bamia stew", "fasolia beida"]) {
      expect(isRecipePhotoDietCompatible({
        imageUrl: "https://upload.wikimedia.org/example.jpg",
        query,
        source: "wikimedia"
      }, { diets: ["vegan"] })).toBe(false);
    }
  });

  it("allows a durable generated plant-based image", () => {
    expect(isRecipePhotoDietCompatible({
      imageUrl: "https://firebasestorage.googleapis.com/v0/b/app/o/recipe-photo-cache%2Fgenerated%3Astrict-v7%3Achickpea-stew.jpg?alt=media",
      query: "vegan chickpea stew",
      signature: "diet:vegan:generated:strict-v7:chickpea-stew",
      source: "generated"
    }, { diets: ["vegan"] })).toBe(true);
  });

  it("scopes exact aliases deterministically by active diet", () => {
    expect(scopeRecipePhotoAliasesForDiet(["exact:en:fattah"], ["vegan", "dairyFree"]))
      .toEqual(["diet:dairyfree+vegan:exact:en:fattah"]);
  });
});
