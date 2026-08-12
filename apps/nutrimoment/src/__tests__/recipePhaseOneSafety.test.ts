import { describe, expect, it } from "vitest";
import type { Recipe } from "../lib/types";
import {
  createRecipeIdentityContract,
  canonicalizeRecipeIdentityMetadata,
  filterCandidatesByIdentityContract,
  lockRecipeCandidateIdentities,
  normalizeRecipeLosslessly,
  validateRecipeIdentityContent,
  validateRecipeIdentityConsistency,
  validateRecipeIdentityContract
} from "../services/recipeIdentityContractService";
import {
  createRecipeValidationReport,
  finalizeRecipeCandidateTrace,
  recordRecipePipelineStage
} from "../services/recipeValidationRepairService";
import { RecipeGeminiCallBudget } from "../services/recipeGeminiCallBudget";

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: "sayadeya-1",
    name: "Sayadeya",
    cuisine: "Egyptian",
    dish_identity: "Sayadeya",
    dish_intent: {
      dish_name: "Sayadeya",
      cuisine: "Egyptian",
      cooking_method: "baked fish and rice",
      visual_keywords: ["Egyptian Sayadeya fish rice"],
      exclude_keywords: []
    },
    photo_identity: {
      dish_slug: "sayadeya",
      english_name: "Sayadeya",
      cuisine_key: "egyptian",
      method: "baked fish and rice",
      protein: "fish",
      starch: "rice"
    },
    image_search_index: "Egyptian Sayadeya fish rice",
    image_search_indices: ["Egyptian Sayadeya fish rice"],
    ingredients: ["1 lb white fish", "1 cup rice", "1 large onion"],
    missing_ingredients: ["1 tsp cumin"],
    steps: [
      "Brown the onion for 10 minutes.",
      "Bake the fish and rice until the fish reaches 145 F."
    ],
    calories: 520,
    protein: "38g",
    carbs: "55g",
    fat: "14g",
    cook_time: "45 minutes",
    difficulty: "Medium",
    ...overrides
  };
}

