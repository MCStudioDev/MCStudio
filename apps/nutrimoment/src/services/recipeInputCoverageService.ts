import { IngredientNormalizer, normalizeIngredientText } from "@/food/IngredientNormalizer";
import type { Recipe } from "@/lib/types";
import { requiresSeparatePantryPurchase } from "@/services/recipeIngredientOwnershipService";

const ingredientNormalizer = new IngredientNormalizer();

const LOW_SIGNAL_INGREDIENT_IDS = new Set([
  "black_pepper",
  "cooking_oil",
  "olive_oil",
  "oil",
  "salt",
  "water"
]);

const GENERIC_ALIAS_TERMS = new Set(["food", "ingredient", "meat", "protein", "vegetable", "vegetables"]);
const RECIPE_SLOT_VARIATIONS = [
  "braised_or_stewed",
  "baked_or_roasted",
  "pan_seared_or_fried",
  "grilled_or_skewered",
  "pasta_or_noodle",
  "rice_or_grain",
  "soup_or_broth",
  "stuffed_or_composed"
] as const;

export interface RecipeInputAnchor {
  aliases: string[];
  category?: string;
  id: string;
  name: string;
  targetCards: number;
}

export interface RecipeInputCoveragePlan {
  anchors: RecipeInputAnchor[];
  mode: "maximize_input_usage";
  preferMultiAnchorRecipes: true;
  requestedCount: number;
}

export interface RecipeInputCoverageAnalysis {
  cardsUsingMultipleAnchors: string[];
  cardsUsingNoAnchor: string[];
  coverage: Record<string, number>;
  meetsTargets: boolean;
  missingAnchors: string[];
}

export function createRecipeInputCoveragePlan(
  inputIngredients: string[],
  requestedCount: number
): RecipeInputCoveragePlan {
  const normalized = ingredientNormalizer.normalize(inputIngredients);
  const anchorsById = new Map<string, Omit<RecipeInputAnchor, "targetCards">>();

  normalized.forEach((ingredient) => {
    if (LOW_SIGNAL_INGREDIENT_IDS.has(ingredient.id) || anchorsById.has(ingredient.id)) return;
    const rawName = normalizeIngredientText(ingredient.raw);
    const name = shouldPreserveSpecificInputName(rawName, ingredient.canonicalEnglishName)
      ? rawName
      : ingredient.canonicalEnglishName;
    const aliases = Array.from(new Set([
      name,
      ingredient.canonicalEnglishName,
      ingredient.id.replace(/_/g, " "),
      ...ingredient.aliases
        .filter((alias) => alias.weight >= 90)
        .map((alias) => alias.term)
    ]))
      .map(normalizeIngredientText)
      .filter((alias) => alias.length >= 3 && !GENERIC_ALIAS_TERMS.has(alias));

    anchorsById.set(ingredient.id, {
      aliases,
      category: ingredient.category,
      id: ingredient.id,
      name
    });
  });

  const anchors = [...anchorsById.values()];
  const boundedCount = Math.max(1, Math.floor(requestedCount || 1));
  const baseTarget = anchors.length ? Math.floor(boundedCount / anchors.length) : 0;
  const remainder = anchors.length ? boundedCount % anchors.length : 0;

  return {
    anchors: anchors.map((anchor, index) => ({
      ...anchor,
      targetCards: Math.max(1, baseTarget + (index < remainder ? 1 : 0))
    })),
    mode: "maximize_input_usage",
    preferMultiAnchorRecipes: true,
    requestedCount: boundedCount
  };
}

export function toRecipeInputCoveragePrompt(plan: RecipeInputCoveragePlan) {
  const remainingSlots = new Map(plan.anchors.map((anchor) => [anchor.id, anchor.targetCards]));
  const recipeSlots: Array<{ requiredAnchorId: string; slot: number; variationKey: string }> = [];
  const anchorOccurrences = new Map(plan.anchors.map((anchor) => [anchor.id, 0]));
  while (recipeSlots.length < plan.requestedCount) {
    let assigned = false;
    for (const anchor of plan.anchors) {
      const remaining = remainingSlots.get(anchor.id) ?? 0;
      if (remaining <= 0 || recipeSlots.length >= plan.requestedCount) continue;
      const occurrence = anchorOccurrences.get(anchor.id) ?? 0;
      recipeSlots.push({
        requiredAnchorId: anchor.id,
        slot: recipeSlots.length + 1,
        variationKey: RECIPE_SLOT_VARIATIONS[occurrence % RECIPE_SLOT_VARIATIONS.length]
      });
      anchorOccurrences.set(anchor.id, occurrence + 1);
      remainingSlots.set(anchor.id, remaining - 1);
      assigned = true;
    }
    if (!assigned) break;
  }

  return {
    anchors: plan.anchors.map(({ category, id, name, targetCards }) => ({
      category: category ?? "other",
      id,
      name,
      targetCards
    })),
    combinationPriority: {
      establishedDishesOnly: true,
      preferredAnchorIds: plan.anchors.map((anchor) => anchor.id),
      targetMultiAnchorCards: plan.anchors.length > 1
        ? Math.min(plan.requestedCount, Math.max(1, Math.ceil(plan.requestedCount / 3)))
        : 0
    },
    everyRecipeUsesAtLeastOneAnchor: true,
    mode: plan.mode,
    preferMultiAnchorRecipes: plan.preferMultiAnchorRecipes,
    recipeSlots
  };
}

