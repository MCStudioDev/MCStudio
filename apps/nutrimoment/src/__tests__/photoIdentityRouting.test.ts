import { describe, expect, it } from "vitest";
import type { RecipeCatalogDoc } from "../lib/domain";
import { buildPhotoIdentityFromCatalog, normalizePhotoIdentity, toIdentityKey } from "../lib/photoIdentityBuilders";
import { buildEnglishRecipePhotoContext } from "../lib/recipePhotoLanguage";
import { buildRecipePhotoIdentity, isStrictRecipePhotoIdentity } from "../lib/recipePhotoIdentity";

const baseCatalog: RecipeCatalogDoc = {
  id: "test-1",
  title: "Lemon Herb Seafood Soup",
  slug: "lemon-herb-seafood-soup",
  description: "",
  ingredients: [],
  ingredientCanonicals: [],
  requiredCanonicals: [],
  optionalCanonicals: [],
  dietTags: [],
  allergenTags: [],
  mealType: "dinner",
  cuisine: "Mediterranean",
  prepMinutes: 10,
  cookMinutes: 20,
  totalMinutes: 30,
  difficulty: "easy",
  calories: 480,
  protein: 32,
  carbs: 44,
  fat: 16,
  calorieBand: "medium",
  servings: 2,
  steps: [],
  image: { storagePath: "" },
  searchTokens: [],
  popularityScore: 0,
  qualityScore: 0,
  isActive: true,
  createdAt: 0,
  updatedAt: 0
};

describe("photo identity routing", () => {
  it("maps common Farakh Meshwi transliteration variants to one canonical dish", () => {
    expect(buildRecipePhotoIdentity("Frakh Meshwi").canonicalDishKey).toBe("farakh-meshwi");
    expect(buildRecipePhotoIdentity("Farkh Meshwi").canonicalDishKey).toBe("farakh-meshwi");
    expect(buildRecipePhotoIdentity("Farakh Meshwi").canonicalDishKey).toBe("farakh-meshwi");
  });

  it("derives a usable identity from a catalog row", () => {
    const identity = buildPhotoIdentityFromCatalog(baseCatalog);
    expect(identity).toMatchObject({
      dish_slug: "lemon-herb-seafood-soup",
      english_name: "Lemon Herb Seafood Soup",
      cuisine_key: "mediterranean"
    });
  });

  it("locks the canonicalDishKey when an override is provided", () => {
    const arabicSoup = "\u0634\u0648\u0631\u0628\u0629 \u0628\u062d\u0631\u064a\u0629";
    const withoutOverride = buildRecipePhotoIdentity(arabicSoup);
    const withOverride = buildRecipePhotoIdentity(arabicSoup, {
      cuisineKey: "mediterranean",
      dishSlug: "lemon-herb-seafood-soup"
    });

    expect(withOverride.canonicalDishKey).toBe("lemon-herb-seafood-soup");
    expect(withOverride.signature).toContain("lemon-herb-seafood-soup");
    expect(withOverride.signature).not.toBe(withoutOverride.signature);
  });

  it("produces distinct signatures for visually different seafood dishes", () => {
    const soup = buildRecipePhotoIdentity("Lemon Herb Seafood Soup", {
      cuisineKey: "mediterranean",
      dishSlug: "lemon-herb-seafood-soup"
    });
    const pasta = buildRecipePhotoIdentity("Seafood Pasta with Tomato Sauce", {
      cuisineKey: "italian",
      dishSlug: "seafood-tomato-pasta"
    });
    const shrimpCurry = buildRecipePhotoIdentity("Green Curry Shrimp", {
      cuisineKey: "thai",
      dishSlug: "green-curry-shrimp"
    });

    expect(new Set([soup.signature, pasta.signature, shrimpCurry.signature]).size).toBe(3);
  });

  it("keeps the same signature across Arabic phrasing when the AI emits a stable slug", () => {
    const firstPhrasing = buildRecipePhotoIdentity(
      "\u062d\u0633\u0627\u0621 \u0627\u0644\u0633\u064a \u0641\u0648\u062f \u0628\u0627\u0644\u0644\u064a\u0645\u0648\u0646 \u0648\u0627\u0644\u0623\u0639\u0634\u0627\u0628",
      {
        cuisineKey: "mediterranean",
        dishSlug: "lemon-herb-seafood-soup"
      }
    );
    const secondPhrasing = buildRecipePhotoIdentity(
      "\u0634\u0648\u0631\u0628\u0629 \u0627\u0644\u0633\u064a \u0641\u0648\u062f \u0628\u0627\u0644\u0623\u0639\u0634\u0627\u0628 \u0648\u0627\u0644\u0644\u064a\u0645\u0648\u0646",
      {
        cuisineKey: "mediterranean",
        dishSlug: "lemon-herb-seafood-soup"
      }
    );

    expect(firstPhrasing.signature).toBe(secondPhrasing.signature);
  });

  it("uses photo_identity english_name as the recipe photo query source", () => {
    const context = buildEnglishRecipePhotoContext({
      name: "\u062d\u0633\u0627\u0621 \u0627\u0644\u0633\u064a \u0641\u0648\u062f",
      cuisine: "\u0645\u062a\u0648\u0633\u0637\u064a",
      ingredients: ["\u0633\u064a \u0641\u0648\u062f"],
      missing_ingredients: [],
      steps: [],
      calories: 480,
      protein: "32g",
      carbs: "44g",
      fat: "16g",
      photo_identity: {
        cuisine_key: "mediterranean",
        dish_slug: "lemon-herb-seafood-soup",
        english_name: "Lemon Herb Seafood Soup",
        method: "soup",
        protein: "seafood",
        sauce: "lemon-herb"
      }
    });

    expect(context.name).toBe("Lemon Herb Seafood Soup");
    expect(context.imageSearchIndex).toBe("Lemon Herb Seafood Soup");
    expect(context.cuisine).toBe("mediterranean");
  });

  it("rejects unusable AI slugs through normalizePhotoIdentity", () => {
    expect(normalizePhotoIdentity({ dish_slug: "", english_name: "x" } as never)).toBeUndefined();
    expect(normalizePhotoIdentity({ dish_slug: "!!", english_name: "x" } as never)).toBeUndefined();
    expect(normalizePhotoIdentity({ dish_slug: "OK Slug Mixed", english_name: "X" } as never)).toMatchObject({
      dish_slug: "ok-slug-mixed",
      english_name: "X"
    });
  });

  it("converts free text into a usable identity key", () => {
    expect(toIdentityKey("Egyptian Lentil Tomato Soup")).toBe("egyptian-lentil-tomato-soup");
    expect(toIdentityKey("  Spaces  And-Hyphens ")).toBe("spaces-and-hyphens");
    expect(toIdentityKey("")).toBeUndefined();
    expect(toIdentityKey(undefined)).toBeUndefined();
  });

  it("keeps stuffed grape leaves visually strict and query-specific", () => {
    const identity = buildRecipePhotoIdentity("\u0645\u062d\u0634\u064a \u0648\u0631\u0642 \u0639\u0646\u0628");

    expect(identity.canonicalDishKey).toBe("warak-enab");
    expect(identity.searchQueries).toContain("warak enab middle-eastern");
    expect(identity.searchQueries).toContain("stuffed grape leaves middle-eastern");
    expect(identity.searchQueries.join(" ")).not.toMatch(/\brice plate\b/);
    expect(isStrictRecipePhotoIdentity(identity)).toBe(true);
  });
});
