import { describe, expect, it } from "vitest";
import {
  buildRecipeReferenceTaxonomyBuckets,
  classifyRecipeReferenceTaxonomy
} from "../lib/recipeReferenceTaxonomy";

describe("recipe reference taxonomy classifier", () => {
  it("classifies clear Italian chicken recipes without Gemini", () => {
    const taxonomy = classifyRecipeReferenceTaxonomy({
      title: "Creamy Tuscan Chicken",
      ingredients: ["chicken breast", "heavy cream", "parmesan", "basil", "garlic"],
      ingredientCanonicals: ["chicken", "dairy", "cheese", "garlic"],
      mainIngredients: ["chicken", "dairy"],
      directions: ["Sear the chicken, simmer with cream, parmesan, basil, and garlic until the sauce thickens."]
    });

    expect(taxonomy.classifierSource).toBe("rule_engine");
    expect(taxonomy.needsClassifierReview).toBe(false);
    expect(taxonomy.cuisine).toBe("Italian");
    expect(taxonomy.cuisineConfidence).toBeGreaterThanOrEqual(75);
    expect(taxonomy.proteinKey).toBe("chicken");
    expect(taxonomy.ingredientIds).toContain("chicken");
    expect(taxonomy.commonAllergens).toContain("milk");
    expect(taxonomy.publishStatus).toBe("needs_review");
    expect(taxonomy.validationWarnings).toContain("too-few-steps");
    expect(taxonomy.flavorProfile).toContain("Creamy");

    const buckets = buildRecipeReferenceTaxonomyBuckets(taxonomy, ["chicken", "dairy"]);
    expect(buckets).toContain("italian::protein::chicken");
    expect(buckets).toContain("protein::chicken");
    expect(buckets).toContain("flavor::creamy");
  });

  it("marks ambiguous creamy chicken for review instead of guessing a cuisine", () => {
    const taxonomy = classifyRecipeReferenceTaxonomy({
      title: "Creamy Chicken",
      ingredients: ["chicken", "cream", "garlic", "butter"],
      ingredientCanonicals: ["chicken", "dairy", "garlic"],
      mainIngredients: ["chicken", "dairy"],
      directions: ["Cook chicken with cream, garlic, and butter until done."]
    });

    expect(taxonomy.cuisine).toBe("Global");
    expect(taxonomy.needsClassifierReview).toBe(true);
    expect(taxonomy.proteinKey).toBe("chicken");
    expect(taxonomy.flavorProfile).toContain("Creamy");
  });

  it("detects high-confidence Mexican shrimp recipes and indexed buckets", () => {
    const taxonomy = classifyRecipeReferenceTaxonomy({
      title: "Shrimp Fajitas",
      ingredients: ["shrimp", "tortillas", "bell pepper", "lime", "cilantro"],
      ingredientCanonicals: ["shrimp", "bread", "bell pepper"],
      mainIngredients: ["shrimp", "bell pepper"],
      directions: ["Saute shrimp and peppers, then serve in warm tortillas with lime."]
    });

    expect(taxonomy.cuisine).toBe("Mexican");
    expect(taxonomy.proteinKey).toBe("shrimp");
    expect(taxonomy.cookingMethod).toBe("sandwich-wrap");
    expect(buildRecipeReferenceTaxonomyBuckets(taxonomy, ["shrimp"])).toContain("mexican::protein::shrimp");
  });

  it("keeps no-bake recipes out of the baked method bucket", () => {
    const taxonomy = classifyRecipeReferenceTaxonomy({
      title: "No-Bake Nut Cookies",
      ingredients: ["brown sugar", "evaporated milk", "vanilla", "pecans", "butter", "rice cereal"],
      ingredientCanonicals: ["brown sugar", "dairy", "vanilla", "pecans", "butter", "rice"],
      mainIngredients: ["dairy", "rice"],
      directions: [
        "Boil sugar and milk for 5 minutes.",
        "Stir in vanilla, cereal, and nuts, then drop clusters on wax paper and let stand until firm."
      ]
    });

    expect(taxonomy.cookingMethod).toBe("no-cook");
    expect(taxonomy.techniques).toContain("no-cook");
    expect(taxonomy.ingredientIds).not.toContain("c_brown_sugar");
    expect(taxonomy.imagePrompt).toContain("ready-to-serve");
  });
});
