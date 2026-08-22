import type { Recipe } from "@/lib/types";

/**
 * Merge is an identity operation, not a diversity policy. Distinct named
 * dishes must reach the shared validator before similarity limits are applied.
 */
export function dedupeExactRecipeCandidates<T extends Recipe>(recipes: T[]) {
  const selected: T[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  for (const recipe of recipes) {
    const ids = [recipe.source_recipe_id, recipe.id]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value));
    const nameKey = normalizeExactRecipeName(recipe.name);

    if (ids.some((id) => seenIds.has(id)) || (nameKey && seenNames.has(nameKey))) {
      continue;
    }

    selected.push(recipe);
    ids.forEach((id) => seenIds.add(id));
    if (nameKey) seenNames.add(nameKey);
  }

  return selected;
}

function normalizeExactRecipeName(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