export type RecipeInputCoveragePrompt = ReturnType<typeof toRecipeInputCoveragePrompt>;

export function getRecipeInputAnchorIds(recipe: Recipe, plan: RecipeInputCoveragePlan) {
  const values = [
    recipe.name,
    recipe.dish_identity ?? "",
    recipe.dish_intent?.dish_name ?? "",
    recipe.photo_identity?.protein ?? "",
    ...recipe.ingredients,
    ...recipe.missing_ingredients
  ]
    .map(normalizeIngredientText)
    .filter(Boolean)
    .filter((value) => !requiresSeparatePantryPurchase(value));

  return plan.anchors
    .filter((anchor) => anchor.aliases.some((alias) => values.some((value) => containsPhrase(value, alias))))
    .map((anchor) => anchor.id);
}

export function selectRecipesForInputCoverage<T extends Recipe>(
  recipes: T[],
  plan: RecipeInputCoveragePlan,
  limit: number
) {
  const boundedLimit = Math.max(0, Math.floor(limit));
  if (!boundedLimit || !recipes.length) return [];
  if (!plan.anchors.length) return recipes.slice(0, boundedLimit);

  const candidates = recipes
    .map((recipe, index) => ({
      anchorIds: getRecipeInputAnchorIds(recipe, plan),
      index,
      recipe
    }))
    .filter((candidate) => candidate.anchorIds.length > 0);
  const selected: T[] = [];
  const selectedIndexes = new Set<number>();
  const coverage = new Map(plan.anchors.map((anchor) => [anchor.id, 0]));
  const targets = new Map(plan.anchors.map((anchor) => [anchor.id, anchor.targetCards]));

  while (selected.length < boundedLimit && selectedIndexes.size < candidates.length) {
    let best: (typeof candidates)[number] | undefined;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const candidate of candidates) {
      if (selectedIndexes.has(candidate.index)) continue;
      const uncovered = candidate.anchorIds.filter((id) => (coverage.get(id) ?? 0) === 0).length;
      const unmet = candidate.anchorIds.reduce((sum, id) => {
        return sum + Math.max(0, (targets.get(id) ?? 0) - (coverage.get(id) ?? 0));
      }, 0);
      const score = uncovered * 10_000 + unmet * 1_000 + candidate.anchorIds.length * 100 - candidate.index;
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    if (!best) break;
    selected.push(best.recipe);
    selectedIndexes.add(best.index);
    best.anchorIds.forEach((id) => coverage.set(id, (coverage.get(id) ?? 0) + 1));
  }

  return selected;
}

export function analyzeRecipeInputCoverage(
  recipes: Recipe[],
  plan: RecipeInputCoveragePlan
): RecipeInputCoverageAnalysis {
  const coverage = Object.fromEntries(plan.anchors.map((anchor) => [anchor.id, 0]));
  const cardsUsingNoAnchor: string[] = [];
  const cardsUsingMultipleAnchors: string[] = [];

  recipes.forEach((recipe) => {
    const anchorIds = getRecipeInputAnchorIds(recipe, plan);
    if (!anchorIds.length) cardsUsingNoAnchor.push(recipe.name);
    if (anchorIds.length > 1) cardsUsingMultipleAnchors.push(recipe.name);
    anchorIds.forEach((id) => {
      coverage[id] = (coverage[id] ?? 0) + 1;
    });
  });

  const missingAnchors = plan.anchors
    .filter((anchor) => (coverage[anchor.id] ?? 0) === 0)
    .map((anchor) => anchor.id);
  // Slot targets guide generation toward balance, but final acceptance uses a
  // tolerance band. A useful ten-card set should not fail because a 4/3/3
  // aspiration naturally landed at 3/4/3 while every input is well represented.
  const meetsTargets = plan.anchors.every((anchor) => (
    coverage[anchor.id] ?? 0
  ) >= Math.max(1, Math.ceil(anchor.targetCards / 2)));

  return {
    cardsUsingMultipleAnchors,
    cardsUsingNoAnchor,
    coverage,
    meetsTargets,
    missingAnchors
  };
}

export function doesRecipeSetMeetInputCoverage(
  recipes: Recipe[],
  plan: RecipeInputCoveragePlan
) {
  if (!plan.anchors.length) return true;
  const analysis = analyzeRecipeInputCoverage(recipes, plan);
  return analysis.meetsTargets && analysis.cardsUsingNoAnchor.length === 0;
}

function shouldPreserveSpecificInputName(rawName: string, canonicalName: string) {
  if (!rawName || rawName === normalizeIngredientText(canonicalName)) return false;
  return /\b(?:steak|sirloin|ribeye|tenderloin|filet|flank|skirt|ground|minced|whole|breast|thigh)\b/.test(rawName);
}

function containsPhrase(value: string, phrase: string) {
  if (!value || !phrase) return false;
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${escaped}(?:s)?(?:$|\\s)`, "u").test(value);
}
