import type { RankedRecipeResult } from "@/lib/domain";

export interface RecipeSearchFreshnessOptions {
  explorationLimit: number;
  recentRecipeIds?: string[];
  seed?: string;
}

export interface RecipeFreshnessIdentity {
  dish_identity?: string;
  dish_intent?: { dish_name?: string };
  id?: string;
  name?: string;
  source_recipe_id?: string;
}

export function normalizeRecipeIngredientContextKey(ingredients: string[]) {
  return Array.from(new Set(
    ingredients
      .map((ingredient) => ingredient.trim().toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/gu, " ").trim())
      .filter(Boolean)
  )).sort().join("|");
}

export function filterPreviouslyShownRecipes<T extends RecipeFreshnessIdentity>(
  recipes: T[],
  recentRecipes: RecipeFreshnessIdentity[]
) {
  const recentKeys = new Set(recentRecipes.flatMap(getRecipeFreshnessIdentityKeys));
  if (!recentKeys.size) return recipes;
  return recipes.filter((recipe) => !getRecipeFreshnessIdentityKeys(recipe).some((key) => recentKeys.has(key)));
}

export function selectRecipeFreshnessBackfill<T extends RecipeFreshnessIdentity>(
  freshRecipes: T[],
  eligibleRecentRecipes: T[],
  requestedCount: number
) {
  const selected = freshRecipes.slice(0, Math.max(0, requestedCount));
  const backfilled: T[] = [];

  for (const candidate of eligibleRecentRecipes) {
    if (selected.length >= requestedCount) break;
    if (!filterPreviouslyShownRecipes([candidate], selected).length) continue;
    selected.push(candidate);
    backfilled.push(candidate);
  }

  return { backfilled, recipes: selected };
}

export function partitionRecentlyShownRecipes<
  T extends { id?: string; source_recipe_id?: string }
>(recipes: T[], recentRecipeIds: string[] = []) {
  const recentIds = new Set(recentRecipeIds.map(normalizeRecipeId).filter(Boolean));
  const fresh: T[] = [];
  const recent: T[] = [];

  for (const recipe of recipes) {
    const ids = [recipe.id, recipe.source_recipe_id]
      .map((value) => normalizeRecipeId(value ?? ""))
      .filter(Boolean);
    (ids.some((id) => recentIds.has(id)) ? recent : fresh).push(recipe);
  }

  return { fresh, recent };
}

const MATCH_QUALITY_RANK: Record<RankedRecipeResult["matchQuality"], number> = {
  great: 4,
  good: 3,
  possible: 2,
  stretch: 1
};

export function applyRecipeSearchFreshness(
  ranked: RankedRecipeResult[],
  options: RecipeSearchFreshnessOptions
) {
  if ((!options.seed && !options.recentRecipeIds?.length) || ranked.length < 2) return ranked;

  const recentRecipeIds = new Set(
    (options.recentRecipeIds ?? []).map(normalizeRecipeId).filter(Boolean)
  );
  const windowSize = Math.min(
    ranked.length,
    Math.max(12, Math.max(1, options.explorationLimit) * 4)
  );
  const explorationWindow = ranked.slice(0, windowSize);
  const remaining = ranked.slice(windowSize);
  const varied = explorationWindow
    .map((result, index) => ({
      index,
      recent: recentRecipeIds.has(normalizeRecipeId(result.recipeId)),
      result,
      variation: options.seed
        ? getSeededRecipeVariation(options.seed, result.recipeId)
        : index
    }))
    .sort((left, right) => {
      if (Boolean(left.result.hardRejected) !== Boolean(right.result.hardRejected)) {
        return Number(Boolean(left.result.hardRejected)) - Number(Boolean(right.result.hardRejected));
      }
      const qualityDifference = MATCH_QUALITY_RANK[right.result.matchQuality] - MATCH_QUALITY_RANK[left.result.matchQuality];
      if (qualityDifference) return qualityDifference;
      if (left.recent !== right.recent) return Number(left.recent) - Number(right.recent);
      // Once safety and match quality agree, use broad relevance bands so a
      // new click can explore other validated pantry matches instead of
      // permanently returning the same narrow score ordering.
      const scoreBandDifference = Math.floor(right.result.score / 20) - Math.floor(left.result.score / 20);
      if (scoreBandDifference) return scoreBandDifference;
      if (left.variation !== right.variation) return left.variation - right.variation;
      if (left.result.matchedRequiredCount !== right.result.matchedRequiredCount) {
        return right.result.matchedRequiredCount - left.result.matchedRequiredCount;
      }
      if (left.result.missingRequired.length !== right.result.missingRequired.length) {
        return left.result.missingRequired.length - right.result.missingRequired.length;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.result);

  return [...varied, ...remaining];
}

function normalizeRecipeId(value: string) {
  return value.trim().toLowerCase();
}

function getRecipeFreshnessIdentityKeys(recipe: RecipeFreshnessIdentity) {
  const values = [
    recipe.id,
    recipe.source_recipe_id,
    recipe.dish_identity,
    recipe.dish_intent?.dish_name,
    recipe.name
  ];
  const exactKeys = values
    .map((value) => normalizeRecipeIdentity(value ?? ""))
    .filter(Boolean);
  const conceptKeys = [recipe.dish_identity, recipe.dish_intent?.dish_name, recipe.name]
    .map((value) => buildDishConceptIdentity(value ?? ""))
    .filter(Boolean)
    .map((value) => `concept:${value}`);
  return Array.from(new Set([...exactKeys, ...conceptKeys]));
}

function normalizeRecipeIdentity(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const DISH_CONCEPT_STOP_WORDS = new Set([
  "al", "alla", "american", "and", "asian", "authentic", "bi", "bil", "chicken",
  "classic", "con", "egyptian", "farkh", "filipino", "greek", "indian", "italian",
  "mediterranean", "mexican", "middle", "eastern", "persian", "pollo", "simplified",
  "tavuk", "thai", "traditional", "turkish", "ve", "with"
]);

const DISH_CONCEPT_TOKEN_ALIASES: Record<string, string> = {
  roasted: "roast",
  tomatoes: "tomato",
  peppers: "pepper",
  skewers: "skewer"
};

function buildDishConceptIdentity(value: string) {
  const tokens = normalizeRecipeIdentity(value)
    .split(" ")
    .map((token) => DISH_CONCEPT_TOKEN_ALIASES[token] ?? token)
    .filter((token) => token && !DISH_CONCEPT_STOP_WORDS.has(token))
    .sort();
  return Array.from(new Set(tokens)).join(" ");
}

export function getSeededRecipeVariation(seed: string, identity: string) {
  return stableVariationNumber(`${seed}|${identity}`) / 0xffffffff;
}

function stableVariationNumber(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
