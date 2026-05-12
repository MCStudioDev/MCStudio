import { buildRecipePhotoIdentity, normalizeRecipePhotoQuery, type RecipePhotoIdentity } from "@/lib/recipePhotoIdentity";

export function buildRecipePhotoReuseKeyFromIdentity(identity: RecipePhotoIdentity) {
  return (
    identity.canonicalDishKey ||
    identity.familyKey ||
    normalizeRecipePhotoQuery(identity.cleanQuery || identity.signature)
  );
}

export function buildRecipePhotoReuseKeyFromQuery(query?: string | null) {
  const normalized = normalizeRecipePhotoQuery(query ?? "");
  if (!normalized) return "";
  return buildRecipePhotoReuseKeyFromIdentity(buildRecipePhotoIdentity(normalized));
}

export function buildRecipePhotoReuseKeyCandidates(queries: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      queries
        .map(buildRecipePhotoReuseKeyFromQuery)
        .filter(Boolean)
    )
  );
}
