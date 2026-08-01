export interface RecipeEditorAccess {
  isAdmin: boolean;
  isPremium: boolean;
}

export function shouldRunPremiumRecipeEditor(access: RecipeEditorAccess, sourceRecipeCount: number) {
  return sourceRecipeCount > 0 && (access.isPremium || access.isAdmin);
}

export function shouldFinalizeSourceCandidatesBeforeEditor(access: RecipeEditorAccess) {
  return !(access.isPremium || access.isAdmin);
}

export function prioritizeCuratedRecipeSources<T extends { id?: string; name?: string }>(
  recipes: T[],
  limit: number
) {
  const boundedLimit = Math.max(0, Math.floor(limit));
  const prioritized = [
    ...recipes.filter((recipe) => recipe.id?.startsWith("trusted-source-")),
    ...recipes.filter((recipe) => !recipe.id?.startsWith("trusted-source-"))
  ];
  const seen = new Set<string>();

  return prioritized.filter((recipe) => {
    const key = recipe.id?.trim() || recipe.name?.trim().toLowerCase() || "";
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, boundedLimit);
}

export function getPremiumRecipeEditorCandidateCount(input: {
  hasAdaptationConstraints: boolean;
  requestedRecipeCount: number;
}) {
  const requested = Math.max(1, Math.floor(input.requestedRecipeCount));
  if (input.hasAdaptationConstraints) return Math.min(18, requested + Math.max(4, Math.ceil(requested / 3)));
  return requested + Math.min(4, Math.ceil(requested / 3));
}

export function getGroundedUnderfillRequestCount(missingRecipeCount: number) {
  const missing = Math.max(0, Math.floor(missingRecipeCount));
  return missing > 0 ? Math.min(5, missing + 1) : 0;
}

export function shouldServeDatasetBeforeRecipeEditor(input: {
  access: RecipeEditorAccess;
  availableRecipeCount: number;
  requestedRecipeCount: number;
}) {
  return (
    input.availableRecipeCount >= input.requestedRecipeCount &&
    !shouldRunPremiumRecipeEditor(input.access, input.availableRecipeCount)
  );
}

export function shouldExpandRecipeSourceSearch(input: {
  availableRecipeCount: number;
  qualityRecipeCount?: number;
  requestedRecipeCount: number;
}) {
  return input.availableRecipeCount < input.requestedRecipeCount ||
    (input.qualityRecipeCount != null && input.qualityRecipeCount < input.requestedRecipeCount);
}

export function shouldRunBulkRecipeRepair(input: {
  editorTargetCount: number;
  missingRecipeCount: number;
  referenceCount: number;
}) {
  return input.editorTargetCount === 0 && input.referenceCount === 0 && input.missingRecipeCount > 0;
}
