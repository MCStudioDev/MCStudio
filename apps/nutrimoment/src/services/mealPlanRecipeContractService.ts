import { normalizeCuisineLabel } from "@/lib/cuisines";
import { findRecipeDietViolation, type DietEnforcementContext } from "@/lib/dietEnforcement";
import { findRecipeHealthViolation } from "@/lib/healthEnforcement";
import type { MealPlanData, MealPlanMeal, Recipe } from "@/lib/types";
import { RecipeAcceptanceEngine } from "@/services/recipeAcceptanceEngine";
import { getBlockingEditedRecipeQualityReasons } from "@/services/recipeEditorFallbackService";
import { RecipeQualityGate } from "@/services/recipeQualityGate";

type MealSlot = "breakfast" | "lunch" | "dinner";

export interface MealPlanRecipeContractIssue {
  dayIndex: number;
  mealName: string;
  reasons: string[];
  slot: MealSlot;
}

export interface MealPlanRecipeAlignmentResult {
  issuesAfter: MealPlanRecipeContractIssue[];
  issuesBefore: MealPlanRecipeContractIssue[];
  mealPlan: MealPlanData;
  replacementMeals: MealPlanMeal[];
  replacedSlots: number;
}

interface MealPlanRecipeContractOptions {
  conditions?: string[];
  dietContext: DietEnforcementContext;
  maxMealReuse?: number;
  maxSimilarMealSlots?: number;
  preferredCuisine?: string;
  recipeLanguage: string;
  replacementMeals?: MealPlanMeal[];
}

const qualityGate = new RecipeQualityGate();
const acceptanceEngine = new RecipeAcceptanceEngine();

export function evaluateMealPlanMealRecipeContract(
  meal: MealPlanMeal,
  recipeLanguage: string,
  selectedRecipes: Recipe[] = []
) {
  const recipe = mealPlanMealToRecipe(meal);
  const quality = qualityGate.validate(recipe, recipeLanguage);
  const blockingReasons = getBlockingEditedRecipeQualityReasons(quality.reasons);
  const fundamentalReasons = getFundamentalMealReasons(meal);
  const acceptance = acceptanceEngine.evaluate(recipe, {
    allowRepairableQualityIssues: true,
    blockingQualityReasons: blockingReasons,
    failOpen: recipe.recipe_source_type === "local_database",
    imageReady: Boolean(recipe.image_url),
    minimumScore: 70,
    qualityGate: quality,
    recipeLanguage,
    selectedRecipes
  });
  const reasons = Array.from(new Set([
    ...fundamentalReasons,
    ...blockingReasons,
    ...(!acceptance.accepted ? acceptance.reasons : [])
  ]));

  return {
    accepted: reasons.length === 0 && acceptance.accepted,
    acceptance,
    quality,
    reasons,
    recipe
  };
}

export function validateMealPlanRecipeContracts(
  mealPlan: MealPlanData,
  options: Pick<MealPlanRecipeContractOptions, "conditions" | "dietContext" | "maxSimilarMealSlots" | "preferredCuisine" | "recipeLanguage">
) {
  const issues: MealPlanRecipeContractIssue[] = [];
  const selectedRecipes: Recipe[] = [];
  const usageCounts = new Map<string, number>();
  const maxSimilarMealSlots = Math.max(0, options.maxSimilarMealSlots ?? 0);
  let similarMealSlots = 0;

  for (const entry of flattenMealPlan(mealPlan)) {
    const mealKey = normalizeMealKey(entry.meal);
    const repeatedIdentity = (usageCounts.get(mealKey) ?? 0) > 0;
    const standardEvaluation = evaluateMealPlanMealRecipeContract(entry.meal, options.recipeLanguage, selectedRecipes);
    const individualEvaluation = repeatedIdentity || isDiversityOnlyFailure(standardEvaluation.reasons)
      ? evaluateMealPlanMealRecipeContract(entry.meal, options.recipeLanguage)
      : standardEvaluation;
    const restrictionReasons = getRestrictionReasons(entry.meal, options);
    const canUseSimilarityAllowance =
      (repeatedIdentity || isDiversityOnlyFailure(standardEvaluation.reasons)) &&
      individualEvaluation.accepted &&
      restrictionReasons.length === 0 &&
      similarMealSlots < maxSimilarMealSlots;
    const reasons = canUseSimilarityAllowance
      ? []
      : Array.from(new Set([
          ...(repeatedIdentity && similarMealSlots >= maxSimilarMealSlots
            ? ["meal_similarity_budget_exceeded"]
            : standardEvaluation.reasons),
          ...restrictionReasons
        ]));
    if (reasons.length) {
      issues.push({
        dayIndex: entry.dayIndex,
        mealName: entry.meal.name,
        reasons,
        slot: entry.slot
      });
      continue;
    }
    if (canUseSimilarityAllowance) similarMealSlots += 1;
    usageCounts.set(mealKey, (usageCounts.get(mealKey) ?? 0) + 1);
    selectedRecipes.push(individualEvaluation.recipe);
  }

  return issues;
}

