import { getAdminDb } from "@/lib/firebaseAdmin";
import { logger } from "@/lib/logger";
import { CUISINE_OPTIONS } from "@/lib/cuisines";
import {
  buildRecipeReferenceIngredientSet,
  expandRecipeReferenceIngredient,
  normalizeRecipeReferenceCuisineKey,
  normalizeRecipeReferenceIngredient
} from "@/lib/recipeReferenceNormalization";
import type { RecipeReferenceDoc, RecipeReferencePromptRecipe } from "@/lib/recipeReferenceTypes";
import type { Recipe } from "@/lib/types";
import { withTimeout } from "@/lib/utils";

const RECIPE_REFERENCE_COLLECTION = process.env.RECIPE_REFERENCE_COLLECTION || "recipeReferenceRecipes";
const RECIPE_REFERENCE_READ_TIMEOUT_MS = 4500;
const MAX_REFERENCE_QUERY_TERMS = 10;
const MAX_REFERENCE_DOCS_PER_TERM = 60;
const MAX_REFERENCE_BUCKET_DOCS = 140;
const MAX_ANY_CUISINE_BUCKET_DOCS = 24;
const RECIPE_REFERENCE_DISABLED = process.env.DISABLE_RECIPE_REFERENCE_LIBRARY === "true";
const APP_RECIPE_REFERENCE_SELECTION_CUISINE_KEYS = Array.from(new Set(CUISINE_OPTIONS
  .filter((cuisine) => cuisine !== "Any")
  .map((cuisine) => normalizeRecipeReferenceCuisineKey(cuisine))
  .map((key) => (key === "east-asian" ? "asian" : key))));
const APP_RECIPE_REFERENCE_BUCKET_QUERY_KEYS = Array.from(new Set(CUISINE_OPTIONS
  .filter((cuisine) => cuisine !== "Any")
  .flatMap((cuisine) => getRecipeReferenceCuisineBucketKeys(cuisine))));

export interface RecipeReferenceSearchInput {
  avoidRecipeNames?: string[];
  ingredients: string[];
  preferredCuisine?: string;
  maxReferences?: number;
  variationSeed?: string;
}

export async function findRecipeReferencesForGeneration(
  input: RecipeReferenceSearchInput
): Promise<RecipeReferencePromptRecipe[]> {
  if (RECIPE_REFERENCE_DISABLED) return [];

  const queryTerms = buildRecipeReferenceIngredientSet(input.ingredients).slice(0, MAX_REFERENCE_QUERY_TERMS);
  if (!queryTerms.length) return [];

  try {
    const db = getAdminDb();
    const recipesById = new Map<string, RecipeReferenceDoc>();
    const preferredCuisineKey = normalizeRecipeReferenceCuisineKey(input.preferredCuisine);
    const mainIngredientKeys = queryTerms.filter(isReferenceCategoryIngredient).slice(0, MAX_REFERENCE_QUERY_TERMS);
    const targetLimit = Math.max(input.maxReferences ?? 14, 14);

    await loadRecipeReferenceBucketMatches({
      cuisineKey: preferredCuisineKey,
      db,
      mainIngredientKeys,
      preferredCuisine: input.preferredCuisine,
      recipesById
    });
    await loadRecipeReferenceTaxonomyMatches({
      cuisineKey: preferredCuisineKey,
      db,
      mainIngredientKeys,
      preferredCuisine: input.preferredCuisine,
      recipesById
    });
    await loadAnyCuisineRotationBucketMatches({
      db,
      mainIngredientKeys,
      preferredCuisine: input.preferredCuisine,
      recipesById
    });

    if (recipesById.size < targetLimit * 2) {
      await Promise.all(
        queryTerms.map(async (term) => {
          const snapshot = await withTimeout(
            db
              .collection(RECIPE_REFERENCE_COLLECTION)
              .where("ingredientCanonicals", "array-contains", term)
              .limit(MAX_REFERENCE_DOCS_PER_TERM)
              .get(),
            RECIPE_REFERENCE_READ_TIMEOUT_MS,
            `load recipe references for ${term}`
          );

          snapshot.docs.forEach((docSnap) => {
            const data = docSnap.data() as RecipeReferenceDoc;
            if (isUsableRecipeReference(data)) recipesById.set(docSnap.id, { ...data, id: data.id || docSnap.id });
          });
        })
      );
    }

    const candidateRecipes = Array.from(recipesById.values());
    const coreMatchedRecipes = candidateRecipes.filter((recipe) => recipeMatchesCoreProteinAnchors(recipe, queryTerms));
    const rankingPool = coreMatchedRecipes.length ? coreMatchedRecipes : candidateRecipes;
    const ranked = rankingPool
      .map((recipe) => ({
        recipe,
        score: scoreRecipeReference(recipe, queryTerms, {
          avoidRecipeNames: input.avoidRecipeNames,
          preferredCuisine: input.preferredCuisine,
          variationSeed: input.variationSeed
        })
      }))
      .sort((left, right) => right.score - left.score)
      .map((entry) => entry.recipe);
    const rankedForSelection =
      input.preferredCuisine && input.preferredCuisine !== "Any"
        ? ranked
        : diversifyAnyCuisineReferenceRanking(ranked, input.maxReferences ?? 14);

    return selectDistinctReferenceSnippets(rankedForSelection, queryTerms, input.maxReferences ?? 14, {
      avoidRecipeNames: input.avoidRecipeNames
    });
  } catch (error) {
    logger.warn("Recipe reference lookup failed", {
      errorMessage: error instanceof Error ? error.message : String(error),
      ingredientCount: input.ingredients.length
    });
    return [];
  }
}

