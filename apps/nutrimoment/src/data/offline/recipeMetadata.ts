import type {
  IngredientLexiconDoc,
  RecipeCatalogDoc,
  RecipeHealthMetadata,
  RecipeSearchMetadata
} from "@/lib/domain";
import { normalizeCuisineLabel } from "@/lib/cuisines";
import { enrichRecipeWithDishIntent } from "@/lib/recipeDishIntelligence";
import {
  localizeRecipeForArabic,
  localizeRecipeForEnglish,
  translateIngredientToArabic,
  translateIngredientToEnglish
} from "@/lib/arabicRecipeLocalization";
import { ensureDetailedRecipeSteps } from "@/lib/recipeStepDetails";
import type { Recipe } from "@/lib/types";
import { OFFLINE_INGREDIENT_TAXONOMY } from "@/data/offline/ingredientTaxonomy";

const TAXONOMY_BY_CANONICAL = new Map(OFFLINE_INGREDIENT_TAXONOMY.map((entry) => [entry.canonical, entry]));

const HIGH_POTASSIUM_CANONICALS = new Set(["banana", "avocado", "potato", "tomato", "spinach", "sweet potato"]);
const HIGH_PURINE_CANONICALS = new Set(["beef", "salmon"]);

export function enrichOfflineRecipe(recipe: RecipeCatalogDoc): RecipeCatalogDoc {
  const bilingualRecipe = ensureBilingualRecipeCatalogDoc(recipe);
  const searchMetadata = buildRecipeSearchMetadata(bilingualRecipe);
  const healthMetadata = buildRecipeHealthMetadata(bilingualRecipe);
  const imageSignature = buildRecipeImageSignature(bilingualRecipe);
  const englishVariant = bilingualRecipe.localized?.English;
  const dishIntent = englishVariant?.dish_intent ?? bilingualRecipe.dishIntent;
  const primaryImageQuery =
    englishVariant?.image_search_index ??
    englishVariant?.image_search_indices?.[0] ??
    bilingualRecipe.image.sourceQuery ??
    buildRecipeImageQuery(bilingualRecipe);

  return {
    ...bilingualRecipe,
    dishIntent,
    image: {
      ...bilingualRecipe.image,
      signature: bilingualRecipe.image.signature ?? imageSignature,
      sharedCacheKey: bilingualRecipe.image.sharedCacheKey ?? imageSignature,
      sourceQuery: primaryImageQuery
    },
    regionalCuisines: bilingualRecipe.regionalCuisines ?? inferRegionalCuisines(bilingualRecipe),
    styleTags: bilingualRecipe.styleTags ?? inferStyleTags(bilingualRecipe),
    healthMetadata,
    searchMetadata,
    searchTokens: Array.from(
      new Set([
        ...bilingualRecipe.searchTokens,
        bilingualRecipe.localized?.English?.name ?? "",
        bilingualRecipe.localized?.Arabic?.name ?? "",
        bilingualRecipe.localized?.English?.cuisine ?? "",
        bilingualRecipe.localized?.Arabic?.cuisine ?? "",
        bilingualRecipe.localized?.English?.image_search_index ?? "",
        bilingualRecipe.localized?.Arabic?.image_search_index ?? "",
        ...(bilingualRecipe.localized?.English?.image_search_indices ?? []),
        ...(bilingualRecipe.localized?.Arabic?.image_search_indices ?? []),
        dishIntent?.dish_name ?? "",
        ...(dishIntent?.visual_keywords ?? []),
        ...searchMetadata.aliasTokens,
        ...(searchMetadata.cuisineTokens ?? [])
      ])
    )
      .filter(Boolean)
      .slice(0, 48)
  };
}

export function ensureBilingualRecipeCatalogDoc(recipe: RecipeCatalogDoc): RecipeCatalogDoc {
  const english = stripUndefinedDeep(buildEnglishRecipeVariant(recipe));
  const arabic = stripUndefinedDeep(buildArabicRecipeVariant(recipe, english));

  return stripUndefinedDeep({
    ...recipe,
    dishIntent: english.dish_intent ?? recipe.dishIntent,
    localized: {
      ...(recipe.localized ?? {}),
      English: english,
      Arabic: arabic
    }
  });
}