export function buildValidatedRepeatFallbackPlan(
  template: MealPlanData,
  options: Pick<MealPlanRecipeContractOptions, "conditions" | "dietContext" | "preferredCuisine" | "recipeLanguage"> & {
    candidateMeals: MealPlanMeal[];
    maxSimilarMealSlots: number;
  }
) {
  const maxSimilarMealSlots = Math.max(0, options.maxSimilarMealSlots);
  const candidates = dedupeMeals([
    ...flattenMealPlan(template).map((entry) => entry.meal),
    ...options.candidateMeals
  ]).filter((meal) =>
    getRestrictionReasons(meal, options).length === 0 &&
    evaluateMealPlanMealRecipeContract(meal, options.recipeLanguage).accepted
  );
  const minimumUniqueMeals = 21 - maxSimilarMealSlots;
  if (candidates.length < minimumUniqueMeals || template.plan.length !== 7) {
    return {
      mealPlan: null,
      issues: [],
      repeatedSlots: 0,
      uniqueMealCount: candidates.length
    };
  }

  const usageCounts = new Map<string, number>();
  const selectedRecipes: Recipe[] = [];
  let repeatedSlots = 0;
  const nextPlan: MealPlanData = {
    ...template,
    plan: template.plan.map((day) => ({ ...day }))
  };

  for (const entry of flattenMealPlan(nextPlan)) {
    const rankedCandidates = rankFallbackCandidates(candidates, entry.slot, usageCounts);
    const unusedCandidates = rankedCandidates.filter((candidate) =>
      (usageCounts.get(normalizeMealKey(candidate)) ?? 0) === 0
    );
    let selected = unusedCandidates.find((candidate) =>
      evaluateMealPlanMealRecipeContract(candidate, options.recipeLanguage, selectedRecipes).accepted
    );

    if (!selected && repeatedSlots < maxSimilarMealSlots) {
      selected = unusedCandidates.find((candidate) => {
        const standardEvaluation = evaluateMealPlanMealRecipeContract(candidate, options.recipeLanguage, selectedRecipes);
        return isDiversityOnlyFailure(standardEvaluation.reasons) &&
          evaluateMealPlanMealRecipeContract(candidate, options.recipeLanguage).accepted;
      });
    }

    if (!selected && repeatedSlots < maxSimilarMealSlots) {
      selected = rankedCandidates.find((candidate) =>
        (usageCounts.get(normalizeMealKey(candidate)) ?? 0) > 0 &&
        evaluateMealPlanMealRecipeContract(candidate, options.recipeLanguage).accepted
      );
    }

    if (!selected) {
      return {
        mealPlan: null,
        issues: [],
        repeatedSlots,
        uniqueMealCount: usageCounts.size
      };
    }

    const key = normalizeMealKey(selected);
    const repeatedIdentity = (usageCounts.get(key) ?? 0) > 0;
    const standardEvaluation = evaluateMealPlanMealRecipeContract(selected, options.recipeLanguage, selectedRecipes);
    if (repeatedIdentity || isDiversityOnlyFailure(standardEvaluation.reasons)) repeatedSlots += 1;
    usageCounts.set(key, (usageCounts.get(key) ?? 0) + 1);
    selectedRecipes.push(evaluateMealPlanMealRecipeContract(selected, options.recipeLanguage).recipe);
    nextPlan.plan[entry.dayIndex][entry.slot] = cloneMeal(selected);
  }

  const validationOptions = { ...options, maxSimilarMealSlots };
  const issues = validateMealPlanRecipeContracts(nextPlan, validationOptions);
  return {
    mealPlan: issues.length ? null : nextPlan,
    issues,
    repeatedSlots,
    uniqueMealCount: usageCounts.size
  };
}

