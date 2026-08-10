import { cuisineMatchesPreference } from "@/lib/cuisines";
import type { Recipe } from "@/lib/types";
import {
  createRecipeInputCoveragePlan,
  getRecipeInputAnchorIds,
  type RecipeInputCoveragePlan
} from "@/services/recipeInputCoverageService";

export const RECIPE_REQUEST_POLICY_VERSION = "recipe-request-policy-v1";

export interface RecipeRequestPolicyInput {
  allergens?: string[];
  conditions?: string[];
  diets?: string[];
  excludedIngredients?: string[];
  ingredients: string[];
  preferredCuisine?: string;
  requestedCount: number;
}

export interface CompiledRecipeRequestPolicy {
  adaptations: {
    conditions: string[];
  };
  coveragePlan: RecipeInputCoveragePlan;
  hardRestrictions: {
    allergens: string[];
    diets: string[];
    excludedIngredients: string[];
  };
  objectiveOrder: readonly [
    "eligibility",
    "requested_ingredient_count",
    "unmet_input_coverage",
    "cuisine_preference",
    "source_quality",
    "purchase_burden",
    "variety"
  ];
  preferences: {
    preferredCuisine: string;
  };
  requestedCount: number;
  version: typeof RECIPE_REQUEST_POLICY_VERSION;
}

export interface RecipeRequestPolicySelectionOptions<T extends Recipe> {
  isEligible?: (recipe: T) => boolean;
}

interface RankedPolicyCandidate<T extends Recipe> {
  anchorIds: string[];
  index: number;
  recipe: T;
}

export function compileRecipeRequestPolicy(input: RecipeRequestPolicyInput): CompiledRecipeRequestPolicy {
  const requestedCount = Math.max(1, Math.floor(input.requestedCount || 1));
  return {
    adaptations: {
      conditions: normalizeList(input.conditions)
    },
    coveragePlan: createRecipeInputCoveragePlan(input.ingredients, requestedCount),
    hardRestrictions: {
      allergens: normalizeList(input.allergens),
      diets: normalizeList(input.diets),
      excludedIngredients: normalizeList(input.excludedIngredients)
    },
    objectiveOrder: [
      "eligibility",
      "requested_ingredient_count",
      "unmet_input_coverage",
      "cuisine_preference",
      "source_quality",
      "purchase_burden",
      "variety"
    ],
    preferences: {
      preferredCuisine: input.preferredCuisine?.trim() || "Any"
    },
    requestedCount,
    version: RECIPE_REQUEST_POLICY_VERSION
  };
}

/**
 * Selects recipes using a lexicographic policy. Later objectives can never
 * outweigh requested-ingredient usage, which prevents diversity or recency
 * heuristics from hiding the best pantry match.
 */
export function selectRecipesByRequestPolicy<T extends Recipe>(
  recipes: T[],
  policy: CompiledRecipeRequestPolicy,
  limit = policy.requestedCount,
  options: RecipeRequestPolicySelectionOptions<T> = {}
) {
  const boundedLimit = Math.max(0, Math.floor(limit));
  if (!boundedLimit) return [];

  const candidates = dedupeCandidates(recipes)
    .filter((recipe) => options.isEligible?.(recipe) ?? true)
    .map((recipe, index): RankedPolicyCandidate<T> => ({
      anchorIds: getRecipeInputAnchorIds(recipe, policy.coveragePlan),
      index,
      recipe
    }))
    .filter((candidate) => !policy.coveragePlan.anchors.length || candidate.anchorIds.length > 0);
  const selected: RankedPolicyCandidate<T>[] = [];
  const remaining = [...candidates];
  const coverage = new Map(policy.coveragePlan.anchors.map((anchor) => [anchor.id, 0]));
  const targets = new Map(policy.coveragePlan.anchors.map((anchor) => [anchor.id, anchor.targetCards]));

  while (remaining.length && selected.length < boundedLimit) {
    remaining.sort((left, right) => compareCandidates(left, right, {
      coverage,
      policy,
      selected,
      targets
    }));
    const next = remaining.shift();
    if (!next) break;
    selected.push(next);
    next.anchorIds.forEach((anchorId) => coverage.set(anchorId, (coverage.get(anchorId) ?? 0) + 1));
  }

  return selected.map((candidate) => candidate.recipe);
}

