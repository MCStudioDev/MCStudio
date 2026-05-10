import { findIngredientAliases } from "@/repositories/aliasRepo";
import { OFFLINE_INGREDIENT_ALIASES } from "@/data/offline/aliases";
import { OFFLINE_INGREDIENTS } from "@/data/offline/ingredients";
import { translateIngredientToEnglish } from "@/lib/arabicRecipeLocalization";
import type { IngredientAliasDoc } from "@/lib/domain";

export interface IngredientNormalizationResult {
  raw: string[];
  normalized: string[];
  resolved: Array<{
    raw: string;
    normalized: string;
    category?: string;
  }>;
  unmapped: string[];
  categories: Record<string, string>;
}

export async function normalizeIngredients(rawIngredients: string[]): Promise<IngredientNormalizationResult> {
  const cleaned = rawIngredients
    .flatMap(expandRawIngredientInput)
    .map(normalizeFreeText)
    .filter(Boolean);

  const aliases = await findIngredientAliases(cleaned);
  const aliasByKey = buildAliasLookup([...OFFLINE_INGREDIENT_ALIASES, ...aliases]);

  const normalized: string[] = [];
  const resolved: Array<{ raw: string; normalized: string; category?: string }> = [];
  const unmapped: string[] = [];
  const categories: Record<string, string> = {};

  for (const raw of cleaned) {
    const alias = aliasByKey.get(raw);
    if (alias) {
      normalized.push(alias.canonical);
      resolved.push({
        raw,
        normalized: alias.canonical,
        category: alias.category
      });
      if (alias.category) categories[alias.canonical] = alias.category;
      continue;
    }

    const heuristic = applyHeuristics(raw);
    const translated = normalizeFreeText(translateIngredientToEnglish(heuristic));
    const translatedAlias = aliasByKey.get(translated);
    if (translatedAlias) {
      normalized.push(translatedAlias.canonical);
      resolved.push({
        raw,
        normalized: translatedAlias.canonical,
        category: translatedAlias.category
      });
      if (translatedAlias.category) categories[translatedAlias.canonical] = translatedAlias.category;
      continue;
    }

    const heuristicAlias = aliasByKey.get(heuristic);
    if (heuristicAlias) {
      normalized.push(heuristicAlias.canonical);
      resolved.push({
        raw,
        normalized: heuristicAlias.canonical,
        category: heuristicAlias.category
      });
      if (heuristicAlias.category) categories[heuristicAlias.canonical] = heuristicAlias.category;
      continue;
    }

    const phraseMatches = findAliasMatchesInPhrase(heuristic, aliasByKey);
    if (phraseMatches.length) {
      for (const match of phraseMatches) {
        normalized.push(match.canonical);
        resolved.push({
          raw,
          normalized: match.canonical,
          category: match.category
        });
        if (match.category) categories[match.canonical] = match.category;
      }
      continue;
    }

    const fuzzyMatch = findFuzzyIngredientMatch(heuristic);
    if (fuzzyMatch) {
      normalized.push(fuzzyMatch.canonical);
      resolved.push({
        raw,
        normalized: fuzzyMatch.canonical,
        category: fuzzyMatch.category
      });
      if (fuzzyMatch.category) categories[fuzzyMatch.canonical] = fuzzyMatch.category;
      continue;
    }

    normalized.push(heuristic);
    resolved.push({
      raw,
      normalized: heuristic
    });
    unmapped.push(raw);
  }

  return {
    raw: cleaned,
    normalized: Array.from(new Set(normalized)),
    resolved,
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
  if (isArabicGroundMeat(value)) return "ground meat";

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
  const normalized = value
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return isArabicGroundMeat(normalized) ? "ground meat" : normalized;
}

function isArabicGroundMeat(value: string) {
  return /(?:\u0627\u0644)?\u0644\u062d\u0645(?:\u0629|\u0647)?\s+(?:\u0627\u0644)?\u0645\u0641\u0631\u0648\u0645(?:\u0629|\u0647)?\u0648?/iu.test(value);
}

function expandRawIngredientInput(value: string) {
  return value
    .split(/\s*(?:,|;|\/|\||\+|&|\band\b|\bor\b|\bwith\b|،|\s+او\s+|\s+أو\s+)\s*/giu)
    .map((part) => part.trim())
    .filter(Boolean);
}

function findAliasMatchesInPhrase(value: string, aliasByKey: Map<string, IngredientAliasDoc>) {
  const normalizedValue = normalizeFreeText(value);
  const matches = new Map<string, { canonical: string; category?: string; length: number }>();

  for (const [key, alias] of aliasByKey.entries()) {
    if (!key || key.length < 2 || key === normalizedValue) continue;
    if (!normalizedValue.includes(key)) continue;

    matches.set(alias.canonical, {
      canonical: alias.canonical,
      category: alias.category,
      length: key.length
    });
  }

  return Array.from(matches.values())
    .sort((left, right) => right.length - left.length)
    .map(({ canonical, category }) => ({ canonical, category }));
}

function findFuzzyIngredientMatch(value: string) {
  const normalizedValue = normalizeFreeText(value);
  if (!normalizedValue || normalizedValue.length < 4) return null;

  const candidates = buildFuzzyCandidates();
  let bestMatch: { canonical: string; category?: string; distance: number; candidateLength: number } | null = null;

  for (const candidate of candidates) {
    const distance = damerauLevenshtein(normalizedValue, candidate.key);
    const maxDistance = getAllowedDistance(normalizedValue.length, candidate.key.length);
    if (distance > maxDistance) continue;

    if (
      !bestMatch ||
      distance < bestMatch.distance ||
      (distance === bestMatch.distance && candidate.key.length < bestMatch.candidateLength)
    ) {
      bestMatch = {
        canonical: candidate.canonical,
        category: candidate.category,
        distance,
        candidateLength: candidate.key.length
      };
    }
  }

  return bestMatch ? { canonical: bestMatch.canonical, category: bestMatch.category } : null;
}

function buildFuzzyCandidates() {
  const candidates = new Map<string, { canonical: string; category?: string }>();

  for (const alias of OFFLINE_INGREDIENT_ALIASES) {
    for (const token of [alias.raw, alias.canonical, ...alias.synonyms, ...alias.misspellings]) {
      const key = normalizeFreeText(token);
      if (!key) continue;
      candidates.set(key, {
        canonical: alias.canonical,
        category: alias.category
      });
    }
  }

  for (const ingredient of OFFLINE_INGREDIENTS) {
    const key = normalizeFreeText(ingredient.name);
    if (!key || candidates.has(key)) continue;
    candidates.set(key, {
      canonical: ingredient.name,
      category: ingredient.category
    });
  }

  return Array.from(candidates.entries()).map(([key, value]) => ({
    key,
    canonical: value.canonical,
    category: value.category
  }));
}

function getAllowedDistance(leftLength: number, rightLength: number) {
  const longest = Math.max(leftLength, rightLength);
  if (longest <= 5) return 1;
  if (longest <= 10) return 2;
  return 3;
}

function damerauLevenshtein(left: string, right: string) {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let row = 0; row < rows; row += 1) {
    matrix[row][0] = row;
  }

  for (let col = 0; col < cols; col += 1) {
    matrix[0][col] = col;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const substitutionCost = left[row - 1] === right[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + substitutionCost
      );

      if (
        row > 1 &&
        col > 1 &&
        left[row - 1] === right[col - 2] &&
        left[row - 2] === right[col - 1]
      ) {
        matrix[row][col] = Math.min(matrix[row][col], matrix[row - 2][col - 2] + 1);
      }
    }
  }

  return matrix[left.length][right.length];
}
