import { getAdminDb, hasFirebaseAdminConfig } from "@/lib/firebaseAdmin";
import type { CalorieBand, Difficulty, MealType, RecipeCatalogDoc } from "@/lib/domain";
import { logger } from "@/lib/logger";
import type { RecipeReferenceDoc } from "@/lib/recipeReferenceTypes";
import { normalizeRecipeReferenceIngredient } from "@/lib/recipeReferenceNormalization";
import { withTimeout } from "@/lib/utils";
import type { IngredientNormalizationResult } from "@/services/ingredientNormalizationService";

const RECIPE_REFERENCE_COLLECTION = process.env.RECIPE_REFERENCE_COLLECTION || "recipeReferenceRecipes";
const RECIPE_REFERENCE_DATASET_TIMEOUT_MS = 5000;
const MAX_QUERY_TERMS = 12;
const MAX_DOCS_PER_QUERY = 50;

export async function listFirestoreReferenceCatalogRecipes(
  normalized: IngredientNormalizationResult
): Promise<RecipeCatalogDoc[]> {
  if (!hasFirebaseAdminConfig()) return [];

  const queryTerms = buildReferenceDatasetQueryTerms(normalized);
  if (!queryTerms.length) return [];

  try {
    const db = getAdminDb();
    const recipesById = new Map<string, RecipeReferenceDoc>();

    for (const terms of chunk(queryTerms, 10)) {
      const snapshots = await Promise.all([
        withTimeout(
          db.collection(RECIPE_REFERENCE_COLLECTION)
            .where("ingredientCanonicals", "array-contains-any", terms)
            .limit(MAX_DOCS_PER_QUERY)
            .get(),
          RECIPE_REFERENCE_DATASET_TIMEOUT_MS,
          `load reference recipes by ingredientCanonicals ${terms.join(",")}`
        ),
        withTimeout(
          db.collection(RECIPE_REFERENCE_COLLECTION)
            .where("mainIngredients", "array-contains-any", terms)
            .limit(MAX_DOCS_PER_QUERY)
            .get(),
          RECIPE_REFERENCE_DATASET_TIMEOUT_MS,
          `load reference recipes by mainIngredients ${terms.join(",")}`
        )
      ]);

      snapshots.flatMap((snapshot) => snapshot.docs).forEach((docSnap) => {
        const data = docSnap.data() as RecipeReferenceDoc;
        if (isUsableRecipeReferenceDoc(data)) {
          recipesById.set(docSnap.id, { ...data, id: data.id || docSnap.id });
        }
      });
    }

    const recipes = Array.from(recipesById.values()).map(mapReferenceDocToCatalogDoc);
    logger.info("Firestore recipe reference dataset loaded for search", {
      queryTermCount: queryTerms.length,
      recipeCount: recipes.length
    });
    return recipes;
  } catch (error) {
    logger.warn("Firestore recipe reference dataset search failed", {
      errorMessage: error instanceof Error ? error.message : String(error),
      queryTermCount: queryTerms.length
    });
    return [];
  }
}

function buildReferenceDatasetQueryTerms(normalized: IngredientNormalizationResult) {
  return Array.from(new Set([
    ...normalized.ingredientIds.map((id) => id.replace(/_/g, " ")),
    ...normalized.canonicalEnglishNames,
    ...normalized.normalized,
    ...normalized.expandedAliases.map((alias) => alias.term),
    ...normalized.searchTerms
  ].map(normalizeRecipeReferenceIngredient).filter(Boolean))).slice(0, MAX_QUERY_TERMS);
}

