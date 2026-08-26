import { describe, expect, it } from "vitest";
import type { Recipe } from "@/lib/types";
import {
  attachValidatedRecipePhotoAsset,
  canReuseRecipePhotoForDiet,
  hasRecipePhotoProteinConflict,
  RECIPE_PHOTO_ASSET_VALIDATOR_HASH
} from "@/services/recipePhotoReusePolicy";

const baseRecipe: Recipe = {
  calories: 400,
  carbs: "60g",
  cook_time: "30 minutes",
  cuisine: "Egyptian",
  difficulty: "easy",
  fat: "10g",
  ingredients: ["rice", "tomato", "chickpeas"],
  missing_ingredients: [],
  name: "Recipe",
  protein: "12g",
  steps: ["Cook and serve."]
};

describe("recipe photo reuse policy", () => {
  it("retains a durable vegan-scoped generated image", () => {
    expect(canReuseRecipePhotoForDiet({
      ...baseRecipe,
      image_source: "cache",
      image_url: "https://firebasestorage.googleapis.com/v0/b/app/o/recipe-photo-cache%2Fdiet%3Avegan%3Agenerated%3Astrict-v7%3Achickpea-stew.jpg?alt=media",
      name: "Chickpea Stew"
    }, ["vegan"], false)).toBe(true);
  });

  it("rejects a canonical Wikimedia image after provider fallbacks are retired", () => {
    expect(canReuseRecipePhotoForDiet({
      ...baseRecipe,
      image_source: "cache",
      image_url: "https://upload.wikimedia.org/wikipedia/commons/koshary.jpg",
      name: "Classic Egyptian Koshary"
    }, ["vegan"], false)).toBe(false);
  });

  it("rejects an ambiguous external Fattah image even when recipe text says vegan", () => {
    expect(canReuseRecipePhotoForDiet({
      ...baseRecipe,
      image_search_index: "vegan Egyptian fattah",
      image_source: "cache",
      image_url: "https://images.pexels.com/photos/27359375/pexels-photo-27359375.jpeg",
      name: "Fattah Base",
      photo_identity: { dish_slug: "fattah" }
    }, ["vegan"], false)).toBe(false);
  });

  it("rejects a chicken Fattah image for a beef Fattah recipe", () => {
    expect(canReuseRecipePhotoForDiet({
      ...baseRecipe,
      dish_intent: {
        cuisine: "Egyptian",
        dish_name: "Fattah Egyptian",
        exclude_keywords: [],
        visual_keywords: []
      },
      image_source: "cache",
      image_url: "https://firebasestorage.googleapis.com/v0/b/app/o/recipe-photo-cache%2Fgenerated%3Astrict-v7%3Achicken-fattah.jpg?alt=media",
      ingredients: ["rice", "beef", "tomato"],
      name: "Fattah"
    }, [], false)).toBe(false);
  });

  it("enforces a recipe's own vegan identity without a user diet filter", () => {
    expect(canReuseRecipePhotoForDiet({
      ...baseRecipe,
      dish_intent: {
        cuisine: "Egyptian",
        diet_type: "dairy-free, vegan, vegetarian",
        dish_name: "Vegan Fattah Egyptian",
        exclude_keywords: [],
        visual_keywords: []
      },
      image_source: "cache",
      image_url: "https://firebasestorage.googleapis.com/v0/b/app/o/recipe-photo-cache%2Fgenerated%3Astrict-v7%3Achicken-fattah.jpg?alt=media",
      name: "Vegan Fattah"
    }, [], false)).toBe(false);
  });

  it("enforces vegan catalog tags carried by a pending photo asset", () => {
    expect(canReuseRecipePhotoForDiet({
      ...baseRecipe,
      image_source: "cache",
      image_url: "https://firebasestorage.googleapis.com/v0/b/app/o/recipe-photo-cache%2Fgenerated%3Astrict-v7%3Achicken-fattah.jpg?alt=media",
      name: "Fattah Base",
      photo_asset: {
        dietTags: ["dairy-free", "vegan", "vegetarian"],
        status: "pending"
      },
      photo_identity: { dish_slug: "fattah" }
    }, [], false)).toBe(false);
  });

  it("enforces vegan intent from the title when source diet metadata is absent", () => {
    expect(canReuseRecipePhotoForDiet({
      ...baseRecipe,
      image_source: "cache",
      image_url: "https://firebasestorage.googleapis.com/v0/b/app/o/recipe-photo-cache%2Fgenerated%3Astrict-v7%3Achicken-fattah.jpg?alt=media",
      name: "Vegan Fattah"
    }, [], false)).toBe(false);
  });

  it("flags stale pending chicken identity for vegan Fattah", () => {
    expect(hasRecipePhotoProteinConflict({
      ...baseRecipe,
      name: "Fattah Base",
      photo_asset: {
        dietTags: ["vegan", "vegetarian"],
        status: "pending"
      }
    }, "chicken fattah")).toBe(true);
  });

  it("flags stale pending chicken identity for beef Fattah", () => {
    expect(hasRecipePhotoProteinConflict({
      ...baseRecipe,
      ingredients: ["rice", "beef", "bread", "tomato"],
      name: "Fattah"
    }, "chicken fattah")).toBe(true);
  });

  it("rejects a generated pigeon photo linked to a broccoli recipe", () => {
    expect(canReuseRecipePhotoForDiet({
      ...baseRecipe,
      cuisine: "Asian",
      image_source: "cache",
      image_url: "https://firebasestorage.googleapis.com/v0/b/app/o/recipe-photo-cache%2Fgenerated%3Agrilled-pigeon-with-rice.jpg?alt=media",
      name: "Steamed Broccoli With Ginger Garlic Sauce"
    }, ["pescatarian"], false)).toBe(false);
  });

  it("rejects a generated beef stir-fry photo linked to a mushroom recipe", () => {
    expect(canReuseRecipePhotoForDiet({
      ...baseRecipe,
      cuisine: "Asian",
      image_source: "cache",
      image_url: "https://firebasestorage.googleapis.com/v0/b/app/o/recipe-photo-cache%2Fgenerated%3Astir-fry-beef-soy-garlic-plate.jpg?alt=media",
      name: "Broccoli And Mushroom Stir Fry With Garlic"
    }, ["pescatarian"], false)).toBe(false);
  });

  it("rejects a fried-rice cache asset linked to steamed broccoli", () => {
    expect(canReuseRecipePhotoForDiet({
      ...baseRecipe,
      cuisine: "Asian",
      image_source: "cache",
      image_url: "https://firebasestorage.googleapis.com/v0/b/app/o/recipe-photo-cache%2Fgenerated%3Astrict-v7%3Afried-rice.jpg?alt=media",
      name: "Steamed Broccoli"
    }, ["pescatarian"], false)).toBe(false);
  });

  it("rejects a chicken-rice-salad asset linked to chicken and dumplings", () => {
    expect(canReuseRecipePhotoForDiet({
      ...baseRecipe,
      cuisine: "Asian",
      image_source: "cache",
      image_url: "https://firebasestorage.googleapis.com/v0/b/app/o/recipe-photo-cache%2Fgenerated%3Astrict-v7%3Achicken-rice-salad.jpg?alt=media",
      name: "Aunt Mildred's Chicken And Dumplings"
    }, [], false)).toBe(false);
  });

  it("does not reuse provider-search photos across sessions for pescatarian recipes", () => {
    expect(canReuseRecipePhotoForDiet({
      ...baseRecipe,
      cuisine: "Asian",
      image_source: "search",
      image_url: "https://images.pexels.com/photos/6718709/pexels-photo-6718709.jpeg",
      name: "Salt And Pepper Shrimp"
    }, ["pescatarian"], true)).toBe(false);
  });

  it("bundles a compliant photo into the recipe validation contract", () => {
    const linked = attachValidatedRecipePhotoAsset({
      ...baseRecipe,
      image_source: "cache",
      image_url: "https://firebasestorage.googleapis.com/v0/b/app/o/recipe-photo-cache%2Fdiet%3Avegan%3Achickpea-stew.jpg?alt=media",
      name: "Chickpea Stew"
    }, ["vegan"], 123456);

    expect(linked.photo_asset).toEqual({
      attributionName: undefined,
      attributionUrl: undefined,
      dietTags: ["vegan"],
      source: "cache",
      status: "ready",
      url: linked.image_url,
      validatedAt: 123456,
      validatorHash: RECIPE_PHOTO_ASSET_VALIDATOR_HASH
    });
    expect(linked.image_loading).toBe(false);
    expect(linked.image_error).toBe(false);
  });

  it("keeps a valid ready photo_asset URL even when the top-level image_url is absent", () => {
    const linked = attachValidatedRecipePhotoAsset({
      ...baseRecipe,
      image_source: "cache",
      image_url: undefined,
      name: "Chickpea Stew",
      photo_asset: {
        dietTags: ["vegan"],
        source: "cache",
        status: "ready",
        url: "https://firebasestorage.googleapis.com/v0/b/app/o/recipe-photo-cache%2Fdiet%3Avegan%3Achickpea-stew.jpg?alt=media"
      }
    }, ["vegan"], 123456);

    expect(linked.photo_asset).toMatchObject({
      dietTags: ["vegan"],
      source: "cache",
      status: "ready",
      url: "https://firebasestorage.googleapis.com/v0/b/app/o/recipe-photo-cache%2Fdiet%3Avegan%3Achickpea-stew.jpg?alt=media"
    });
    expect(linked.image_url).toBe("https://firebasestorage.googleapis.com/v0/b/app/o/recipe-photo-cache%2Fdiet%3Avegan%3Achickpea-stew.jpg?alt=media");
    expect(linked.image_error).toBe(false);
  });

  it("stores an unsafe or absent photo as pending without a renderable URL", () => {
    const linked = attachValidatedRecipePhotoAsset({
      ...baseRecipe,
      image_source: "cache",
      image_url: "https://images.pexels.com/photos/27359375/pexels-photo-27359375.jpeg",
      name: "Fattah Base"
    }, ["vegan"], 123456);

    expect(linked.photo_asset).toEqual({ dietTags: ["vegan"], status: "pending" });
    expect(linked.image_url).toBeUndefined();
    expect(linked.image_loading).toBe(false);
    expect(linked.image_error).toBe(true);
  });
});
