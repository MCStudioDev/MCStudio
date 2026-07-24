import { describe, expect, it } from "vitest";
import type { Recipe } from "../lib/types";
import { enforceRecipeDiversity } from "../services/recipeDiversityValidator";
import {
  createRecipeValidationReport,
  qualityReasonsAreRepairable,
  recordRecipeValidationTrace,
  updateRecipeValidationFunnel,
  repairRecipeForValidation
} from "../services/recipeValidationRepairService";
import { RecipeQualityGate } from "../services/recipeQualityGate";

const brokenSourceRecipe: Recipe = {
  id: "source-1",
  name: "Chicken",
  cuisine: "Italian",
  recipe_source_type: "local_database",
  dish_identity: "Chicken Cacciatore",
  ingredients: ["Chicken Breast", "tomatoes", "tomatoes", "olive oil"],
  missing_ingredients: [],
  steps: ["Cook chicken.", "Cook chicken."],
  calories: 0,
  protein: "",
  carbs: "",
  fat: "",
  cook_time: "",
  difficulty: ""
};

describe("recipe validation repair service", () => {
  it("repairs source recipes before quality rejection", () => {
    const repair = repairRecipeForValidation(brokenSourceRecipe, {
      recipeLanguage: "English",
      scoringIngredients: ["chicken"]
    });
    const quality = new RecipeQualityGate().validate(repair.recipe, "English");

    expect(repair.recipe.name).toBe("Chicken Cacciatore");
    expect(repair.recipe.ingredients).toEqual([
      "2 pieces Chicken Breast",
      "1 piece tomatoes",
      "1 tsp olive oil"
    ]);
    expect(repair.recipe.steps).toHaveLength(3);
    expect(repair.recipe.steps.join(" ")).toMatch(/tomatoes|olive oil/i);
    expect(repair.recipe.cook_time).toBe("30 minutes");
    expect(repair.recipe.calories).toBe(450);
    expect(quality.reasons).not.toEqual(expect.arrayContaining([
      "ingredient_only_title",
      "duplicate_ingredients",
      "duplicate_instructions",
      "missing_required_fields",
      "protein_missing_quantity:chicken breast"
    ]));
  });

  it("marks residual quantity/title issues as repairable instead of hard blockers", () => {
    expect(qualityReasonsAreRepairable([
      "ingredient_missing_quantity_or_unit:olive oil",
      "ingredient_only_title"
    ])).toBe(true);
  });

  it("records validator decisions with recipe identity and repair state", () => {
    const report = createRecipeValidationReport({
      inputIngredients: ["Chicken"],
      requestedCount: 10,
      requestId: "request-1"
    });

    recordRecipeValidationTrace(report, {
      finalDecision: "rejected",
      reason: "ingredient_missing_quantity_or_unit:olive oil",
      recipe: brokenSourceRecipe,
      repairActions: ["inferred_missing_quantity"],
      repairAttempted: true,
      validator: "RecipeQualityGate"
    });

    expect(report.traces[0]).toMatchObject({
      finalDecision: "rejected",
      recipeId: "source-1",
      recipeName: "Chicken",
      repairAttempted: true,
      validator: "RecipeQualityGate"
    });
  });

  it("produces a compact validation funnel report for one request", () => {
    const report = createRecipeValidationReport({
      inputIngredients: ["Chicken"],
      requestedCount: 10,
      requestId: "request-2"
    });

    updateRecipeValidationFunnel(report, {
      database_found: 8,
      after_title_validation: 7,
      after_quantity_validation: 5,
      after_diversity: 3,
      after_quality_gate: 0,
      returned: 0,
      failure_reason: "Quality gate rejected remaining recipes."
    });

    expect(report).toMatchObject({
      requested: 10,
      database_found: 8,
      after_title_validation: 7,
      after_quantity_validation: 5,
      after_diversity: 3,
      after_quality_gate: 0,
      returned: 0,
      failure_reason: "Quality gate rejected remaining recipes."
    });
  });

  it("soft-fills similar recipes when strict diversity would underfill", () => {
    const duplicate = {
      ...brokenSourceRecipe,
      id: "source-2",
      name: "Baked Chicken Cacciatore",
      ingredients: ["2 pieces Chicken Breast", "1 cup tomatoes", "1 tsp olive oil"],
      steps: [
        "Bake the chicken with tomatoes.",
        "Serve the chicken with olive oil."
      ],
      cook_time: "30 minutes",
      difficulty: "Easy",
      calories: 450,
      protein: "35g",
      carbs: "20g",
      fat: "18g"
    };

    const selected = enforceRecipeDiversity([duplicate, { ...duplicate, id: "source-3" }], {
      limit: 2,
      similarityThreshold: 0.1,
      softFill: true
    });

    expect(selected).toHaveLength(2);
  });
});