function mapReferenceDocToCatalogDoc(recipe: RecipeReferenceDoc): RecipeCatalogDoc {
  const ingredientCanonicals = normalizeCanonicals(recipe.ingredientCanonicals?.length ? recipe.ingredientCanonicals : recipe.ingredients);
  const requiredCanonicals = normalizeCanonicals(recipe.mainIngredients?.length ? recipe.mainIngredients : ingredientCanonicals.slice(0, 3));
  const optionalCanonicals = ingredientCanonicals.filter((ingredient) => !requiredCanonicals.includes(ingredient));
  const steps = recipe.directions.map((step) => step.trim()).filter(Boolean).slice(0, 12);
  const title = recipe.title.trim();
  const calories = estimateCalories(ingredientCanonicals);

  return {
    id: `reference-${recipe.id}`,
    title,
    slug: slugify(`${title}-${recipe.id}`),
    description: `Recipe reference: ${title}`,
    ingredients: ingredientCanonicals.map((canonical, index) => ({
      name: recipe.ingredients[index] ?? canonical,
      canonical,
      quantity: inferQuantity(recipe.ingredients[index]),
      unit: inferUnit(recipe.ingredients[index], canonical),
      required: requiredCanonicals.includes(canonical)
    })),
    ingredientCanonicals,
    requiredCanonicals,
    optionalCanonicals,
    dietTags: inferDietTags(ingredientCanonicals),
    allergenTags: inferAllergenTags(ingredientCanonicals),
    mealType: inferMealType(title, ingredientCanonicals),
    cuisine: recipe.cuisine || "Global",
    prepMinutes: 10,
    cookMinutes: inferCookMinutes(steps),
    totalMinutes: 10 + inferCookMinutes(steps),
    difficulty: inferDifficulty(steps),
    calories,
    protein: estimateProtein(ingredientCanonicals),
    carbs: estimateCarbs(calories, ingredientCanonicals),
    fat: estimateFat(calories, ingredientCanonicals),
    fiber: 4,
    sugar: 5,
    sodium: 520,
    calorieBand: getCalorieBand(calories),
    servings: 4,
    steps,
    image: {
      storagePath: "",
      sourceQuery: `${title} finished plate`
    },
    source: recipe.source,
    searchTokens: recipe.searchTokens ?? [],
    popularityScore: 72,
    qualityScore: Math.max(60, Math.min(100, recipe.qualityScore ?? 75)),
    isActive: true,
    createdAt: recipe.createdAt ?? Date.now(),
    updatedAt: recipe.updatedAt ?? Date.now(),
    regionalCuisines: [recipe.cuisine].filter(isNonEmptyString),
    styleTags: inferStyleTags(title, steps),
    healthMetadata: {
      conditionTags: [],
      cautionFlags: [],
      nutritionClaims: []
    },
    searchMetadata: {
      aliasTokens: recipe.searchTokens ?? [],
      cuisineTokens: [recipe.cuisine].filter(isNonEmptyString)
    }
  };
}

function normalizeCanonicals(values: string[]) {
  return Array.from(new Set(values.map(normalizeRecipeReferenceIngredient).filter(Boolean)));
}

function isNonEmptyString(value: string | undefined): value is string {
  return Boolean(value?.trim());
}

function isUsableRecipeReferenceDoc(recipe: RecipeReferenceDoc) {
  return Boolean(
    recipe &&
      typeof recipe.id === "string" &&
      typeof recipe.title === "string" &&
      recipe.title.trim().length >= 3 &&
      Array.isArray(recipe.ingredients) &&
      recipe.ingredients.length >= 2 &&
      Array.isArray(recipe.directions) &&
      recipe.directions.length >= 1
  );
}

function inferQuantity(raw: string | undefined) {
  const match = raw?.match(/\b(\d+(?:\.\d+)?|\d+\/\d+)\b/);
  if (!match) return 1;
  if (match[1].includes("/")) {
    const [left, right] = match[1].split("/").map(Number);
    return right ? left / right : 1;
  }
  return Number(match[1]) || 1;
}

function inferUnit(raw: string | undefined, canonical: string) {
  const source = raw?.toLowerCase() ?? "";
  const unit = source.match(/\b(cups?|c\.|tbsp\.?|tablespoons?|tsp\.?|teaspoons?|lb\.?|pounds?|oz\.?|ounces?|cans?)\b/)?.[0];
  if (unit) return unit.replace(/\.$/, "");
  if (/\b(chicken|beef|fish|shrimp|liver|turkey|lamb)\b/.test(canonical)) return "serving";
  if (/\b(egg)\b/.test(canonical)) return "eggs";
  return "portion";
}

function inferCookMinutes(steps: string[]) {
  const text = steps.join(" ");
  const minute = Array.from(text.matchAll(/(\d+)\s*(?:to|-)?\s*(\d+)?\s*min/giu))[0];
  if (minute) return Math.min(180, Math.max(10, Number(minute[2] ?? minute[1])));
  if (/\b(roast|braise|stew|slow cooker)\b/i.test(text)) return 70;
  if (/\b(bake|casserole)\b/i.test(text)) return 40;
  return 25;
}

