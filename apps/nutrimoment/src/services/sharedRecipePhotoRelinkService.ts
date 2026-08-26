import type { RecipeCatalogDoc } from "@/lib/domain";
import { buildPhotoIdentityFromCatalog } from "@/lib/photoIdentityBuilders";
import { buildRecipePhotoExactAliases } from "@/lib/recipePhotoExactIdentity";
import { buildRecipePhotoIdentity } from "@/lib/recipePhotoIdentity";
import {
  isReusableSharedRecipePhotoEntry,
  type SharedRecipePhotoEntry
} from "@/lib/sharedRecipePhotoCache";
import type { Recipe } from "@/lib/types";
import {
  normalizeRecipePhotoDietIds,
  scopeRecipePhotoAliasesForDiet
} from "@/services/recipePhotoDietCompatibility";
import { validateSharedRecipePhotoCandidate } from "@/services/sharedRecipePhotoLinkService";

export interface SharedRecipePhotoRelinkRecord {
  canonicalDishKey?: string;
  cookingMethodKey?: string;
  cuisineKey?: string;
  docId: string;
  entry: SharedRecipePhotoEntry;
  familyKey?: string;
  mainIngredientKey?: string;
  mealTypeKey?: string;
  queryCanonicalDishKey?: string;
  queryFamilyKey?: string;
  queryKey?: string;
  queryMainIngredientKey?: string;
  sauceKey?: string;
  signatureKey?: string;
  starchKey?: string;
}

export interface SharedRecipePhotoRelinkIndex {
  byCanonicalDishKey: Map<string, SharedRecipePhotoRelinkRecord[]>;
  byFamilyKey: Map<string, SharedRecipePhotoRelinkRecord[]>;
  byLookupKey: Map<string, SharedRecipePhotoRelinkRecord[]>;
}

export interface SharedRecipePhotoRelinkMatch {
  candidate: SharedRecipePhotoEntry;
  linkedRecipe: Recipe;
  score: number;
}

export function buildSharedRecipePhotoRelinkIndex(
  records: SharedRecipePhotoRelinkRecord[]
): SharedRecipePhotoRelinkIndex {
  const index: SharedRecipePhotoRelinkIndex = {
    byCanonicalDishKey: new Map(),
    byFamilyKey: new Map(),
    byLookupKey: new Map()
  };

  for (const record of records) {
    if (!isReusableSharedRecipePhotoEntry(record.entry)) continue;
    const queryIdentity = buildRecipePhotoIdentity(record.entry.query || record.entry.signature);
    const signatureIdentity = buildRecipePhotoIdentity(record.entry.signature);
    addRecord(index.byLookupKey, [
      record.docId,
      record.entry.query,
      record.entry.signature,
      record.queryKey,
      record.signatureKey
    ], record);
    addRecord(index.byCanonicalDishKey, [
      record.canonicalDishKey,
      record.queryCanonicalDishKey,
      record.entry.canonicalDishKey,
      queryIdentity.canonicalDishKey,
      signatureIdentity.canonicalDishKey
    ], record);
    addRecord(index.byFamilyKey, [
      record.familyKey,
      record.queryFamilyKey,
      record.entry.familyKey,
      queryIdentity.familyKey,
      signatureIdentity.familyKey
    ], record);
  }

  return index;
}

export function findSharedRecipePhotoRelinkMatch(
  recipe: RecipeCatalogDoc,
  index: SharedRecipePhotoRelinkIndex
): SharedRecipePhotoRelinkMatch | null {
  const diets = normalizeRecipePhotoDietIds(recipe.dietTags);
  const uiRecipe = buildRelinkValidationRecipe(recipe);
  const names = dedupeStrings([
    recipe.localized?.English?.name,
    recipe.localized?.Arabic?.name,
    recipe.title,
    recipe.dishIntent?.dish_name
  ]);
  const identities = names.map((name) => buildRecipePhotoIdentity(name));
  const unscopedAliases = buildRecipePhotoExactAliases({ cuisine: recipe.cuisine, names });
  const lookupKeys = dedupeStrings([
    ...scopeRecipePhotoAliasesForDiet(unscopedAliases, diets),
    ...unscopedAliases,
    ...names,
    ...identities.map((identity) => identity.signature)
  ]);
  const exactLookupSet = new Set(lookupKeys.map(normalizeLookupKey));
  const candidates = new Map<string, { record: SharedRecipePhotoRelinkRecord; score: number }>();

  collectCandidates(candidates, index.byLookupKey, lookupKeys, 220);

  const recipeTokens = collectStrongTokens(names.join(" "));
  const scored = Array.from(candidates.values())
    .map(({ record, score }) => ({
      record,
      score: score + scoreRecordForRecipe(record, identities, recipeTokens, exactLookupSet)
    }))
    .sort((left, right) => right.score - left.score || left.record.docId.localeCompare(right.record.docId));
  const seenUrls = new Set<string>();

  for (const { record, score } of scored) {
    if (seenUrls.has(record.entry.imageUrl)) continue;
    seenUrls.add(record.entry.imageUrl);
    if (!hasStrictQueryIdentityMatch([recipe.title], record.entry.query)) continue;
    const linkedRecipe = validateSharedRecipePhotoCandidate(uiRecipe, record.entry, diets);
    if (linkedRecipe) {
      return { candidate: record.entry, linkedRecipe, score };
    }
  }

  return null;
}

