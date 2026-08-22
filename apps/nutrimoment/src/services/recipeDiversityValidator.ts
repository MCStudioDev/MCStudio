import type { Recipe } from "@/lib/types";

export interface RecipeDiversityValidationOptions {
  limit: number;
  maxPerFamilyDuringSoftFill?: number;
  rotateCuisines?: boolean;
  softFill?: boolean;
  targets?: RecipeDiversityTargets;
  similarityThreshold?: number;
}

export interface RecipeDiversityTargets {
  maxBaked?: number;
  maxCreamy?: number;
  maxTomatoBased?: number;
  minimumCookingMethods?: number;
  minimumCuisines?: number;
}

export interface RecipeSimilarityBreakdown {
  ingredients: number;
  technique: number;
  title: number;
  total: number;
  workflow: number;
}

const DEFAULT_SIMILARITY_THRESHOLD = 0.75;
const DEFAULT_TEN_RECIPE_TARGETS: RecipeDiversityTargets = {
  maxBaked: 2,
  maxCreamy: 2,
  maxTomatoBased: 2,
  minimumCookingMethods: 4,
  minimumCuisines: 3
};
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
  "fresh",
  "small",
  "medium",
  "large",
  "cup",
  "cups",
  "tbsp",
  "tsp",
  "oz",
  "lb",
  "g",
  "kg"
]);

export function calculateRecipeSimilarity(left: Recipe, right: Recipe): RecipeSimilarityBreakdown {
  const title = jaccard(tokenize(left.name), tokenize(right.name));
  const ingredients = jaccard(
    recipeIngredientTokens(left),
    recipeIngredientTokens(right)
  );
  const workflow = jaccard(tokenize(left.steps.join(" ")), tokenize(right.steps.join(" ")));
  const technique = techniqueSimilarity(left, right);
  const total =
    title * 0.3 +
    ingredients * 0.3 +
    technique * 0.2 +
    workflow * 0.2;

  return { ingredients, technique, title, total, workflow };
}

export function enforceRecipeDiversity(
  recipes: Recipe[],
  options: RecipeDiversityValidationOptions
) {
  const threshold = options.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  const targets = options.targets ?? (
    options.limit >= 10
      ? {
          ...DEFAULT_TEN_RECIPE_TARGETS,
          minimumCuisines: options.rotateCuisines === false ? 1 : DEFAULT_TEN_RECIPE_TARGETS.minimumCuisines
        }
      : {}
  );
  const remaining = recipes.map((recipe, index) => ({ recipe, index }));
  const selected: Recipe[] = [];
  const selectedCuisines = new Set<string>();
  const selectedMethods = new Set<string>();

  while (remaining.length && selected.length < options.limit) {
    const selectedIndex = selectNextDiverseRecipeIndex(remaining.map((entry) => entry.recipe), selected, {
      selectedCuisines,
      selectedMethods,
      targets,
      threshold
    });

    if (selectedIndex < 0) break;

    const [entry] = remaining.splice(selectedIndex, 1);
    selected.push(entry.recipe);
    const cuisine = normalizeKey(entry.recipe.cuisine);
    const method = normalizeKey(readCookingMethod(entry.recipe));
    if (cuisine) selectedCuisines.add(cuisine);
    if (method) selectedMethods.add(method);
  }

  if (options.softFill && selected.length < options.limit && remaining.length) {
    const selectedIds = new Set(selected.map((recipe) => recipe.id).filter(Boolean));
    const familyCounts = new Map<string, number>();
    const maxPerFamily = Math.max(1, Math.floor(options.maxPerFamilyDuringSoftFill ?? 1));
    selected.map(recipeKey).filter(Boolean).forEach((family) => {
      familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);
    });
    const rankedFill = remaining
      .map((entry) => ({
        ...entry,
        score: scoreSoftFillCandidate(entry.recipe, selected)
      }))
      .filter((entry) => !entry.recipe.id || !selectedIds.has(entry.recipe.id))
      .sort((left, right) => right.score - left.score || left.index - right.index);
    const fill: Recipe[] = [];

    for (const entry of rankedFill) {
      const family = recipeKey(entry.recipe);
      if (family && (familyCounts.get(family) ?? 0) >= maxPerFamily) continue;
      fill.push(entry.recipe);
      if (entry.recipe.id) selectedIds.add(entry.recipe.id);
      if (family) familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);
      if (selected.length + fill.length >= options.limit) break;
    }

    selected.push(...fill);
  }

  return selected;
}