function inferDifficulty(steps: string[]): Difficulty {
  if (steps.length >= 8) return "hard";
  if (steps.length >= 5) return "medium";
  return "easy";
}

function inferMealType(title: string, ingredients: string[]): MealType {
  const source = `${title} ${ingredients.join(" ")}`.toLowerCase();
  if (/\b(breakfast|pancake|waffle|omelet|oat)\b/.test(source)) return "breakfast";
  if (/\b(snack|dip|appetizer)\b/.test(source)) return "snack";
  if (/\b(sandwich|salad|wrap)\b/.test(source)) return "lunch";
  return "dinner";
}

function inferDietTags(ingredients: string[]) {
  const source = ingredients.join(" ");
  const tags = new Set<string>();
  if (!/\b(chicken|beef|lamb|fish|shrimp|turkey|ham|bacon|pork)\b/.test(source)) tags.add("vegetarian");
  if (!/\b(milk|cheese|cream|butter|yogurt)\b/.test(source)) tags.add("dairy-free");
  if (!/\b(flour|bread|pasta|noodle|tortilla)\b/.test(source)) tags.add("gluten-free");
  if (/\b(chicken|beef|lamb|fish|shrimp|turkey|egg|beans|lentils)\b/.test(source)) tags.add("high-protein");
  return Array.from(tags);
}

function inferAllergenTags(ingredients: string[]) {
  const source = ingredients.join(" ");
  return [
    /\b(milk|cheese|cream|butter|yogurt)\b/.test(source) ? "dairy" : "",
    /\b(flour|bread|pasta|noodle)\b/.test(source) ? "gluten" : "",
    /\b(shrimp|crab|lobster)\b/.test(source) ? "shellfish" : "",
    /\b(fish|salmon|tuna)\b/.test(source) ? "fish" : ""
  ].filter(Boolean);
}

function inferStyleTags(title: string, steps: string[]) {
  const source = `${title} ${steps.join(" ")}`.toLowerCase();
  return [
    /\bgrill|broil|barbecue|bbq\b/.test(source) ? "grilled" : "",
    /\bbake|casserole|oven\b/.test(source) ? "baked" : "",
    /\bfry|fried\b/.test(source) ? "fried" : "",
    /\bstew|braise|simmer\b/.test(source) ? "stew" : "",
    /\bsoup|chowder\b/.test(source) ? "soup" : "",
    /\bsalad\b/.test(source) ? "salad" : "",
    /\bpasta|spaghetti|noodle\b/.test(source) ? "pasta" : ""
  ].filter(Boolean);
}

function estimateCalories(ingredients: string[]) {
  let calories = 360;
  if (ingredients.some((item) => /\b(beef|liver|lamb|pork)\b/.test(item))) calories += 180;
  if (ingredients.some((item) => /\b(chicken|fish|shrimp|turkey)\b/.test(item))) calories += 120;
  if (ingredients.some((item) => /\b(rice|pasta|bread|potato|flour)\b/.test(item))) calories += 120;
  if (ingredients.some((item) => /\b(cheese|cream|butter|milk)\b/.test(item))) calories += 90;
  return Math.min(850, calories);
}

function estimateProtein(ingredients: string[]) {
  const source = ingredients.join(" ");
  if (/\b(beef|liver|lamb|chicken|fish|shrimp|turkey)\b/.test(source)) return 34;
  if (/\b(egg|cheese|yogurt|beans|lentils|chickpeas)\b/.test(source)) return 18;
  return 10;
}

function estimateCarbs(calories: number, ingredients: string[]) {
  const source = ingredients.join(" ");
  if (/\b(rice|pasta|bread|potato|flour|sugar)\b/.test(source)) return Math.round(calories / 6);
  return Math.round(calories / 10);
}

function estimateFat(calories: number, ingredients: string[]) {
  const source = ingredients.join(" ");
  if (/\b(beef|liver|lamb|cheese|cream|butter|oil)\b/.test(source)) return Math.round(calories / 35);
  return Math.round(calories / 55);
}

function getCalorieBand(calories: number): CalorieBand {
  if (calories <= 300) return "0_300";
  if (calories <= 500) return "301_500";
  if (calories <= 700) return "501_700";
  return "701_plus";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function chunk<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}