describe("phase-one recipe safety", () => {
  it("allows only one Gemini recipe batch call per request", () => {
    const budget = new RecipeGeminiCallBudget();

    budget.claim("source_editor_batch");

    expect(() => budget.claim("acceptance_replacement")).toThrowError(
      /already used by source_editor_batch/i
    );
    expect(budget.callCount).toBe(1);
  });

  it("rejects a title, dish-intent, and photo identity graph that describes different dishes", () => {
    const corrupted = recipe({
      name: "Samak bil Forn",
      dish_identity: "Samak bil Forn"
    });

    expect(validateRecipeIdentityConsistency(corrupted)).toEqual(expect.arrayContaining([
      "dish_intent_name_mismatch",
      "photo_identity_name_mismatch"
    ]));
  });

  it("detects and canonically corrects a known dish assigned to an unrelated cuisine", () => {
    const corrupted = recipe({
      name: "Ratatouille",
      dish_identity: "Ratatouille",
      cuisine: "Egyptian",
      dish_intent: {
        dish_name: "Ratatouille",
        cuisine: "Egyptian",
        cooking_method: "stewed",
        visual_keywords: [],
        exclude_keywords: []
      },
      photo_identity: undefined
    });

    expect(validateRecipeIdentityConsistency(corrupted)).toContain(
      "identity_title_cuisine_mismatch"
    );
    const canonical = canonicalizeRecipeIdentityMetadata(corrupted);
    expect(canonical.cuisine).toBe("Mediterranean");
    expect(canonical.dish_intent?.cuisine).toBe("Mediterranean");
    expect(canonical.image_search_index).toMatch(/ratatouille mediterranean/i);
  });

  it("allows content edits but rejects identity changes after the candidate is locked", () => {
    const source = recipe();
    const contract = createRecipeIdentityContract(source);
    const contentOnlyEdit = {
      ...source,
      ingredients: [...source.ingredients, "1 tbsp olive oil"],
      steps: [...source.steps, "Rest for 3 minutes before serving."]
    };
    const identityEdit = {
      ...contentOnlyEdit,
      name: "Grilled Steak",
      cuisine: "American",
      dish_intent: {
        ...source.dish_intent!,
        dish_name: "Grilled Steak",
        cooking_method: "grilled"
      }
    };

    expect(validateRecipeIdentityContract(contentOnlyEdit, contract)).toEqual([]);
    expect(validateRecipeIdentityContract(identityEdit, contract)).toEqual(expect.arrayContaining([
      "identity_name_changed",
      "identity_cuisine_changed",
      "identity_dish_intent_changed"
    ]));
  });

  it("rejects instructions and protein forms that contradict the locked dish identity", () => {
    const steakWithStewInstructions = recipe({
      name: "Grilled Sirloin Steak",
      dish_identity: "Grilled Sirloin Steak",
      cuisine: "American",
      dish_intent: {
        dish_name: "Grilled Sirloin Steak",
        cuisine: "American",
        cooking_method: "grilled",
        visual_keywords: ["grilled sirloin steak"],
        exclude_keywords: []
      },
      photo_identity: {
        dish_slug: "grilled-sirloin-steak",
        english_name: "Grilled Sirloin Steak",
        cuisine_key: "american",
        method: "grilled",
        protein: "steak"
      },
      ingredients: ["1 lb ground beef", "1 large onion"],
      steps: [
        "Brown the ground beef in a pot.",
        "Add water, cover, and simmer for 90 minutes until tender."
      ]
    });

    expect(validateRecipeIdentityContent(steakWithStewInstructions)).toEqual(expect.arrayContaining([
      "identity_method_steps_mismatch:grilled",
      "identity_protein_form_content_mismatch:steak"
    ]));
  });

  it("does not mistake freshly ground pepper for ground meat", () => {
    const steak = recipe({
      name: "Bistecca alla Fiorentina",
      dish_identity: "Bistecca alla Fiorentina",
      cuisine: "Italian",
      ingredients: [
        "2 lb porterhouse steak",
        "1 tsp freshly ground black pepper",
        "1 tsp coarse sea salt"
      ],
      steps: [
        "Grill the porterhouse steak for 5 minutes per side.",
        "Rest for 5 minutes, season with salt and freshly ground black pepper, and slice."
      ]
    });

    expect(validateRecipeIdentityContent(steak)).not.toContain(
      "identity_protein_form_content_mismatch:steak"
    );
  });

  it("losslessly normalizes formatting without changing recipe facts", () => {
    const source = recipe({
      name: "  Sayadeya  ",
      ingredients: ["  1 lb white fish  ", "1 cup rice"],
      steps: ["  Brown the onion for 10 minutes.  ", "Bake the fish for 20 minutes. "]
    });

    const normalized = normalizeRecipeLosslessly(source);

    expect(normalized.name).toBe("Sayadeya");
    expect(normalized.ingredients).toEqual(["1 lb white fish", "1 cup rice"]);
    expect(normalized.steps).toEqual([
      "Brown the onion for 10 minutes.",
      "Bake the fish for 20 minutes."
    ]);
    expect(normalized.dish_intent).toEqual(source.dish_intent);
    expect(normalized.photo_identity).toEqual(source.photo_identity);
    expect(normalized.calories).toBe(source.calories);
  });

  it("locks consistent candidates and rejects corruption before and after finalization", () => {
    const valid = recipe();
    const staleDerivedIdentity = recipe({
      id: "stale-derived-identity",
      name: "Samak bil Forn",
      dish_identity: "Samak bil Forn"
    });
    const irreconcilableIdentity = recipe({
      id: "identity-conflict",
      name: "Grilled Steak",
      dish_identity: "Beef Stroganoff"
    });
    const locked = lockRecipeCandidateIdentities([valid, staleDerivedIdentity, irreconcilableIdentity]);

    expect(locked.recipes.map((candidate) => candidate.id)).toEqual([
      "sayadeya-1",
      "stale-derived-identity"
    ]);
    const canonicalized = locked.recipes[1];
    expect(canonicalized.dish_intent?.dish_name).toBe("Samak bil Forn");
    expect(canonicalized.photo_identity?.english_name).toMatch(/samak bil forn/i);
    expect(canonicalized.image_search_indices?.join(" ")).not.toMatch(/sayadeya/i);
    expect(locked.rejected[0]).toMatchObject({
      recipe: irreconcilableIdentity,
      reasons: expect.arrayContaining(["dish_identity_name_mismatch"])
    });

    const changedAfterLoad = {
      ...valid,
      name: "Grilled Steak"
    };
    const final = filterCandidatesByIdentityContract([changedAfterLoad], locked.contracts);

    expect(final.recipes).toEqual([]);
    expect(final.rejected[0]).toMatchObject({
      reasons: expect.arrayContaining(["identity_name_changed"])
    });
  });

  it("rebuilds only derived identity metadata and preserves recipe content byte-for-byte", () => {
    const source = recipe({
      name: "Samak bil Forn",
      dish_identity: "Samak bil Forn"
    });

    const canonical = canonicalizeRecipeIdentityMetadata(source);

    expect(canonical.ingredients).toEqual(source.ingredients);
    expect(canonical.steps).toEqual(source.steps);
    expect(canonical.calories).toBe(source.calories);
    expect(canonical.dish_intent?.dish_name).toBe("Samak bil Forn");
    expect(canonical.image_search_index).toMatch(/samak bil forn/i);
  });

  it("assigns a terminal trace outcome to every candidate loaded by the pipeline", () => {
    const report = createRecipeValidationReport({
      inputIngredients: ["fish", "rice", "onion"],
      requestedCount: 1,
      requestId: "phase-one-trace"
    });
    const selected = recipe();
    const dropped = recipe({ id: "fish-2", name: "Fish Pilaf", dish_identity: "Fish Pilaf" });

    recordRecipePipelineStage(report, {
      entered: [],
      exited: [selected, dropped],
      stage: "recipe_candidates_loaded"
    });
    recordRecipePipelineStage(report, {
      entered: [selected, dropped],
      exited: [selected],
      reason: "lower_ranked_candidate",
      stage: "response_limit"
    });
    finalizeRecipeCandidateTrace(report, [selected]);

    expect(report.generationTrace.recipes).toEqual(expect.arrayContaining([
      expect.objectContaining({ recipeId: "sayadeya-1", terminalStatus: "returned" }),
      expect.objectContaining({ recipeId: "fish-2", terminalStatus: "not_selected" })
    ]));
    expect(report.generationTrace.recipes.every((entry) => entry.lastStage)).toBe(true);
  });
});
