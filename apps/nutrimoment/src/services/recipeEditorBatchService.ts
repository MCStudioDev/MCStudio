export interface RecipeEditorBatchCandidate extends Record<string, unknown> {
  source_recipe_id: string;
}

export interface RecipeEditorBatchIndex {
  candidates: Map<string, RecipeEditorBatchCandidate>;
  errors: Map<string, string>;
  unexpectedIds: string[];
}

export function indexRecipeEditorBatchCandidates(
  payload: unknown,
  expectedSourceIds: string[]
): RecipeEditorBatchIndex {
  if (!Array.isArray(payload)) {
    throw new Error("Recipe editor batch response must be an array.");
  }

  const expected = new Set(expectedSourceIds);
  const candidates = new Map<string, RecipeEditorBatchCandidate>();
  const errors = new Map<string, string>();
  const unexpectedIds: string[] = [];

  for (const value of payload) {
    if (!value || typeof value !== "object") continue;
    const sourceId = "source_recipe_id" in value ? String(value.source_recipe_id).trim() : "";
    if (!sourceId || !expected.has(sourceId)) {
      if (sourceId) unexpectedIds.push(sourceId);
      continue;
    }
    if (candidates.has(sourceId)) {
      candidates.delete(sourceId);
      errors.set(sourceId, "duplicate_source_recipe_id");
      continue;
    }
    if (!errors.has(sourceId)) {
      candidates.set(sourceId, value as RecipeEditorBatchCandidate);
    }
  }

  for (const sourceId of expectedSourceIds) {
    if (!candidates.has(sourceId) && !errors.has(sourceId)) {
      errors.set(sourceId, "missing_source_recipe_id");
    }
  }

  return { candidates, errors, unexpectedIds };
}