async function loadRecipeReferenceTaxonomyMatches(input: {
  cuisineKey: string;
  db: ReturnType<typeof getAdminDb>;
  mainIngredientKeys: string[];
  preferredCuisine?: string;
  recipesById: Map<string, RecipeReferenceDoc>;
}) {
  if (!input.mainIngredientKeys.length) return;

  const cuisineSelected = Boolean(input.preferredCuisine && input.preferredCuisine !== "Any");
  const taxonomyBuckets = buildReferenceTaxonomyQueryBuckets({
    cuisineKey: input.cuisineKey,
    cuisineSelected,
    mainIngredientKeys: input.mainIngredientKeys
  });
  if (!taxonomyBuckets.length) return;

  for (const buckets of chunkArray(taxonomyBuckets, 10)) {
    try {
      const snapshot = await withTimeout(
        input.db
          .collection(RECIPE_REFERENCE_COLLECTION)
          .where("taxonomyLookupBuckets", "array-contains-any", buckets)
          .limit(MAX_REFERENCE_BUCKET_DOCS)
          .get(),
        RECIPE_REFERENCE_READ_TIMEOUT_MS,
        `load recipe reference taxonomy buckets ${buckets.join(",")}`
      );

      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data() as RecipeReferenceDoc;
        if (isUsableRecipeReference(data)) input.recipesById.set(docSnap.id, { ...data, id: data.id || docSnap.id });
      });
    } catch (error) {
      logger.warn("Recipe reference taxonomy bucket lookup failed", {
        buckets,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
    }

    if (input.recipesById.size >= MAX_REFERENCE_BUCKET_DOCS) return;
  }
}