export function summarizeMealPlanRepeatUsage(mealPlan: MealPlanData) {
  const meals = flattenMealPlan(mealPlan).map((entry) => entry.meal);
  const uniqueMealCount = new Set(meals.map(normalizeMealKey)).size;
  return {
    repeatedSlots: Math.max(0, meals.length - uniqueMealCount),
    uniqueMealCount
  };
}

export function alignMealPlanWithRecipeContracts(
  mealPlan: MealPlanData,
  options: MealPlanRecipeContractOptions
): MealPlanRecipeAlignmentResult {
  const issuesBefore = validateMealPlanRecipeContracts(mealPlan, options);
  if (!issuesBefore.length) {
    return {
      issuesAfter: [],
      issuesBefore,
      mealPlan,
      replacementMeals: [],
      replacedSlots: 0
    };
  }

  const nextPlan: MealPlanData = {
    ...mealPlan,
    plan: mealPlan.plan.map((day) => ({ ...day }))
  };
  const maxMealReuse = Math.max(1, options.maxMealReuse ?? 2);
  const usageCounts = new Map<string, number>();
  const selectedRecipes: Recipe[] = [];
  const replacementMeals: MealPlanMeal[] = [];
  let replacedSlots = 0;

  for (const entry of flattenMealPlan(nextPlan)) {
    const currentEvaluation = evaluateMealPlanMealRecipeContract(entry.meal, options.recipeLanguage, selectedRecipes);
    const currentReasons = [
      ...currentEvaluation.reasons,
      ...getRestrictionReasons(entry.meal, options)
    ];
    if (!currentReasons.length) {
      rememberMealUsage(usageCounts, entry.meal);
      selectedRecipes.push(currentEvaluation.recipe);
      continue;
    }

    const replacement = pickReplacementMeal(
      options.replacementMeals ?? [],
      entry.slot,
      options,
      usageCounts,
      selectedRecipes,
      maxMealReuse
    );
    if (!replacement) continue;

    nextPlan.plan[entry.dayIndex][entry.slot] = cloneMeal(replacement);
    const replacementEvaluation = evaluateMealPlanMealRecipeContract(replacement, options.recipeLanguage, selectedRecipes);
    selectedRecipes.push(replacementEvaluation.recipe);
    rememberMealUsage(usageCounts, replacement);
    replacementMeals.push(replacement);
    replacedSlots += 1;
  }

  return {
    issuesAfter: validateMealPlanRecipeContracts(nextPlan, options),
    issuesBefore,
    mealPlan: nextPlan,
    replacementMeals,
    replacedSlots
  };
}

export function mealPlanMealToRecipe(meal: MealPlanMeal): Recipe {
  return {
    name: meal.name,
    cuisine: meal.cuisine ?? "Unknown",
    recipe_source_type: meal.recipe_source_type ?? (meal.source_recipe_id ? "local_database" : "generated"),
    source_recipe_id: meal.source_recipe_id,
    ingredients: meal.ingredients ?? [],
    missing_ingredients: [],
    steps: meal.steps ?? [],
    calories: meal.calories,
    protein: meal.protein,
    carbs: meal.carbs,
    fat: meal.fat,
    cook_time: meal.cook_time ?? "",
    difficulty: meal.difficulty ?? "",
    image_search_index: meal.image_search_index,
    image_search_indices: meal.image_search_indices,
    image_url: meal.image_url,
    image_source: meal.image_source,
    image_attribution_name: meal.image_attribution_name,
    image_attribution_url: meal.image_attribution_url,
    photo_asset: meal.photo_asset,
    photo_identity: meal.photo_identity
  };
}

function pickReplacementMeal(
  replacementMeals: MealPlanMeal[],
  slot: MealSlot,
  options: MealPlanRecipeContractOptions,
  usageCounts: Map<string, number>,
  selectedRecipes: Recipe[],
  maxMealReuse: number
) {
  const ranked = [...replacementMeals].sort((left, right) => {
    const leftSlot = left.meal_type === slot ? 1 : 0;
    const rightSlot = right.meal_type === slot ? 1 : 0;
    return rightSlot - leftSlot;
  });

  return ranked.find((meal) => {
    if ((usageCounts.get(normalizeMealKey(meal)) ?? 0) >= maxMealReuse) return false;
    if (getRestrictionReasons(meal, options).length) return false;
    return evaluateMealPlanMealRecipeContract(meal, options.recipeLanguage, selectedRecipes).accepted;
  });
}