function hasStrictQueryIdentityMatch(recipeNames: string[], candidateQuery: string) {
  const candidateTokens = collectRelinkIdentityTokens(candidateQuery);
  if (!candidateTokens.size) return false;
  return recipeNames.some((name) => {
    const recipeTokens = collectRelinkIdentityTokens(name);
    return recipeTokens.size > 0 && Array.from(recipeTokens).every((token) => candidateTokens.has(token));
  });
}

function collectRelinkIdentityTokens(value: string) {
  return new Set(
    normalizeLookupKey(value)
      .replace(/[^a-z0-9\u0600-\u06ff]+/gi, " ")
      .split(/\s+/g)
      .map(normalizeRelinkIdentityToken)
      .filter((token) => token.length > 1 && !RELINK_IDENTITY_STOPWORDS.has(token))
  );
}

function normalizeRelinkIdentityToken(token: string) {
  if (/^(?:kafta|kofte|kofta)$/.test(token)) return "kofta";
  return token;
}

function buildRelinkValidationRecipe(recipe: RecipeCatalogDoc): Recipe {
  const english = recipe.localized?.English;
  const dishIntent = english?.dish_intent ?? recipe.localized?.Arabic?.dish_intent ?? recipe.dishIntent;
  return {
    id: recipe.id,
    name: english?.name?.trim() || recipe.title,
    cuisine: english?.cuisine?.trim() || recipe.cuisine,
    dish_intent: dishIntent,
    image_search_index: english?.image_search_index,
    image_search_indices: english?.image_search_indices,
    ingredients: (recipe.ingredients ?? []).map((ingredient) =>
      ingredient.name?.trim() || ingredient.canonical
    ).filter(Boolean),
    missing_ingredients: [],
    steps: [],
    calories: 0,
    protein: "0g",
    carbs: "0g",
    fat: "0g",
    cook_time: "",
    difficulty: "",
    photo_identity: buildPhotoIdentityFromCatalog(recipe)
  };
}

function scoreRecordForRecipe(
  record: SharedRecipePhotoRelinkRecord,
  identities: Array<ReturnType<typeof buildRecipePhotoIdentity>>,
  recipeTokens: Set<string>,
  exactLookupSet: Set<string>
) {
  let score = 0;
  const candidateIdentity = buildRecipePhotoIdentity(record.entry.query || record.entry.signature);
  const candidateLookupKeys = dedupeStrings([
    record.docId,
    record.entry.query,
    record.entry.signature,
    record.queryKey,
    record.signatureKey
  ]).map(normalizeLookupKey);
  if (candidateLookupKeys.some((key) => exactLookupSet.has(key))) score += 180;
  if (identities.some((identity) => keysMatch(identity.canonicalDishKey, candidateIdentity.canonicalDishKey))) score += 120;
  if (identities.some((identity) => keysMatch(identity.familyKey, candidateIdentity.familyKey))) score += 45;
  if (identities.some((identity) => keysMatch(identity.mainIngredientKey, candidateIdentity.mainIngredientKey))) score += 30;
  if (identities.some((identity) => keysMatch(identity.starchKey, candidateIdentity.starchKey))) score += 18;
  if (identities.some((identity) => keysMatch(identity.sauceKey, candidateIdentity.sauceKey))) score += 14;
  if (identities.some((identity) => keysMatch(identity.cookingMethodKey, candidateIdentity.cookingMethodKey))) score += 12;
  const candidateTokens = collectStrongTokens(`${record.entry.query} ${record.entry.signature}`);
  score += Array.from(recipeTokens).filter((token) => candidateTokens.has(token)).length * 6;
  return score;
}

function collectCandidates(
  target: Map<string, { record: SharedRecipePhotoRelinkRecord; score: number }>,
  source: Map<string, SharedRecipePhotoRelinkRecord[]>,
  keys: string[],
  score: number
) {
  for (const key of keys) {
    for (const record of source.get(normalizeLookupKey(key)) ?? []) {
      const existing = target.get(record.entry.imageUrl);
      if (!existing || existing.score < score) target.set(record.entry.imageUrl, { record, score });
    }
  }
}

function addRecord(
  target: Map<string, SharedRecipePhotoRelinkRecord[]>,
  keys: Array<string | null | undefined>,
  record: SharedRecipePhotoRelinkRecord
) {
  for (const key of dedupeStrings(keys)) {
    const normalized = normalizeLookupKey(key);
    if (!normalized) continue;
    const records = target.get(normalized) ?? [];
    if (!records.some((candidate) => candidate.entry.imageUrl === record.entry.imageUrl)) records.push(record);
    target.set(normalized, records);
  }
}

function collectStrongTokens(value: string) {
  return new Set(
    normalizeLookupKey(value)
      .replace(/[^a-z0-9\u0600-\u06ff]+/gi, " ")
      .split(/\s+/g)
      .filter((token) => token.length > 2 && !TOKEN_STOPWORDS.has(token))
  );
}

function keysMatch(left: string | null | undefined, right: string | null | undefined) {
  return Boolean(left && right && normalizeLookupKey(left) === normalizeLookupKey(right));
}

function normalizeLookupKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function dedupeStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

const TOKEN_STOPWORDS = new Set([
  "and", "dish", "dinner", "egyptian", "food", "generated", "lunch", "meal", "recipe", "strict", "style", "the", "with"
]);

const RELINK_IDENTITY_STOPWORDS = new Set([
  "and", "american", "asian", "baked", "classic", "dish", "easy", "egyptian", "food", "fried",
  "global", "grilled", "indian", "italian", "lunch", "meal", "mediterranean", "oven", "quick",
  "recipe", "style", "the", "traditional", "vegan", "vegetarian", "whole", "with"
]);
