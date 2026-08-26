import { describe, expect, it } from "vitest";
import type { RecipeCatalogDoc } from "@/lib/domain";
import type { SharedRecipePhotoEntry } from "@/lib/sharedRecipePhotoCache";
import {
  buildSharedRecipePhotoRelinkIndex,
  findSharedRecipePhotoRelinkMatch,
  type SharedRecipePhotoRelinkRecord
} from "@/services/sharedRecipePhotoRelinkService";

function recipe(title: string, ingredients: string[]): RecipeCatalogDoc {
  return {
    id: `shared-${title.toLowerCase().replace(/\s+/g, "-")}`,
    title,
    slug: title.toLowerCase().replace(/\s+/g, "-"),
    description: `${title} prepared as an Egyptian dinner.`,
    ingredients: ingredients.map((ingredient) => ({
      canonical: ingredient,
      name: `1 cup ${ingredient}`,
      quantity: 1,
      required: true,
      unit: "cup"
    })),
    ingredientCanonicals: ingredients,
    requiredCanonicals: ingredients,
    optionalCanonicals: [],
    dietTags: [],
    allergenTags: [],
    mealType: "dinner",
    cuisine: "Egyptian",
    prepMinutes: 15,
    cookMinutes: 30,
    totalMinutes: 45,
    difficulty: "medium",
    calories: 450,
    protein: 30,
    carbs: 40,
    fat: 15,
    calorieBand: "301_500",
    servings: 4,
    steps: [
      "Prepare the measured ingredients and preheat the cooking surface.",
      "Cook the filling thoroughly, assemble the dish, and continue cooking until done.",
      "Check the center for doneness, rest briefly, and serve hot."
    ],
    image: { sourceQuery: title, status: "pending", storagePath: "" },
    source: { provider: "premium-validated" },
    searchTokens: [title, title.toLowerCase()],
    popularityScore: 70,
    qualityScore: 90,
    isActive: true,
    createdAt: 1,
    updatedAt: 1
  };
}

function generatedRecord(input: {
  docId: string;
  query: string;
  slug: string;
}): SharedRecipePhotoRelinkRecord {
  const entry: SharedRecipePhotoEntry = {
    imageUrl: `https://firebasestorage.googleapis.com/v0/b/app/o/recipe-photo-cache%2Fgenerated%3Astrict-v7%3A${input.slug}.jpg?alt=media`,
    query: input.query,
    signature: input.docId,
    source: "generated"
  };
  return { docId: input.docId, entry };
}

describe("shared recipe photo relinking", () => {
  it("relinks an exact compatible Hawawshi image", () => {
    const index = buildSharedRecipePhotoRelinkIndex([
      generatedRecord({
        docId: "exact:cuisine:egyptian:alexandrian-hawawshi",
        query: "alexandrian hawawshi",
        slug: "alexandrian-hawawshi"
      })
    ]);

    const match = findSharedRecipePhotoRelinkMatch(
      recipe("Alexandrian Hawawshi", ["ground beef", "pita bread", "onion"]),
      index
    );

    expect(match?.candidate.query).toBe("alexandrian hawawshi");
    expect(match?.linkedRecipe.photo_asset?.status).toBe("ready");
  });

  it("does not bulk-link a related Hawawshi variant without an exact alias", () => {
    const index = buildSharedRecipePhotoRelinkIndex([
      generatedRecord({
        docId: "exact:cuisine:egyptian:alexandrian-hawawshi",
        query: "alexandrian hawawshi",
        slug: "alexandrian-hawawshi"
      })
    ]);

    const match = findSharedRecipePhotoRelinkMatch(
      recipe("Baladi Egyptian Hawawshi", ["ground beef", "pita bread", "onion"]),
      index
    );

    expect(match).toBeNull();
  });

  it("rejects bean chili imagery for chicken chili", () => {
    const index = buildSharedRecipePhotoRelinkIndex([
      generatedRecord({
        docId: "exact:canonical:chili-con-carne",
        query: "vegan Kidney Bean and Tomato Chili American",
        slug: "kidney-bean-tomato-chili"
      })
    ]);

    const match = findSharedRecipePhotoRelinkMatch(
      recipe("Chunky Chicken Chili", ["chicken", "tomato", "chili pepper"]),
      index
    );

    expect(match).toBeNull();
  });

  it("rejects a stale exact alias when the stored image query is another dish", () => {
    const record = generatedRecord({
      docId: "exact:en:chicken-broccoli-and-cheese-casserole",
      query: "chicken broccoli and cheese casserole american",
      slug: "chicken-broccoli-cheese-casserole"
    });
    record.queryKey = "Chicken Broccoli And Orzo";
    const index = buildSharedRecipePhotoRelinkIndex([record]);

    const match = findSharedRecipePhotoRelinkMatch(
      recipe("Chicken Broccoli And Orzo", ["chicken", "broccoli", "orzo"]),
      index
    );

    expect(match).toBeNull();
  });

  it("allows harmless cuisine words appended to an exact image query", () => {
    const record = generatedRecord({
      docId: "exact:en:chicken-broccoli-and-cheese-casserole",
      query: "chicken broccoli and cheese casserole american",
      slug: "chicken-broccoli-and-cheese-casserole"
    });
    const index = buildSharedRecipePhotoRelinkIndex([record]);

    const match = findSharedRecipePhotoRelinkMatch(
      recipe("Chicken Broccoli And Cheese Casserole", ["chicken", "broccoli", "cheese"]),
      index
    );

    expect(match?.candidate.query).toBe("chicken broccoli and cheese casserole american");
  });

  it("rejects generic Kafta imagery for Stuffed Kofta", () => {
    const index = buildSharedRecipePhotoRelinkIndex([
      generatedRecord({
        docId: "exact:canonical:kofta",
        query: "kafta",
        slug: "kafta"
      })
    ]);

    const match = findSharedRecipePhotoRelinkMatch(
      recipe("Stuffed Kofta", ["ground beef", "rice", "onion"]),
      index
    );

    expect(match).toBeNull();
  });

  it("does not bulk-link a same-protein family image to another dish form", () => {
    const index = buildSharedRecipePhotoRelinkIndex([
      generatedRecord({
        docId: "generated:strict-v6:grilled-tilapia-lemon-herbs",
        query: "mediterranean grilled fish",
        slug: "grilled-tilapia-lemon-herbs"
      })
    ]);

    const match = findSharedRecipePhotoRelinkMatch(
      recipe("Salmon Croquettes", ["salmon", "bread crumbs", "egg"]),
      index
    );

    expect(match).toBeNull();
  });
});