async function loadAnyCuisineRotationBucketMatches(input: {
  db: ReturnType<typeof getAdminDb>;
  mainIngredientKeys: string[];
  preferredCuisine?: string;
  recipesById: Map<string, RecipeReferenceDoc>;
}) {
  if (input.preferredCuisine && input.preferredCuisine !== "Any") return;
  const primaryIngredients = input.mainIngredientKeys.filter(isReferenceCategoryIngredient).slice(0, 3);
  if (!primaryIngredients.length) return;

  await Promise.all(
    APP_RECIPE_REFERENCE_BUCKET_QUERY_KEYS.flatMap((cuisineKey) =>
      primaryIngredients.map(async (ingredient) => {
        const bucket = `${cuisineKey}::${ingredient}`;
        try {
          const snapshot = await withTimeout(
            input.db
              .collection(RECIPE_REFERENCE_COLLECTION)
              .where("lookupBuckets", "array-contains", bucket)
              .limit(MAX_ANY_CUISINE_BUCKET_DOCS)
              .get(),
            RECIPE_REFERENCE_READ_TIMEOUT_MS,
            `load any-cuisine recipe reference bucket ${bucket}`
          );

          snapshot.docs.forEach((docSnap) => {
            const data = docSnap.data() as RecipeReferenceDoc;
            if (isUsableRecipeReference(data)) input.recipesById.set(docSnap.id, { ...data, id: data.id || docSnap.id });
          });
        } catch (error) {
          logger.warn("Any-cuisine recipe reference bucket lookup failed", {
            bucket,
            errorMessage: error instanceof Error ? error.message : String(error)
          });
        }
      })
    )
  );
}

function buildReferenceTaxonomyQueryBuckets(input: {
  cuisineKey: string;
  cuisineSelected: boolean;
  mainIngredientKeys: string[];
}) {
  const proteinKeys = input.mainIngredientKeys.filter(isCoreProteinAnchor).slice(0, MAX_REFERENCE_QUERY_TERMS);
  const ingredientKeys = input.mainIngredientKeys.filter(isReferenceCategoryIngredient).slice(0, MAX_REFERENCE_QUERY_TERMS);
  return Array.from(
    new Set([
      ...(input.cuisineSelected ? proteinKeys.map((protein) => `${input.cuisineKey}::protein::${protein}`) : []),
      ...(input.cuisineSelected ? ingredientKeys.map((ingredient) => `${input.cuisineKey}::ingredient::${ingredient}`) : []),
      ...proteinKeys.map((protein) => `protein::${protein}`),
      ...ingredientKeys.map((ingredient) => `ingredient::${ingredient}`)
    ])
  );
}

async function loadRecipeReferenceBucketMatches(input: {
  cuisineKey: string;
  db: ReturnType<typeof getAdminDb>;
  mainIngredientKeys: string[];
  preferredCuisine?: string;
  recipesById: Map<string, RecipeReferenceDoc>;
}) {
  if (!input.mainIngredientKeys.length) return;

  const cuisineSelected = Boolean(input.preferredCuisine && input.preferredCuisine !== "Any");
  const exactBuckets = cuisineSelected
    ? input.mainIngredientKeys.map((ingredient) => `${input.cuisineKey}::${ingredient}`)
    : [];
  const anyBuckets = input.mainIngredientKeys.map((ingredient) => `any::${ingredient}`);
  const bucketGroups = [exactBuckets, anyBuckets].filter((group) => group.length > 0);

  for (const bucketGroup of bucketGroups) {
    const bucketChunks = chunkArray(bucketGroup, 10);
    await Promise.all(
      bucketChunks.map(async (buckets) => {
        try {
          const snapshot = await withTimeout(
            input.db
              .collection(RECIPE_REFERENCE_COLLECTION)
              .where("lookupBuckets", "array-contains-any", buckets)
              .limit(MAX_REFERENCE_BUCKET_DOCS)
              .get(),
            RECIPE_REFERENCE_READ_TIMEOUT_MS,
            `load recipe reference buckets ${buckets.join(",")}`
          );

          snapshot.docs.forEach((docSnap) => {
            const data = docSnap.data() as RecipeReferenceDoc;
            if (isUsableRecipeReference(data)) input.recipesById.set(docSnap.id, { ...data, id: data.id || docSnap.id });
          });
        } catch (error) {
          logger.warn("Recipe reference bucket lookup failed", {
            buckets,
            errorMessage: error instanceof Error ? error.message : String(error)
          });
        }
      })
    );

    if (input.recipesById.size >= MAX_REFERENCE_BUCKET_DOCS) return;
  }
}