function selectNextDiverseRecipeIndex(
  candidates: Recipe[],
  selected: Recipe[],
  context: {
    selectedCuisines: Set<string>;
    selectedMethods: Set<string>;
    targets: RecipeDiversityTargets;
    threshold: number;
  }
) {
  const viable = candidates
    .map((recipe, index) => ({ index, recipe }))
    .filter(({ recipe }) => canSelectDiverseRecipe(recipe, selected, context.threshold));
  if (!viable.length) return -1;

  const capped = viable.filter(({ recipe }) => canSelectWithinDiversityCaps(recipe, selected, context.targets));
  const pool = capped.length ? capped : viable;
  return pool
    .map(({ index, recipe }) => ({
      index,
      score: scoreDiversityTargetFit(recipe, selected, context.selectedCuisines, context.selectedMethods, context.targets)
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.index ?? -1;
}

function canSelectDiverseRecipe(recipe: Recipe, selected: Recipe[], threshold: number) {
  const candidateKey = canonicalNamedDishKey(normalizeKey(recipe.dish_identity ?? recipe.name));
  return selected.every((existing) =>
    (
      !candidateKey ||
      canonicalNamedDishKey(normalizeKey(existing.dish_identity ?? existing.name)) !== candidateKey
    ) &&
    calculateRecipeSimilarity(existing, recipe).total <= threshold
  );
}

function canSelectWithinDiversityCaps(recipe: Recipe, selected: Recipe[], targets: RecipeDiversityTargets) {
  if (targets.maxBaked != null && isBakedRecipe(recipe) && selected.filter(isBakedRecipe).length >= targets.maxBaked) {
    return false;
  }
  if (targets.maxCreamy != null && isCreamyRecipe(recipe) && selected.filter(isCreamyRecipe).length >= targets.maxCreamy) {
    return false;
  }
  if (targets.maxTomatoBased != null && isTomatoBasedRecipe(recipe) && selected.filter(isTomatoBasedRecipe).length >= targets.maxTomatoBased) {
    return false;
  }
  return true;
}

function scoreDiversityTargetFit(
  recipe: Recipe,
  selected: Recipe[],
  selectedCuisines: Set<string>,
  selectedMethods: Set<string>,
  targets: RecipeDiversityTargets
) {
  const cuisine = normalizeKey(recipe.cuisine);
  const method = normalizeKey(readCookingMethod(recipe));
  let score = 0;

  if (targets.minimumCuisines && selectedCuisines.size < targets.minimumCuisines && cuisine && !selectedCuisines.has(cuisine)) {
    score += 8;
  }
  if (targets.minimumCookingMethods && selectedMethods.size < targets.minimumCookingMethods && method && !selectedMethods.has(method)) {
    score += 8;
  }
  if (isBakedRecipe(recipe)) score -= selected.filter(isBakedRecipe).length * 4;
  if (isCreamyRecipe(recipe)) score -= selected.filter(isCreamyRecipe).length * 4;
  if (isTomatoBasedRecipe(recipe)) score -= selected.filter(isTomatoBasedRecipe).length * 4;
  return score;
}

function scoreSoftFillCandidate(recipe: Recipe, selected: Recipe[]) {
  if (!selected.length) return 100;
  const maxSimilarity = Math.max(...selected.map((existing) => calculateRecipeSimilarity(existing, recipe).total));
  return 100 - maxSimilarity * 100;
}

function recipeKey(recipe: Recipe) {
  const canonicalIdentity = canonicalNamedDishKey(normalizeKey(
    recipe.dish_identity ?? recipe.name
  ));
  if (canonicalIdentity) return canonicalIdentity;

  return normalizeKey(recipe.dish_intent?.dish_name ?? recipe.dish_identity ?? recipe.name)
    .replace(/\b(?:authentic|classic|easy|quick|traditional|original)\b/g, " ")
    .replace(/(?:أصيل(?:ة)?|تقليدي(?:ة)?|كلاسيكي(?:ة)?|سريع(?:ة)?|سهل(?:ة)?)/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalNamedDishKey(value: string) {
  const koftaVariant = canonicalKoftaVariantKey(value);
  if (koftaVariant) return koftaVariant;

  const identities: Array<[string, RegExp]> = [
    ["mahshi-filfil", /\b(?:vegan\s+)?mahshi\s+filfil\b|\bstuffed\s+peppers?\b/],
    ["cacciatore", /\b(?:cacciatore|cacciatora)\b|(?:كاتشاتوري|كاستياتوري)/u],
    ["parmigiana", /\b(?:parmesan|parmigiana|parmigiano)\b|(?:بارميزان|باريميجيانا)/u],
    ["piccata", /\bpiccata\b|بيكاتا/u],
    ["alfredo", /\balfredo\b|ألفريدو/u],
    ["lasagna", /\b(?:lasagna|lasagne)\b|لازانيا/u],
    ["minestrone", /\bminestrone\b|مينستروني/u],
    ["shawarma", /\bshawarma\b|شاورما/u],
    ["fattah", /\b(?:fattah|fatta)\b|فتة/u],
    ["kofta", /\b(?:kofta|kofte|kafta|kefta)\b|كفتة/u],
    ["hawawshi", /\bhawawshi\b|حواوشي/u],
    ["biryani", /\bbiryani\b|برياني/u],
    ["tandoori", /\btandoori\b|تندوري/u],
    ["pad-thai", /\bpad\s+thai\b|باد\s+تاي/u],
    ["tom-yum", /\btom\s+yum\b|توم\s+يام/u],
    ["enchilada", /\benchiladas?\b|إنشيلادا/u],
    ["fajita", /\bfajitas?\b|فاهيتا/u],
    ["risotto", /\brisotto\b|ريزوتو/u]
  ];
  return identities.find(([, pattern]) => pattern.test(value))?.[0] ?? "";
}

function canonicalKoftaVariantKey(value: string) {
  if (!/\b(?:kofta|kofte|kafta|kefta)\b|\u0643\u0641\u062a\u0629/u.test(value)) return "";

  const modifier = normalizeKey(value)
    .replace(/\b(?:kofta|kofte|kafta|kefta|authentic|classic|easy|quick|traditional|original|turkish|beef|lamb|chicken|meat|meatball|meatballs|dairy free|keto)\b/g, " ")
    .replace(/\u0643\u0641\u062a\u0629/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return modifier ? `kofta:${modifier}` : "kofta";
}

function techniqueSimilarity(left: Recipe, right: Recipe) {
  const leftTechnique = normalizeKey(readCookingMethod(left));
  const rightTechnique = normalizeKey(readCookingMethod(right));
  if (!leftTechnique || !rightTechnique) return 0;
  return leftTechnique === rightTechnique ? 1 : 0;
}

function readCookingMethod(recipe: Recipe) {
  return recipe.dish_intent?.cooking_method ?? inferCookingMethod(recipe.steps.join(" "));
}

function inferCookingMethod(value: string) {
  const normalized = normalizeKey(value);
  if (/\b(grill|grilled|char|skewer)\b/.test(normalized)) return "grilled";
  if (/\b(bake|baked|roast|roasted|oven)\b/.test(normalized)) return "baked";
  if (/\b(stir fry|stir-fry|saute|sote|skillet)\b/.test(normalized)) return "sauteed";
  if (/\b(simmer|stew|braise|braised)\b/.test(normalized)) return "stewed";
  if (/\b(fry|fried|pan fry)\b/.test(normalized)) return "fried";
  return "";
}

function recipeIngredientTokens(recipe: Recipe) {
  return tokenize([
    ...recipe.ingredients,
    ...recipe.missing_ingredients
  ].join(" "));
}

function isBakedRecipe(recipe: Recipe) {
  return normalizeKey(readCookingMethod(recipe)) === "baked" || /\b(bake|baked|oven|roast|roasted)\b/.test(recipeText(recipe));
}

function isCreamyRecipe(recipe: Recipe) {
  return /\b(cream|creamy|alfredo|bechamel|cheese sauce|white sauce)\b/.test(recipeText(recipe));
}

function isTomatoBasedRecipe(recipe: Recipe) {
  return /\b(tomato|pomodoro|marinara|cacciatore|arrabbiata|salsa|passata)\b/.test(recipeText(recipe));
}

function recipeText(recipe: Recipe) {
  return normalizeKey([
    recipe.name,
    recipe.cuisine,
    recipe.dish_intent?.cooking_method,
    recipe.photo_identity?.sauce,
    ...recipe.ingredients,
    ...recipe.missing_ingredients,
    ...recipe.steps
  ].filter(Boolean).join(" "));
}

function tokenize(value: string) {
  return new Set(
    normalizeKey(value)
      .replace(/\b\d+(?:\.\d+)?\b/g, " ")
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
      .filter((token) => !STOP_WORDS.has(token))
  );
}

function jaccard(left: Set<string>, right: Set<string>) {
  if (!left.size && !right.size) return 0;
  let intersection = 0;
  left.forEach((token) => {
    if (right.has(token)) intersection += 1;
  });
  return intersection / (left.size + right.size - intersection);
}

function normalizeKey(value: string | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
