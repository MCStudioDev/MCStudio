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

export function normalizeCachedRecipeCatalogDoc(recipe: RecipeCatalogDoc): RecipeCatalogDoc {
  const english = buildStrictEnglishRecipeVariant(recipe);
  const arabic = buildStrictArabicRecipeVariant(recipe, english);

  return enrichOfflineRecipe(
    stripUndefinedDeep({
      ...recipe,
      title: english.name || recipe.title,
      description: english.name || recipe.description,
      cuisine: normalizeCuisineLabel(english.cuisine || recipe.cuisine),
      difficulty: normalizeDifficultyKey(english.difficulty, recipe.difficulty),
      steps: english.steps,
      ingredients: recipe.ingredients.map((ingredient) => ({
        ...ingredient,
        name: translateIngredientToEnglish(ingredient.canonical || ingredient.name)
      })),
      image: {
        ...recipe.image,
        sourceQuery:
          english.image_search_index ??
          english.image_search_indices?.[0] ??
          recipe.image.sourceQuery
      },
      dishIntent: english.dish_intent ?? recipe.dishIntent,
      localized: {
        ...(recipe.localized ?? {}),
        English: english,
        Arabic: arabic
      }
    })
  );
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

function buildStrictEnglishRecipeVariant(recipe: RecipeCatalogDoc): Recipe {
  const projected = projectCatalogDocToRecipe(recipe);
  const candidates = [
    recipe.localized?.English
      ? ensureDetailedRecipeSteps(localizeRecipeForEnglish(stripEnglishTitleFallback({ ...projected, ...recipe.localized.English, id: recipe.id })), "English")
      : null,
    recipe.localized?.Arabic
      ? ensureDetailedRecipeSteps(localizeRecipeForEnglish(stripEnglishTitleFallback({ ...projected, ...recipe.localized.Arabic, id: recipe.id })), "English")
      : null,
    ensureDetailedRecipeSteps(localizeRecipeForEnglish(stripEnglishTitleFallback(projected)), "English")
  ].filter((candidate): candidate is Recipe => Boolean(candidate));

  const selected = selectBestLocalizedCandidate(candidates, "English") ?? projected;
  const merged: Recipe = {
    ...projected,
    ...selected,
    id: recipe.id,
    ingredients: selected.ingredients?.length ? selected.ingredients : projected.ingredients,
    missing_ingredients: selected.missing_ingredients?.length ? selected.missing_ingredients : [],
    steps: selected.steps?.length ? selected.steps : projected.steps,
    image_search_index: selected.image_search_index ?? projected.image_search_index,
    image_search_indices:
      selected.image_search_indices?.length ? selected.image_search_indices : projected.image_search_indices,
    preference_hits: normalizeStringArray(selected.preference_hits),
    dish_intent: selected.dish_intent ?? projected.dish_intent
  };

  if (shouldRegenerateEnglishVariant(merged)) {
    return buildFallbackEnglishRecipeVariant(recipe, merged);
  }

  return enrichRecipeWithDishIntent(ensureDetailedRecipeSteps(merged, "English"), {
    availableIngredients: recipe.ingredientCanonicals,
    preferredCuisine: recipe.cuisine,
    diets: recipe.dietTags,
    allergens: recipe.allergenTags
  });
}

function buildFallbackEnglishRecipeVariant(recipe: RecipeCatalogDoc, candidate: Recipe): Recipe {
  const base: Recipe = {
    id: recipe.id,
    name: buildFallbackEnglishTitle(recipe),
    cuisine: buildFallbackEnglishCuisine(recipe, candidate),
    ingredients: recipe.ingredients.map((ingredient) => translateIngredientToEnglish(ingredient.canonical || ingredient.name)),
    missing_ingredients: [],
    steps: [],
    calories: recipe.calories,
    protein: `${recipe.protein}g`,
    carbs: `${recipe.carbs}g`,
    fat: `${recipe.fat}g`,
    fiber: recipe.fiber != null ? `${recipe.fiber}g` : undefined,
    sugar: recipe.sugar != null ? `${recipe.sugar}g` : undefined,
    sodium: recipe.sodium != null ? `${recipe.sodium}mg` : undefined,
    cook_time: `${recipe.totalMinutes} mins`,
    difficulty: capitalizeDifficulty(recipe.difficulty),
    image_url: candidate.image_url ?? normalizeRecipeImageUrl(recipe.image.thumbPath || recipe.image.storagePath),
    image_source: candidate.image_source,
    image_attribution_name: candidate.image_attribution_name,
    image_attribution_url: candidate.image_attribution_url,
    image_search_index: undefined,
    image_search_indices: undefined,
    preference_hits: normalizeStringArray(candidate.preference_hits).filter((value) => !hasArabicText(value)),
    dish_intent: undefined
  };

  return enrichRecipeWithDishIntent(ensureDetailedRecipeSteps(base, "English"), {
    availableIngredients: recipe.ingredientCanonicals,
    preferredCuisine: buildFallbackEnglishCuisine(recipe, candidate),
    diets: recipe.dietTags,
    allergens: recipe.allergenTags
  });
}

function buildStrictArabicRecipeVariant(recipe: RecipeCatalogDoc, english: Recipe) {
  const candidate = stripUndefinedDeep({
    ...ensureDetailedRecipeSteps(localizeRecipeForArabic(english), "Arabic"),
    id: recipe.id
  });

  if (shouldRegenerateArabicVariant(candidate)) {
    return buildFallbackArabicRecipeVariant(recipe, english);
  }

  return candidate;
}

function buildFallbackArabicRecipeVariant(recipe: RecipeCatalogDoc, english: Recipe): Recipe {
  return ensureDetailedRecipeSteps(
    {
      id: recipe.id,
      name: buildFallbackArabicTitle(recipe),
      cuisine: buildFallbackArabicCuisine(english.cuisine),
      ingredients: recipe.ingredients.map((ingredient) => translateIngredientToArabic(ingredient.canonical || ingredient.name)),
      missing_ingredients: [],
      steps: [],
      calories: recipe.calories,
      protein: english.protein,
      carbs: english.carbs,
      fat: english.fat,
      fiber: english.fiber,
      sugar: english.sugar,
      sodium: english.sodium,
      cook_time: localizeRecipeForArabic({ ...english, steps: [], ingredients: [], missing_ingredients: [] }).cook_time,
      difficulty: localizeRecipeForArabic({ ...english, steps: [], ingredients: [], missing_ingredients: [] }).difficulty,
      image_url: english.image_url,
      image_source: english.image_source,
      image_attribution_name: english.image_attribution_name,
      image_attribution_url: english.image_attribution_url,
      image_search_index: english.image_search_index,
      image_search_indices: english.image_search_indices,
      preference_hits: [],
      dish_intent: english.dish_intent
    },
    "Arabic"
  );
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

function projectCatalogDocToRecipe(recipe: RecipeCatalogDoc): Recipe {
  const fallbackLocalized =
    recipe.localized?.English ??
    recipe.localized?.Arabic;

  return {
    id: recipe.id,
    name: recipe.title,
    cuisine: normalizeCuisineLabel(recipe.cuisine),
    ingredients: recipe.ingredients.map((ingredient) => translateIngredientToEnglish(ingredient.canonical || ingredient.name)),
    missing_ingredients: [],
    steps: recipe.steps,
    calories: recipe.calories,
    protein: `${recipe.protein}g`,
    carbs: `${recipe.carbs}g`,
    fat: `${recipe.fat}g`,
    fiber: recipe.fiber != null ? `${recipe.fiber}g` : undefined,
    sugar: recipe.sugar != null ? `${recipe.sugar}g` : undefined,
    sodium: recipe.sodium != null ? `${recipe.sodium}mg` : undefined,
    cook_time: `${recipe.totalMinutes} mins`,
    difficulty: capitalizeDifficulty(recipe.difficulty),
    image_url: normalizeRecipeImageUrl(recipe.image.thumbPath || recipe.image.storagePath),
    image_source: fallbackLocalized?.image_source,
    image_attribution_name: fallbackLocalized?.image_attribution_name,
    image_attribution_url: fallbackLocalized?.image_attribution_url,
    image_search_index: recipe.localized?.English?.image_search_index ?? recipe.image.sourceQuery,
    image_search_indices:
      recipe.localized?.English?.image_search_indices ??
      recipe.localized?.Arabic?.image_search_indices,
    preference_hits:
      normalizeStringArray(recipe.localized?.English?.preference_hits).length
        ? normalizeStringArray(recipe.localized?.English?.preference_hits)
        : normalizeStringArray(recipe.localized?.Arabic?.preference_hits),
    dish_intent: recipe.localized?.English?.dish_intent ?? recipe.localized?.Arabic?.dish_intent ?? recipe.dishIntent
  };
}

function selectBestLocalizedCandidate(candidates: Recipe[], language: "English" | "Arabic") {
  return [...candidates].sort((left, right) => {
    return scoreLocalizedCandidate(right, language) - scoreLocalizedCandidate(left, language);
  })[0];
}

function shouldRegenerateEnglishVariant(recipe: Recipe) {
  if (hasArabicText(`${recipe.name} ${recipe.cuisine}`) || !hasLatinText(`${recipe.name} ${recipe.cuisine}`)) {
    return true;
  }

  if (recipe.steps.some((step) => hasArabicText(step))) {
    return true;
  }

  return normalizeStringArray(recipe.preference_hits).some((value) => hasArabicText(value));
}

function shouldRegenerateArabicVariant(recipe: Recipe) {
  if (hasLatinText(`${recipe.name} ${recipe.cuisine}`)) {
    return true;
  }

  if (recipe.steps.some((step) => hasLatinText(step))) {
    return true;
  }

  return recipe.ingredients.some((ingredient) => hasLatinText(ingredient));
}

function scoreLocalizedCandidate(recipe: Recipe, language: "English" | "Arabic") {
  const sample = [
    recipe.name,
    recipe.cuisine,
    ...recipe.ingredients,
    ...recipe.missing_ingredients,
    ...recipe.steps
  ]
    .join(" ")
    .trim();

  if (!sample) return 0;

  const arabicChars = countMatches(sample, /[\u0600-\u06FF]/g);
  const latinChars = countMatches(sample, /[A-Za-z]/g);
  const contentChars = countMatches(sample, /[\p{L}\p{N}]/gu);

  return language === "English"
    ? contentChars + latinChars * 3 - arabicChars * 6
    : contentChars + arabicChars * 3 - latinChars * 6;
}

function countMatches(value: string, pattern: RegExp) {
  return value.match(pattern)?.length ?? 0;
}

function normalizeDifficultyKey(value: string, fallback: RecipeCatalogDoc["difficulty"]): RecipeCatalogDoc["difficulty"] {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("hard")) return "hard";
  if (normalized.includes("medium")) return "medium";
  if (normalized.includes("easy")) return "easy";
  return fallback;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function buildFallbackEnglishTitle(recipe: RecipeCatalogDoc) {
  const leadIngredients = recipe.ingredientCanonicals
    .slice(0, 2)
    .map((ingredient) => toTitleCase(translateIngredientToEnglish(ingredient)));
  const suffix = fallbackMealTypeLabel(recipe.mealType);
  return [buildFallbackEnglishCuisine(recipe), ...leadIngredients, suffix]
    .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildFallbackEnglishCuisine(recipe: RecipeCatalogDoc, candidate?: Pick<Recipe, "cuisine">) {
  const options = [candidate?.cuisine, recipe.cuisine].map((value) => normalizeCuisineLabel(value ?? "").trim());
  const english = options.find((value) => value && !hasArabicText(value) && hasLatinText(value));
  return english || "Global";
}

function buildFallbackArabicTitle(recipe: RecipeCatalogDoc) {
  const leadIngredients = recipe.ingredientCanonicals
    .slice(0, 2)
    .map((ingredient) => translateIngredientToArabic(ingredient))
    .filter(Boolean);
  return [fallbackDishShapeArabic(recipe.mealType), fallbackMealCourseArabic(recipe.mealType), ...leadIngredients]
    .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildFallbackArabicCuisine(englishCuisine: string) {
  if (!englishCuisine || englishCuisine === "Global" || englishCuisine === "Unknown") {
    return "عالمي";
  }

  return localizeRecipeForArabic({
    id: "temp",
    name: englishCuisine,
    cuisine: englishCuisine,
    ingredients: [],
    missing_ingredients: [],
    steps: [],
    calories: 0,
    protein: "0g",
    carbs: "0g",
    fat: "0g",
    cook_time: "0 mins",
    difficulty: "Easy"
  }).cuisine;
}

function fallbackMealTypeLabel(mealType: RecipeCatalogDoc["mealType"]) {
  if (mealType === "breakfast") return "Breakfast Bowl";
  if (mealType === "lunch") return "Lunch Bowl";
  if (mealType === "snack") return "Snack Plate";
  return "Dinner Plate";
}

function hasArabicText(value: string) {
  return /[\u0600-\u06FF]/.test(value);
}

function hasLatinText(value: string) {
  return /[A-Za-z]/.test(value);
}

function fallbackMealCourseArabic(mealType: RecipeCatalogDoc["mealType"]) {
  if (mealType === "breakfast") return "فطور";
  if (mealType === "lunch") return "غداء";
  if (mealType === "snack") return "وجبة خفيفة";
  return "عشاء";
}

function fallbackDishShapeArabic(mealType: RecipeCatalogDoc["mealType"]) {
  if (mealType === "breakfast" || mealType === "lunch") return "وعاء";
  if (mealType === "snack") return "وجبة";
  return "طبق";
}

function toTitleCase(value: string) {
  return value
    .trim()
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function stripEnglishTitleFallback(recipe: Recipe): Recipe {
  return {
    ...recipe,
    image_search_index: undefined
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