export function mapRecipeReferencesToRecipes(
  references: RecipeReferencePromptRecipe[],
  options: { calorieTarget?: number; recipeLanguage?: string } = {}
): Recipe[] {
  const perMealCalories = Math.max(320, Math.min(760, Math.round((options.calorieTarget ?? 2000) / 3)));

  return references.map((reference, index) => {
    const protein = estimateProtein(reference.ingredients);
    const imageSearchIndex = buildReferenceImageSearchIndex(reference);
    const referenceCalories =
      typeof reference.taxonomy?.estimatedCalories === "number" && Number.isFinite(reference.taxonomy.estimatedCalories)
        ? reference.taxonomy.estimatedCalories
        : perMealCalories;
    const recipe: Recipe = {
      id: `recipe-reference-${reference.id || index}`,
      name: reference.title,
      cuisine: reference.cuisine || "Global",
      plated_visual_description: reference.imagePrompt || buildReferencePlatedVisualDescription(reference),
      recipe_source_type: "local_database",
      source_url: reference.sourceUrl,
      ingredients: reference.ingredients,
      missing_ingredients: [],
      steps: reference.steps,
      calories: referenceCalories,
      protein: `${protein}g`,
      carbs: `${Math.max(18, Math.round((referenceCalories - protein * 4) / 8))}g`,
      fat: `${Math.max(8, Math.round(referenceCalories / 55))}g`,
      fiber: "4g",
      sugar: "5g",
      sodium: "520mg",
      cook_time: inferReferenceCookTime(reference.steps),
      difficulty: toDisplayDifficulty(reference.taxonomy?.difficulty) ?? (reference.steps.length >= 7 ? "Medium" : "Easy"),
      image_search_index: imageSearchIndex,
      image_search_indices: [
        imageSearchIndex,
        reference.imagePrompt ? `${reference.title} finished plate` : "",
        `${reference.title} plate`,
        `${reference.cuisine} ${reference.title}`.trim()
      ].filter(Boolean),
      preference_hits: [
        "Real recipe reference library match",
        ...(reference.taxonomy?.classifierSource === "rule_engine" ? ["Rule-classified taxonomy"] : [])
      ]
    };

    return recipe;
  });
}

function buildReferencePlatedVisualDescription(reference: RecipeReferencePromptRecipe) {
  const cuisine = reference.cuisine && reference.cuisine !== "Global" ? `${reference.cuisine} ` : "";
  const mainIngredient =
    reference.matchedIngredients.find((ingredient) => !["dairy", "legumes", "seafood"].includes(ingredient)) ??
    normalizeRecipeReferenceIngredient(reference.ingredients[0] ?? "finished dish");
  return [
    `A professional food photograph of the finished ${cuisine}${reference.title} plated dish.`,
    `The ${mainIngredient} is fully cooked and attractively arranged with its final sauce, starch, vegetables, and garnish visible when present.`,
    "Show only the completed serving on the plate or bowl, with natural appetizing color, clean edges, and no raw ingredients, prep tools, hands, packages, or cooking process."
  ].join(" ");
}

function isUsableRecipeReference(recipe: RecipeReferenceDoc) {
  return Boolean(
    recipe &&
      typeof recipe.title === "string" &&
      recipe.title.trim().length >= 3 &&
      Array.isArray(recipe.ingredients) &&
      recipe.ingredients.length >= 2 &&
      Array.isArray(recipe.directions) &&
      recipe.directions.length >= 1
  );
}

