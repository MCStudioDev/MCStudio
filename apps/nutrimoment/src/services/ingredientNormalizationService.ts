import { findIngredientAliases } from "@/repositories/aliasRepo";
import type { IngredientAliasDoc } from "@/lib/domain";

export interface IngredientNormalizationResult {
  raw: string[];
  normalized: string[];
  unmapped: string[];
  categories: Record<string, string>;
}

export async function normalizeIngredients(rawIngredients: string[]): Promise<IngredientNormalizationResult> {
  const cleaned = rawIngredients
    .map(normalizeFreeText)
    .filter(Boolean);

  const aliases = await findIngredientAliases(cleaned);
  const aliasByKey = buildAliasLookup(aliases);

  const normalized: string[] = [];
  const unmapped: string[] = [];
  const categories: Record<string, string> = {};

  for (const raw of cleaned) {
    const alias = aliasByKey.get(raw);
    if (alias) {
      normalized.push(alias.canonical);
      if (alias.category) categories[alias.canonical] = alias.category;
      continue;
    }

    const heuristic = applyHeuristics(raw);
    normalized.push(heuristic);
    if (heuristic === raw) {
      unmapped.push(raw);
    }
  }

  return {
    raw: cleaned,
    normalized: Array.from(new Set(normalized)),
    unmapped: Array.from(new Set(unmapped)),
    categories
  };
}

function buildAliasLookup(aliases: IngredientAliasDoc[]) {
  const lookup = new Map<string, IngredientAliasDoc>();
  for (const alias of aliases) {
    [alias.raw, ...alias.synonyms, ...alias.misspellings].forEach((key) => {
      lookup.set(normalizeFreeText(key), alias);
    });
  }
  return lookup;
}

function applyHeuristics(value: string): string {
  return value
    .replace(/\bbreasts\b/g, "breast")
    .replace(/\btomatoes\b/g, "tomato")
    .replace(/\beggs\b/g, "egg")
    .replace(/\bbags?\b/g, "")
    .replace(/\bcans?\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeFreeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
