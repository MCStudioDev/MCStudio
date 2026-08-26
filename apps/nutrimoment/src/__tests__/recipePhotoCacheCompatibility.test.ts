import { describe, expect, it } from "vitest";
import {
  buildGeneratedRecipePhotoCacheQuery,
  buildGeneratedRecipePhotoStorageSlug
} from "@/lib/recipePhotoIdentity";
import { buildRecipePhotoReuseKeyFromQuery } from "@/lib/recipePhotoReuse";
import {
  isApproximateRecipePhotoCacheCompatible,
  isExactGeneratedRecipePhotoQueryMatch,
  isGeneratedRecipePhotoCachePayloadConsistent,
  isGeneratedRecipePhotoUrlCompatibleWithQueries
} from "@/services/recipePhotoCacheCompatibility";

describe("approximate recipe photo cache compatibility", () => {
  it("stores generated metadata under the exact dish identity instead of the verbose image prompt", () => {
    const query = buildGeneratedRecipePhotoCacheQuery(
      "Bulgogi",
      "Bulgogi, Korean marinated beef served with rice"
    );

    expect(query).toBe("bulgogi");
    expect(isGeneratedRecipePhotoCachePayloadConsistent({
      imageUrl: "https://firebasestorage.googleapis.com/v0/b/app/o/recipe-photo-cache%2Fgenerated%3Astrict-v7%3Abulgogi.jpg?alt=media",
      query,
      signature: "generated:strict-v7:bulgogi"
    })).toBe(true);
  });

  it("preserves exact recipe modifiers in the generated storage slug", () => {
    expect(buildGeneratedRecipePhotoStorageSlug(
      "Baked Garlic Ginger Shrimp with Broccoli",
      "Asian garlic shrimp"
    )).toBe("baked-garlic-ginger-shrimp-with-broccoli");
  });

  it("treats hyphenated and spaced cooking methods as the same reuse key", () => {
    expect(buildRecipePhotoReuseKeyFromQuery("Garlic Ginger Broccoli Stir-fry"))
      .toBe(buildRecipePhotoReuseKeyFromQuery("Garlic Ginger Broccoli Stir Fry"));
  });

  it.each([
    ["mediterranean baked fish", "Roasted Zucchini and Tomato Mediterranean food"],
    ["grilled shrimp skewers with lemon and herbs", "Grilled Zucchini and Tomato Skewers"],
    ["spinach omelette", "Egyptian Vegetarian Moussaka"],
    ["shakshuka", "Fried Zucchini with Tomato"]
  ])("rejects unrelated cached image %s for %s", (cachedQuery, requestQuery) => {
    expect(isApproximateRecipePhotoCacheCompatible(
      { query: cachedQuery, signature: `generated:strict-v7:${cachedQuery.replace(/\s+/g, "-")}` },
      [requestQuery]
    )).toBe(false);
  });

  it("accepts the same canonical dish and preparation", () => {
    expect(isApproximateRecipePhotoCacheCompatible(
      { query: "baked eggplant and tomato", signature: "generated:strict-v7:baked-eggplant-and-tomato" },
      ["Baked Eggplant and Tomato Mediterranean food"]
    )).toBe(true);
  });

  it("rejects the same ingredient when the visible cooking method conflicts", () => {
    expect(isApproximateRecipePhotoCacheCompatible(
      { query: "grilled zucchini", signature: "generated:strict-v7:grilled-zucchini" },
      ["Fried Zucchini with Tomato"]
    )).toBe(false);
  });

  it("rejects a poisoned alias whose metadata disagrees with the stored image signature", () => {
    expect(isGeneratedRecipePhotoCachePayloadConsistent({
      imageUrl: "https://firebasestorage.googleapis.com/v0/b/app/o/recipe-photo-cache%2Fgenerated%3Astrict-v7%3Afrog-eye-salad-global.jpg?alt=media",
      query: "zucchini and tomato pasta",
      signature: "generated:strict-v7:zucchini-and-tomato-pasta"
    })).toBe(false);
  });

  it("accepts a generated image whose stored signature is diet scoped", () => {
    expect(isGeneratedRecipePhotoCachePayloadConsistent({
      imageUrl: "https://firebasestorage.googleapis.com/v0/b/app/o/recipe-photo-cache%2Fdiet%3Avegan%3Agenerated%3Astrict-v7%3Akoshary.jpg?alt=media",
      query: "vegan Egyptian koshary",
      signature: "diet:vegan:exact:canonical:koshary"
    })).toBe(true);
  });

  it("accepts an exact alias document when its query matches the generated storage signature", () => {
    expect(isGeneratedRecipePhotoCachePayloadConsistent({
      imageUrl: "https://firebasestorage.googleapis.com/v0/b/app/o/recipe-photo-cache%2Fgenerated%3Astrict-v7%3Afarakh-meshwi.jpg?alt=media",
      query: "farakh meshwi",
      signature: "exact:canonical:farakh-meshwi"
    })).toBe(true);
  });

  it("keeps an exact canonical match when unrelated cuisine fallbacks are also present", () => {
    expect(isExactGeneratedRecipePhotoQueryMatch("farakh meshwi", [
      "Farakh Meshwi",
      "Farakh Meshwi Egyptian",
      "Kebda Eskandarani",
      "Alexandrian Liver"
    ])).toBe(true);
  });

  it("does not treat an unrelated canonical fallback as an exact match", () => {
    expect(isExactGeneratedRecipePhotoQueryMatch("farakh meshwi", [
      "Kebda Eskandarani",
      "Alexandrian Liver"
    ])).toBe(false);
  });

  it("does not let a scan ingredient rescue a generated image that conflicts with the recipe name", () => {
    expect(isGeneratedRecipePhotoUrlCompatibleWithQueries(
      "https://firebasestorage.googleapis.com/v0/b/app/o/recipe-photo-cache%2Fgenerated%3Astrict-v7%3Afried-rice.jpg?alt=media",
      ["Ginger Garlic Mushroom Saute"]
    )).toBe(false);
  });

  it("requires a named starch instead of accepting a protein-only generated photo", () => {
    expect(isGeneratedRecipePhotoUrlCompatibleWithQueries(
      "https://firebasestorage.googleapis.com/v0/b/app/o/recipe-photo-cache%2Fgenerated%3Astrict-v7%3Asimple-garlic-shrimp.jpg?alt=media",
      ["Ginger Garlic Shrimp Noodles"]
    )).toBe(false);
  });

  it("does not reuse generic kofta imagery for a visibly stuffed kofta recipe", () => {
    expect(isGeneratedRecipePhotoUrlCompatibleWithQueries(
      "https://firebasestorage.googleapis.com/v0/b/app/o/recipe-photo-cache%2Fgenerated%3Astrict-v7%3Akafta.jpg?alt=media",
      ["Stuffed Kofta"]
    )).toBe(false);
  });

  it("does not let a generic fallback alias bypass a visible recipe form", () => {
    expect(isGeneratedRecipePhotoUrlCompatibleWithQueries(
      "https://firebasestorage.googleapis.com/v0/b/app/o/recipe-photo-cache%2Fgenerated%3Astrict-v7%3Akafta.jpg?alt=media",
      ["Stuffed Kofta", "Kofta"]
    )).toBe(false);
  });

  it("does not attach a visibly sauced image to a recipe without that sauce", () => {
    expect(isGeneratedRecipePhotoUrlCompatibleWithQueries(
      "https://firebasestorage.googleapis.com/v0/b/app/o/recipe-photo-cache%2Fgenerated%3Astrict-v5%3Afried-chicken-soy-garlic-plate.jpg?alt=media",
      ["Oven Fried Chicken", "Fried Chicken"]
    )).toBe(false);
  });

  it("keeps visible recipe forms compatible when both identities include them", () => {
    expect(isGeneratedRecipePhotoUrlCompatibleWithQueries(
      "https://firebasestorage.googleapis.com/v0/b/app/o/recipe-photo-cache%2Fgenerated%3Astrict-v7%3Astuffed-kofta.jpg?alt=media",
      ["Egyptian Stuffed Kofta"]
    )).toBe(true);
  });

  it.each([
    ["chicken-rice-salad", "Aunt Mildred's Chicken And Dumplings"],
    ["green-curry-chicken-with-potatoes", "Pennsylvania Dutch Chicken And Dumplings"],
    ["fried-chicken-soy-garlic-rice-plate", "Chinese Chicken Wings"],
    ["lemon-butter-chicken-skillet", "Butter Chicken"]
  ])("rejects a same-protein image for a different exact dish (%s)", (storedSlug, recipeName) => {
    expect(isGeneratedRecipePhotoUrlCompatibleWithQueries(
      `https://firebasestorage.googleapis.com/v0/b/app/o/recipe-photo-cache%2Fgenerated%3Astrict-v7%3A${storedSlug}.jpg?alt=media`,
      [recipeName]
    )).toBe(false);
  });
});
