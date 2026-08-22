import { describe, expect, it } from "vitest";
import type { Recipe } from "@/lib/types";
import { dedupeExactRecipeCandidates } from "@/services/recipeCandidateMergeService";

function recipe(name: string, id: string, sourceRecipeId = id): Recipe {
  return {
    calories: 500,
    carbs: "40g",
    cook_time: "30 mins",
    cuisine: "Egyptian",
    difficulty: "Medium",
    fat: "20g",
    id,
    ingredients: ["1 lb ground beef"],
    missing_ingredients: ["1 onion"],
    name,
    protein: "30g",
    source_recipe_id: sourceRecipeId,
    steps: ["Prepare the ingredients.", "Cook until done."]
  };
}

describe("dedupeExactRecipeCandidates", () => {
  it("preserves distinct premium dishes for shared-pool validation", () => {
    const recipes = [
      recipe("Egyptian Hawawshi", "hawawshi"),
      recipe("Alexandrian Hawawshi", "alexandrian-hawawshi"),
      recipe("Kofta", "kofta"),
      recipe("Kofta Soup", "kofta-soup"),
      recipe("Mahshi Filfil", "mahshi-filfil")
    ];

    expect(dedupeExactRecipeCandidates(recipes).map((item) => item.name)).toEqual(
      recipes.map((item) => item.name)
    );
  });

  it("removes repeated IDs and exact display names", () => {
    const recipes = [
      recipe("Kofta", "kofta-v1", "kofta-source"),
      recipe("Updated Kofta", "kofta-v2", "kofta-source"),
      recipe("  KOFTA  ", "kofta-copy"),
      recipe("Kofta Soup", "kofta-soup")
    ];

    expect(dedupeExactRecipeCandidates(recipes).map((item) => item.name)).toEqual([
      "Kofta",
      "Kofta Soup"
    ]);
  });
});