function scoreRecipeReference(
  recipe: RecipeReferenceDoc,
  queryTerms: string[],
  options: {
    avoidRecipeNames?: string[];
    preferredCuisine?: string;
    variationSeed?: string;
  } = {}
) {
  const preferredCuisine = options.preferredCuisine ?? "Any";
  const recipeTerms = new Set([
    ...(recipe.ingredientCanonicals ?? []),
    ...(recipe.mainIngredients ?? []),
    ...expandRecipeReferenceIngredient(recipe.title)
  ]);
  const matched = queryTerms.filter((term) => recipeTerms.has(term));
  const mainMatches = (recipe.mainIngredients ?? []).filter((term) => queryTerms.includes(term));
  const cuisineScore =
    preferredCuisine && preferredCuisine !== "Any" && recipe.cuisine
      ? recipe.cuisineKey === normalizeRecipeReferenceCuisineKey(preferredCuisine) ||
        normalizeText(recipe.cuisine).includes(normalizeText(preferredCuisine))
        ? 18
        : -8
      : 0;
  const stepScore = Math.min(14, (recipe.directions?.length ?? 0) * 2);
  const ingredientScore = Math.min(16, (recipe.ingredients?.length ?? 0) * 1.25);
  const qualityScore = Math.min(20, Math.max(0, recipe.qualityScore ?? 0) / 5);
  const repeatPenalty = getAvoidedReferencePenalty(recipe, options.avoidRecipeNames);
  const methodExplorationBonus = getCookingMethodExplorationBonus(recipe);
  const jitter = stableJitter(`${options.variationSeed ?? ""}|${recipe.id}|${recipe.title}`) * 8;

  return matched.length * 18 + mainMatches.length * 12 + cuisineScore + stepScore + ingredientScore + qualityScore + methodExplorationBonus + jitter - repeatPenalty;
}

function recipeMatchesCoreProteinAnchors(recipe: RecipeReferenceDoc, queryTerms: string[]) {
  const requestedProteins = queryTerms.filter(isCoreProteinAnchor);
  if (!requestedProteins.length) return true;

  const titleIngredients = new Set(expandRecipeReferenceIngredient(recipe.title));
  const ingredientLineProteins = new Set(
    (recipe.ingredients ?? [])
      .flatMap(expandRecipeReferenceIngredient)
      .filter(isCoreProteinAnchor)
  );

  return requestedProteins.some(
    (protein) =>
      ingredientLineProteins.has(protein) ||
      (titleIngredients.has(protein) && hasCompatibleUntypedProteinCut(protein, recipe.ingredients ?? []))
  );
}

function isCoreProteinAnchor(value: string) {
  return /^(chicken|ground chicken|beef|steak|ground beef|ground meat|lamb|liver|shrimp|seafood|fish|salmon|egg)$/.test(value);
}

function isReferenceCategoryIngredient(value: string) {
  return /^(chicken|ground chicken|beef|steak|ground beef|ground meat|lamb|liver|shrimp|seafood|fish|salmon|egg|rice|pasta|bread|potato|tomato|bell pepper|mushroom|spinach|cheese|dairy|legumes)$/.test(value);
}

function hasCompatibleUntypedProteinCut(protein: string, ingredients: string[]) {
  const source = ingredients.join(" ").toLowerCase();
  if (protein === "chicken") {
    return /\b(breasts?|thighs?|wings?|drumsticks?|cutlets?|tenders?)\b/.test(source);
  }
  if (protein === "beef" || protein === "steak") {
    return /\b(steaks?|sirloin|ribeye|brisket|chuck|round roast|pot roast)\b/.test(source);
  }
  if (protein === "fish") {
    return /\b(fillets?|whole fish)\b/.test(source);
  }
  return false;
}