export function buildRecipeSearchMetadata(recipe: RecipeCatalogDoc): RecipeSearchMetadata {
  const ingredientVariants = recipe.ingredientCanonicals
    .map((canonical) => {
      const taxonomy = TAXONOMY_BY_CANONICAL.get(canonical);
      if (!taxonomy) return null;
      return taxonomy.variants.map((variant) => ({
        canonical,
        locale: variant.locale,
        ...(variant.region ? { region: variant.region } : {}),
        variants: variant.values
      }));
    })
    .flat()
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const aliasTokens = Array.from(
    new Set([
      recipe.title,
      recipe.description,
      recipe.localized?.English?.name,
      recipe.localized?.Arabic?.name,
      recipe.dishIntent?.dish_name,
      ...(recipe.dishIntent?.visual_keywords ?? []),
      ...recipe.ingredientCanonicals,
      ...recipe.ingredients.map((ingredient) => ingredient.name),
      ...ingredientVariants.flatMap((variant) => variant.variants)
    ])
  )
    .map((value) => value?.trim().toLowerCase() ?? "")
    .filter(Boolean)
    .slice(0, 64);

  return {
    aliasTokens,
    cuisineTokens: Array.from(
      new Set([
        recipe.cuisine,
        recipe.localized?.English?.cuisine,
        recipe.localized?.Arabic?.cuisine,
        recipe.dishIntent?.cuisine,
        ...(recipe.regionalCuisines ?? []),
        ...(recipe.styleTags ?? [])
      ])
    )
      .map((value) => value?.trim().toLowerCase() ?? "")
      .filter(Boolean),
    ingredientVariants
  };
}

export function buildRecipeHealthMetadata(recipe: RecipeCatalogDoc): RecipeHealthMetadata {
  const conditionTags = new Set<string>();
  const cautionFlags = new Set<string>();
  const nutritionClaims = new Set<string>();

  if (recipe.sodium != null && recipe.sodium <= 300) {
    conditionTags.add("low-sodium");
    nutritionClaims.add("low-sodium");
  }

  if (recipe.protein >= 20) {
    conditionTags.add("high-protein");
    nutritionClaims.add("high-protein");
  }

  if ((recipe.fiber ?? 0) >= 8) {
    nutritionClaims.add("high-fiber");
  }

  if (
    recipe.carbs <= 45 &&
    (recipe.sugar ?? 0) <= 12 &&
    recipe.protein >= 12
  ) {
    conditionTags.add("diabetes-friendly");
  }

  if (
    recipe.sodium != null &&
    recipe.sodium <= 450 &&
    recipe.fat <= 20 &&
    (recipe.fiber ?? 0) >= 4
  ) {
    conditionTags.add("heart-healthy");
  }

  if (
    recipe.sodium != null &&
    recipe.sodium <= 350 &&
    recipe.protein <= 25 &&
    !recipe.ingredientCanonicals.some((canonical) => HIGH_POTASSIUM_CANONICALS.has(canonical))
  ) {
    conditionTags.add("renal-friendly");
  }

  if (recipe.ingredientCanonicals.some((canonical) => HIGH_POTASSIUM_CANONICALS.has(canonical))) {
    cautionFlags.add("high-potassium");
  }

  if (recipe.ingredientCanonicals.some((canonical) => HIGH_PURINE_CANONICALS.has(canonical))) {
    cautionFlags.add("high-purine");
  }

  if (recipe.allergenTags.includes("dairy")) {
    cautionFlags.add("contains-dairy");
  }

  if (recipe.allergenTags.includes("gluten")) {
    cautionFlags.add("contains-gluten");
  }

  if (recipe.allergenTags.includes("egg")) {
    cautionFlags.add("contains-egg");
  }

  return {
    conditionTags: Array.from(conditionTags),
    cautionFlags: Array.from(cautionFlags),
    nutritionClaims: Array.from(nutritionClaims)
  };
}

export function getIngredientLexiconEntry(canonical: string): IngredientLexiconDoc | undefined {
  return TAXONOMY_BY_CANONICAL.get(canonical);
}

function inferRegionalCuisines(recipe: RecipeCatalogDoc) {
  const cuisine = recipe.cuisine.trim().toLowerCase();
  if (!cuisine) return [];

  if (cuisine === "egyptian") return ["egyptian", "middle eastern", "arab"];
  if (cuisine === "middle eastern") return ["middle eastern", "arab"];
  if (cuisine === "mediterranean") return ["mediterranean"];
  return [cuisine];
}

function inferStyleTags(recipe: RecipeCatalogDoc) {
  const tags = new Set<string>();

  if (recipe.totalMinutes <= 20) tags.add("quick");
  if (recipe.totalMinutes <= 35) tags.add("weeknight");
  if (recipe.steps.length <= 4) tags.add("simple");
  if (recipe.mealType === "breakfast") tags.add("breakfast-friendly");
  if (recipe.ingredientCanonicals.includes("olive oil")) tags.add("olive-oil-based");
  if (recipe.title.toLowerCase().includes("bowl")) tags.add("bowl");
  if (recipe.title.toLowerCase().includes("salad")) tags.add("salad");
  if (recipe.title.toLowerCase().includes("soup") || recipe.title.toLowerCase().includes("stew")) tags.add("comfort-food");

  return Array.from(tags);
}