function dedupeMeals(meals: MealPlanMeal[]) {
  const byKey = new Map<string, MealPlanMeal>();
  meals.forEach((meal) => {
    const key = normalizeMealKey(meal);
    if (key && !byKey.has(key)) byKey.set(key, meal);
  });
  return Array.from(byKey.values());
}

function rankFallbackCandidates(
  meals: MealPlanMeal[],
  slot: MealSlot,
  usageCounts: Map<string, number>
) {
  return [...meals].sort((left, right) => {
    const leftUsage = usageCounts.get(normalizeMealKey(left)) ?? 0;
    const rightUsage = usageCounts.get(normalizeMealKey(right)) ?? 0;
    const leftSlot = left.meal_type === slot ? 1 : 0;
    const rightSlot = right.meal_type === slot ? 1 : 0;
    return leftUsage - rightUsage || rightSlot - leftSlot;
  });
}

function isDiversityOnlyFailure(reasons: string[]) {
  return reasons.length > 0 && reasons.every((reason) => reason === "acceptance_diversity");
}

function getRestrictionReasons(
  meal: MealPlanMeal,
  options: Pick<MealPlanRecipeContractOptions, "conditions" | "dietContext" | "preferredCuisine">
) {
  const reasons: string[] = [];
  const dietViolation = findRecipeDietViolation(meal, options.dietContext);
  if (dietViolation) reasons.push(`diet:${dietViolation.kind}:${dietViolation.match}`);
  const healthViolation = findRecipeHealthViolation(meal, options.conditions ?? []);
  if (healthViolation) reasons.push(`health:${healthViolation.condition}:${healthViolation.match}`);
  if (
    options.preferredCuisine &&
    options.preferredCuisine !== "Any" &&
    normalizeCuisineLabel(meal.cuisine ?? "") !== normalizeCuisineLabel(options.preferredCuisine)
  ) {
    reasons.push("preferred_cuisine_mismatch");
  }
  return reasons;
}

function getFundamentalMealReasons(meal: MealPlanMeal) {
  const reasons: string[] = [];
  if (!meal.name?.trim()) reasons.push("missing_meal_name");
  if (!meal.ingredients?.some((ingredient) => ingredient.trim())) reasons.push("missing_meal_ingredients");
  if (!meal.steps?.some((step) => step.trim())) reasons.push("missing_meal_steps");
  if ((meal.steps ?? []).some((step) =>
    /\b(?:eat|serve)\s+(?:raw|undercooked)\s+(?:chicken|poultry|beef|meat|fish|egg)|\b(?:bleach|detergent|cleaning product)\b/iu.test(step)
  )) {
    reasons.push("unsafe_meal_instruction");
  }
  return reasons;
}

function flattenMealPlan(mealPlan: MealPlanData) {
  return mealPlan.plan.flatMap((day, dayIndex) => ([
    { dayIndex, meal: day.breakfast, slot: "breakfast" as const },
    { dayIndex, meal: day.lunch, slot: "lunch" as const },
    { dayIndex, meal: day.dinner, slot: "dinner" as const }
  ]));
}

function rememberMealUsage(usageCounts: Map<string, number>, meal: MealPlanMeal) {
  const key = normalizeMealKey(meal);
  usageCounts.set(key, (usageCounts.get(key) ?? 0) + 1);
}

function normalizeMealKey(meal: MealPlanMeal) {
  return (meal.name || meal.photo_identity?.dish_slug || meal.source_recipe_id || "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function cloneMeal(meal: MealPlanMeal): MealPlanMeal {
  return {
    ...meal,
    ingredients: meal.ingredients ? [...meal.ingredients] : undefined,
    steps: meal.steps ? [...meal.steps] : undefined,
    image_search_indices: meal.image_search_indices ? [...meal.image_search_indices] : undefined,
    photo_asset: meal.photo_asset ? { ...meal.photo_asset, dietTags: [...meal.photo_asset.dietTags] } : undefined,
    photo_identity: meal.photo_identity ? { ...meal.photo_identity } : undefined
  };
}