function compareCandidates<T extends Recipe>(
  left: RankedPolicyCandidate<T>,
  right: RankedPolicyCandidate<T>,
  context: {
    coverage: Map<string, number>;
    policy: CompiledRecipeRequestPolicy;
    selected: Array<RankedPolicyCandidate<T>>;
    targets: Map<string, number>;
  }
) {
  const leftVector = buildPriorityVector(left, context);
  const rightVector = buildPriorityVector(right, context);
  for (let index = 0; index < leftVector.length; index += 1) {
    if (leftVector[index] !== rightVector[index]) {
      return rightVector[index] - leftVector[index];
    }
  }
  return left.index - right.index;
}

function buildPriorityVector<T extends Recipe>(
  candidate: RankedPolicyCandidate<T>,
  context: {
    coverage: Map<string, number>;
    policy: CompiledRecipeRequestPolicy;
    selected: Array<RankedPolicyCandidate<T>>;
    targets: Map<string, number>;
  }
) {
  const uncovered = candidate.anchorIds.filter((anchorId) => (context.coverage.get(anchorId) ?? 0) === 0).length;
  const unmetCoverage = candidate.anchorIds.reduce((total, anchorId) => {
    return total + Number((context.coverage.get(anchorId) ?? 0) < (context.targets.get(anchorId) ?? 0));
  }, 0);
  const preferredCuisine = context.policy.preferences.preferredCuisine;
  const cuisineFit = preferredCuisine === "Any" || !preferredCuisine
    ? 0
    : Number(cuisineMatchesPreference(candidate.recipe.cuisine, preferredCuisine));
  const sourceQuality = getSourceQuality(candidate.recipe);
  const purchaseBurden = -(candidate.recipe.missing_ingredients?.length ?? 0);
  const variety = getVarietyScore(candidate.recipe, context.selected.map((entry) => entry.recipe));

  return [
    candidate.anchorIds.length,
    uncovered,
    unmetCoverage,
    cuisineFit,
    getNamedDishSpecificity(candidate.recipe),
    sourceQuality,
    purchaseBurden,
    variety
  ];
}

function getNamedDishSpecificity(recipe: Recipe) {
  const identity = normalize(recipe.dish_identity ?? recipe.dish_intent?.dish_name ?? recipe.name);
  if (!identity || /\b(base recipe|generic|meal|plate|bowl|skillet|food|recipe)\b/.test(identity)) return 0;
  return recipe.dish_identity || recipe.dish_intent?.dish_name ? 2 : 1;
}

function getSourceQuality(recipe: Recipe) {
  if (recipe.recipe_source_type === "local_database") return 3;
  if (recipe.recipe_source_type === "external_source" && /^https?:\/\//i.test(recipe.source_url ?? "")) return 2;
  if (/^https?:\/\//i.test(recipe.source_url ?? "")) return 1;
  return 0;
}

function getVarietyScore(recipe: Recipe, selected: Recipe[]) {
  const cuisine = normalize(recipe.cuisine);
  const method = normalize(recipe.dish_intent?.cooking_method ?? "");
  const hasCuisine = selected.some((candidate) => normalize(candidate.cuisine) === cuisine);
  const hasMethod = method && selected.some((candidate) => normalize(candidate.dish_intent?.cooking_method ?? "") === method);
  return Number(!hasCuisine) + Number(Boolean(method) && !hasMethod);
}

function dedupeCandidates<T extends Recipe>(recipes: T[]) {
  const seen = new Set<string>();
  return recipes.filter((recipe, index) => {
    const key = normalize(recipe.id ?? recipe.source_recipe_id ?? recipe.dish_identity ?? recipe.name) || String(index);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeList(values: string[] | undefined) {
  return Array.from(new Set((values ?? []).map(normalize).filter(Boolean)));
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "").trim();
}