function selectDistinctReferenceSnippets(
  recipes: RecipeReferenceDoc[],
  queryTerms: string[],
  maxReferences: number,
  options: { avoidRecipeNames?: string[] } = {}
): RecipeReferencePromptRecipe[] {
  const selected: RecipeReferencePromptRecipe[] = [];
  const deferred: RecipeReferencePromptRecipe[] = [];
  const avoided = new Set((options.avoidRecipeNames ?? []).map(normalizeText).filter(Boolean));
  const seenCuisineMethodKeys = new Set<string>();
  const seenMethodKeys = new Set<string>();
  const seenTitles = new Set<string>();

  for (const recipe of recipes) {
    const key = normalizeText(recipe.title);
    if (!key || seenTitles.has(key)) continue;
    const isAvoided = avoided.has(key);

    const recipeTerms = new Set([
      ...(recipe.ingredients ?? []).flatMap(expandRecipeReferenceIngredient),
      ...expandRecipeReferenceIngredient(recipe.title)
    ]);
    const matchedIngredients = queryTerms.filter((term) => recipeTerms.has(term));
    const snippet = {
      id: recipe.id,
      title: recipe.title.trim(),
      cuisine: recipe.cuisine?.trim() || "Global",
      taxonomy: recipe.taxonomy,
      imagePrompt: recipe.imagePrompt || recipe.taxonomy?.imagePrompt,
      ingredients: recipe.ingredients.map((ingredient) => ingredient.trim()).filter(Boolean).slice(0, 22),
      steps: recipe.directions.map((step) => step.trim()).filter(Boolean).slice(0, 10),
      sourceUrl: recipe.source?.url,
      matchedIngredients
    };
    const methodKey = inferRecipeReferenceCookingMethod(recipe);
    const cuisineMethodKey = `${getRecipeReferenceCuisineKeyFromRecipe(recipe)}::${methodKey}`;
    const shouldDefer =
      isAvoided ||
      (seenCuisineMethodKeys.has(cuisineMethodKey) && selected.length < Math.min(maxReferences, 10)) ||
      (seenMethodKeys.has(methodKey) && selected.length < Math.min(maxReferences, 6));

    seenTitles.add(key);
    if (shouldDefer) {
      deferred.push(snippet);
    } else {
      selected.push(snippet);
      seenCuisineMethodKeys.add(cuisineMethodKey);
      seenMethodKeys.add(methodKey);
    }

    if (selected.length >= maxReferences) break;
  }

  if (selected.length < maxReferences) {
    for (const snippet of deferred) {
      selected.push(snippet);
      if (selected.length >= maxReferences) break;
    }
  }

  return selected.slice(0, maxReferences);
}

function buildReferenceImageSearchIndex(reference: RecipeReferencePromptRecipe) {
  const mainIngredient =
    reference.matchedIngredients.find((ingredient) => !["seafood", "dairy", "legumes"].includes(ingredient)) ??
    normalizeRecipeReferenceIngredient(reference.ingredients[0] ?? "");
  const title = reference.title.replace(/\b(?:recipe|easy|best)\b/gi, "").replace(/\s+/g, " ").trim();
  return [mainIngredient, title, "plate"].filter(Boolean).join(" ").slice(0, 80);
}

function inferReferenceCookTime(steps: string[]) {
  const joined = steps.join(" ");
  const minuteMatches = Array.from(joined.matchAll(/(\d+)\s*(?:to|-)?\s*(\d+)?\s*min/giu));
  const total = minuteMatches
    .slice(0, 5)
    .reduce((sum, match) => sum + Number(match[2] ?? match[1] ?? 0), 0);
  if (total > 0) return `${Math.min(180, Math.max(10, total))} mins`;
  if (/\bstew|braise|roast|bake\b/i.test(joined)) return "60 mins";
  if (/\bshrimp|prawn\b/i.test(joined)) return "25 mins";
  return "35 mins";
}

function estimateProtein(ingredients: string[]) {
  const source = ingredients.join(" ").toLowerCase();
  if (/\b(chicken|beef|steak|lamb|fish|shrimp|salmon|tuna|turkey)\b/.test(source)) return 34;
  if (/\b(egg|cheese|yogurt|beans|lentils|chickpeas)\b/.test(source)) return 18;
  return 12;
}

