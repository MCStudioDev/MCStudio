import { describe, expect, it } from "vitest";
import {
  createRecipeValidationReport,
  recordRecipeGenerationTrace,
  recordRecipeLifecycle,
  recordRecipePipelineStage
} from "@/services/recipeValidationRepairService";
import type { Recipe } from "@/lib/types";

function recipe(id: string, name: string): Recipe {
  return {
    id,
    name,
    cuisine: "Italian",
    ingredients: ["Chicken"],
    missing_ingredients: [],
    steps: ["Cook the chicken."],
    calories: 500,
    protein: "35g",
    carbs: "30g",
    fat: "18g",
    fiber: "4g",
    sugar: "3g",
    sodium: "400mg",
    cook_time: "25 minutes",
    difficulty: "Easy",
    preference_hits: []
  };
}

describe("recipe pipeline reporting", () => {
  it("records candidate counts, removed IDs, reasons, and the first requested-count shortfall", () => {
    const report = createRecipeValidationReport({
      inputIngredients: ["chicken"],
      requestedCount: 2,
      requestId: "request-1"
    });
    const first = recipe("one", "Chicken One");
    const second = recipe("two", "Chicken Two");

    recordRecipePipelineStage(report, {
      entered: [first, second],
      exited: [first],
      reason: "safety_allergen:milk",
      stage: "safety"
    });

    expect(report.firstStageBelowRequested).toBe("safety");
    expect(report.stages).toEqual([
      expect.objectContaining({
        stage: "safety",
        entered: 2,
        exited: 1,
        removed: [expect.objectContaining({ id: "two", reason: "safety_allergen:milk" })]
      })
    ]);

    recordRecipeGenerationTrace(report, {
      type: "gemini_failed",
      attempt: 1,
      phase: "source_editor_1_attempt_1",
      reason: "timeout"
    });
    recordRecipeGenerationTrace(report, {
      type: "response",
      recipes: [first]
    });

    expect(report.generationTrace.gemini.failed).toEqual([
      expect.objectContaining({ phase: "source_editor_1_attempt_1", reason: "timeout" })
    ]);
    expect(report.generationTrace.response).toEqual({ recipeCount: 1, recipeIds: ["one"] });

    recordRecipeLifecycle(report, {
      recipeId: "two",
      title: "Chicken Two",
      selected: true
    });
    recordRecipeGenerationTrace(report, { type: "response", recipes: [first] });
    expect(report.generationTrace.recipes).toEqual(expect.arrayContaining([
      expect.objectContaining({ recipeId: "one", returnedStatus: "returned" }),
      expect.objectContaining({
        recipeId: "two",
        rejectionReason: "safety_allergen:milk",
        terminalStatus: "not_selected"
      })
    ]));
  });
});