function buildRecipeImageSignature(recipe: RecipeCatalogDoc) {
  const source = [recipe.id, recipe.cuisine, ...recipe.ingredientCanonicals].join("|").toLowerCase();
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  return `recipe-photo-${hash.toString(36)}`;
}

function buildRecipeImageQuery(recipe: RecipeCatalogDoc) {
  return [
    recipe.dishIntent?.dish_name,
    recipe.dishIntent?.cuisine,
    recipe.localized?.English?.image_search_index,
    recipe.cuisine,
    recipe.title,
    ...recipe.ingredientCanonicals.slice(0, 3)
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function buildEnglishRecipeVariant(recipe: RecipeCatalogDoc): Recipe {
  const existing = recipe.localized?.English;
  const base: Recipe = {
    id: recipe.id,
    name: existing?.name ?? recipe.title,
    cuisine: existing?.cuisine ?? normalizeCuisineLabel(recipe.cuisine),
    ingredients:
      existing?.ingredients?.length
        ? existing.ingredients
        : recipe.ingredients.map((ingredient) => translateIngredientToEnglish(ingredient.name || ingredient.canonical)),
    missing_ingredients: existing?.missing_ingredients?.length ? existing.missing_ingredients : [],
    steps: existing?.steps?.length ? existing.steps : recipe.steps,
    calories: recipe.calories,
    protein: existing?.protein ?? `${recipe.protein}g`,
    carbs: existing?.carbs ?? `${recipe.carbs}g`,
    fat: existing?.fat ?? `${recipe.fat}g`,
    fiber: existing?.fiber ?? (recipe.fiber != null ? `${recipe.fiber}g` : undefined),
    sugar: existing?.sugar ?? (recipe.sugar != null ? `${recipe.sugar}g` : undefined),
    sodium: existing?.sodium ?? (recipe.sodium != null ? `${recipe.sodium}mg` : undefined),
    cook_time: existing?.cook_time ?? `${recipe.totalMinutes} mins`,
    difficulty: existing?.difficulty ?? capitalizeDifficulty(recipe.difficulty),
    image_url: existing?.image_url ?? normalizeRecipeImageUrl(recipe.image.thumbPath || recipe.image.storagePath),
    image_source: existing?.image_source,
    image_attribution_name: existing?.image_attribution_name,
    image_attribution_url: existing?.image_attribution_url,
    image_search_index: existing?.image_search_index ?? recipe.image.sourceQuery,
    image_search_indices: existing?.image_search_indices,
    preference_hits: existing?.preference_hits ?? [],
    dish_intent: existing?.dish_intent ?? recipe.dishIntent
  };

  return enrichRecipeWithDishIntent(ensureDetailedRecipeSteps(base, "English"), {
    availableIngredients: recipe.ingredientCanonicals,
    preferredCuisine: recipe.cuisine,
    diets: recipe.dietTags,
    allergens: recipe.allergenTags
  });
}

function buildArabicRecipeVariant(recipe: RecipeCatalogDoc, english: Recipe): Recipe {
  const localizedEnglish = localizeRecipeForArabic(english);
  const existing = recipe.localized?.Arabic;
  const base: Recipe = {
    ...localizedEnglish,
    ...existing,
    id: recipe.id,
    ingredients:
      existing?.ingredients?.length
        ? existing.ingredients
        : english.ingredients.map(translateIngredientToArabic),
    missing_ingredients:
      existing?.missing_ingredients?.length
        ? existing.missing_ingredients
        : english.missing_ingredients.map(translateIngredientToArabic),
    steps: existing?.steps?.length ? existing.steps : localizedEnglish.steps,
    dish_intent: english.dish_intent
  };

  return ensureDetailedRecipeSteps(base, "Arabic");
}

function normalizeRecipeImageUrl(value?: string) {
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  return undefined;
}

function capitalizeDifficulty(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function ensureCompleteLocalizedRecipe(recipe: Recipe, language: "English" | "Arabic") {
  const english = language === "Arabic" ? ensureDetailedRecipeSteps(localizeRecipeForEnglish(recipe), "English") : ensureDetailedRecipeSteps(recipe, "English");
  const arabic = language === "Arabic" ? ensureDetailedRecipeSteps(recipe, "Arabic") : ensureDetailedRecipeSteps(localizeRecipeForArabic(english), "Arabic");
  return stripUndefinedDeep({ English: english, Arabic: arabic }) as {
    English: Recipe;
    Arabic: Recipe;
  };
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((entry) => entry !== undefined)
      .map((entry) => stripUndefinedDeep(entry)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, stripUndefinedDeep(entry)])
    ) as T;
  }

  return value;
}