function toDisplayDifficulty(value: string | undefined) {
  if (!value) return undefined;
  switch (value.toLowerCase()) {
    case "easy":
      return "Easy";
    case "medium":
      return "Medium";
    case "hard":
      return "Hard";
    default:
      return undefined;
  }
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function diversifyAnyCuisineReferenceRanking(recipes: RecipeReferenceDoc[], maxReferences: number) {
  const selected: RecipeReferenceDoc[] = [];
  const selectedIds = new Set<string>();
  const byCuisine = new Map<string, RecipeReferenceDoc[]>();
  const targetCuisineCount = Math.min(maxReferences, APP_RECIPE_REFERENCE_SELECTION_CUISINE_KEYS.length);

  for (const recipe of recipes) {
    const cuisineKey = getRecipeReferenceCuisineKeyFromRecipe(recipe);
    if (!byCuisine.has(cuisineKey)) byCuisine.set(cuisineKey, []);
    byCuisine.get(cuisineKey)?.push(recipe);
  }

  for (const cuisineKey of APP_RECIPE_REFERENCE_SELECTION_CUISINE_KEYS) {
    const recipe = byCuisine.get(cuisineKey)?.find((candidate) => !selectedIds.has(candidate.id));
    if (!recipe) continue;
    selected.push(recipe);
    selectedIds.add(recipe.id);
    if (selected.length >= targetCuisineCount) break;
  }

  for (const recipe of recipes) {
    if (selectedIds.has(recipe.id)) continue;
    selected.push(recipe);
    selectedIds.add(recipe.id);
    if (selected.length >= Math.max(maxReferences * 2, maxReferences + 8)) break;
  }

  return selected;
}

function getRecipeReferenceCuisineBucketKeys(cuisine: string) {
  const key = normalizeRecipeReferenceCuisineKey(cuisine);
  if (key === "asian") return ["asian", "east-asian"];
  if (key === "middle-eastern") return ["middle-eastern"];
  return [key];
}

function getRecipeReferenceCuisineKeyFromRecipe(recipe: RecipeReferenceDoc) {
  const key = recipe.cuisineKey || normalizeRecipeReferenceCuisineKey(recipe.cuisine);
  if (key === "east-asian") return "asian";
  return key;
}

function getAvoidedReferencePenalty(recipe: RecipeReferenceDoc, avoidRecipeNames: string[] | undefined) {
  const avoided = new Set((avoidRecipeNames ?? []).map(normalizeText).filter(Boolean));
  if (!avoided.size) return 0;

  const title = normalizeText(recipe.title);
  if (avoided.has(title)) return 160;

  const looseTitle = title.replace(/\b(?:easy|best|classic|healthy|baked|grilled|fried|spicy)\b/g, "").trim();
  return Array.from(avoided).some((name) => name.includes(looseTitle) || looseTitle.includes(name)) ? 80 : 0;
}

function getCookingMethodExplorationBonus(recipe: RecipeReferenceDoc) {
  const method = inferRecipeReferenceCookingMethod(recipe);
  if (["grilled", "stew", "stir-fry", "roasted", "fried", "soup", "sandwich-wrap"].includes(method)) return 8;
  if (["casserole", "baked", "salad", "skillet"].includes(method)) return 5;
  return 0;
}

function inferRecipeReferenceCookingMethod(recipe: RecipeReferenceDoc) {
  const source = [recipe.title, ...(recipe.directions ?? []), ...(recipe.ingredients ?? [])].join(" ").toLowerCase();
  if (/\b(grill|grilled|barbecue|bbq|broil)\b/.test(source)) return "grilled";
  if (/\b(stew|braise|simmer|slow cooker|crock)\b/.test(source)) return "stew";
  if (/\b(stir fry|stir-fry|wok)\b/.test(source)) return "stir-fry";
  if (/\b(roast|roasted)\b/.test(source)) return "roasted";
  if (/\b(fry|fried|deep-fry|deep fry|oven fried)\b/.test(source)) return "fried";
  if (/\b(soup|broth|chowder)\b/.test(source)) return "soup";
  if (/\b(casserole|bake|baked|oven)\b/.test(source)) return "casserole";
  if (/\b(salad|slaw)\b/.test(source)) return "salad";
  if (/\b(taco|tortilla|wrap|sandwich|burger|pita|sub)\b/.test(source)) return "sandwich-wrap";
  if (/\b(skille?t|saute|sauté|pan)\b/.test(source)) return "skillet";
  if (/\b(curry|masala)\b/.test(source)) return "curry";
  if (/\b(pasta|spaghetti|noodle|linguine|fettuccine)\b/.test(source)) return "pasta";
  if (/\b(rice|pilaf|biryani)\b/.test(source)) return "rice";
  return "other";
}

function stableJitter(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function chunkArray<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}
