import type {
  IngredientLexiconDoc,
  RecipeCatalogDoc,
  RecipeHealthMetadata,
  RecipeSearchMetadata
} from "@/lib/domain";
import { normalizeCuisineLabel } from "@/lib/cuisines";
import { enrichRecipeWithDishIntent } from "@/lib/recipeDishIntelligence";
import {
  ensureArabicRecipeLanguage,
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
  const safeRecipe = normalizeRecipeCatalogRuntimeShape(recipe);
  const english = buildStrictEnglishRecipeVariant(safeRecipe);
  const arabic = buildStrictArabicRecipeVariant(safeRecipe, english);

  return enrichOfflineRecipe(
    stripUndefinedDeep({
      ...safeRecipe,
      title: english.name || safeRecipe.title,
      description: english.name || safeRecipe.description,
      cuisine: normalizeCuisineLabel(english.cuisine || safeRecipe.cuisine),
      difficulty: normalizeDifficultyKey(english.difficulty, safeRecipe.difficulty),
      steps: english.steps,
      ingredients: safeRecipe.ingredients.map((ingredient) => ({
        ...ingredient,
        name: translateIngredientToEnglish(ingredient.canonical || ingredient.name)
      })),
      image: {
        ...safeRecipe.image,
        sourceQuery:
          english.image_search_index ??
          english.image_search_indices?.[0] ??
          safeRecipe.image.sourceQuery
      },
      dishIntent: english.dish_intent ?? safeRecipe.dishIntent,
      localized: {
        ...(safeRecipe.localized ?? {}),
        English: english,
        Arabic: arabic
      }
    })
  );
}

function normalizeRecipeCatalogRuntimeShape(recipe: RecipeCatalogDoc): RecipeCatalogDoc {
  const ingredientCanonicals = normalizeStringArray(recipe.ingredientCanonicals);
  const ingredients = Array.isArray(recipe.ingredients)
    ? recipe.ingredients
        .filter((ingredient) => ingredient && typeof ingredient === "object")
        .map((ingredient) => ({
          ...ingredient,
          name: String(ingredient.name ?? ingredient.canonical ?? "").trim(),
          canonical: String(ingredient.canonical ?? ingredient.name ?? "").trim(),
          required: Boolean(ingredient.required)
        }))
        .filter((ingredient) => ingredient.name || ingredient.canonical)
    : ingredientCanonicals.map((canonical) => ({
        name: translateIngredientToEnglish(canonical),
        canonical,
        required: true
      }));

  return {
    ...recipe,
    title: typeof recipe.title === "string" ? recipe.title : "",
    description: typeof recipe.description === "string" ? recipe.description : "",
    ingredients,
    ingredientCanonicals,
    ingredientLookupCanonicals: normalizeStringArray(
      recipe.ingredientLookupCanonicals?.length
        ? recipe.ingredientLookupCanonicals
        : ingredientCanonicals
    ),
    requiredCanonicals: normalizeStringArray(recipe.requiredCanonicals),
    optionalCanonicals: normalizeStringArray(recipe.optionalCanonicals),
    dietTags: normalizeStringArray(recipe.dietTags),
    allergenTags: normalizeStringArray(recipe.allergenTags),
    steps: normalizeStringArray(recipe.steps),
    image: {
      storagePath: recipe.image?.storagePath ?? "",
      thumbPath: recipe.image?.thumbPath,
      signature: recipe.image?.signature,
      sharedCacheKey: recipe.image?.sharedCacheKey,
      sourceQuery: recipe.image?.sourceQuery,
      source: recipe.image?.source,
      attributionName: recipe.image?.attributionName,
      attributionUrl: recipe.image?.attributionUrl,
      dietTags: normalizeStringArray(recipe.image?.dietTags),
      status: recipe.image?.status,
      validatedAt: recipe.image?.validatedAt,
      validatorHash: recipe.image?.validatorHash
    },
    regionalCuisines: normalizeStringArray(recipe.regionalCuisines),
    styleTags: normalizeStringArray(recipe.styleTags),
    searchTokens: normalizeStringArray(recipe.searchTokens),
    popularityScore: Number.isFinite(recipe.popularityScore) ? recipe.popularityScore : 60,
    qualityScore: Number.isFinite(recipe.qualityScore) ? recipe.qualityScore : 70,
    isActive: recipe.isActive !== false,
    createdAt: Number.isFinite(recipe.createdAt) ? recipe.createdAt : Date.now(),
    updatedAt: Number.isFinite(recipe.updatedAt) ? recipe.updatedAt : Date.now()
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
  const allergenTags = normalizeStringArray(recipe.allergenTags);
  const ingredientCanonicals = normalizeStringArray(recipe.ingredientCanonicals);

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
    !ingredientCanonicals.some((canonical) => HIGH_POTASSIUM_CANONICALS.has(canonical))
  ) {
    conditionTags.add("renal-friendly");
  }

  if (ingredientCanonicals.some((canonical) => HIGH_POTASSIUM_CANONICALS.has(canonical))) {
    cautionFlags.add("high-potassium");
  }

  if (ingredientCanonicals.some((canonical) => HIGH_PURINE_CANONICALS.has(canonical))) {
    cautionFlags.add("high-purine");
  }

  if (allergenTags.includes("dairy")) {
    cautionFlags.add("contains-dairy");
  }

  if (allergenTags.includes("gluten")) {
    cautionFlags.add("contains-gluten");
  }

  if (allergenTags.includes("egg")) {
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
  let merged: Recipe = {
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
  merged = repairWeakEnglishRecipeIdentity(recipe, merged);

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
  const specificIdentity = pickSpecificEnglishIdentity(recipe, candidate);
  const base: Recipe = {
    id: recipe.id,
    name: specificIdentity ? toTitleCase(specificIdentity) : buildFallbackEnglishTitle(recipe),
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
  const candidates = [
    recipe.localized?.Arabic
      ? ensureDetailedRecipeSteps(ensureArabicRecipeLanguage({ ...english, ...recipe.localized.Arabic, id: recipe.id }), "Arabic")
      : null,
    ensureDetailedRecipeSteps(ensureArabicRecipeLanguage({ ...english, id: recipe.id }), "Arabic")
  ].filter((candidate): candidate is Recipe => Boolean(candidate));
  const candidate = stripUndefinedDeep(selectBestLocalizedCandidate(candidates, "Arabic") ?? ensureArabicRecipeLanguage(english));

  if (shouldRegenerateArabicVariant(candidate)) {
    return ensureDetailedRecipeSteps(ensureArabicRecipeLanguage({ ...english, id: recipe.id }), "Arabic");
  }

  return candidate;
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
  const localizedEnglish = ensureArabicRecipeLanguage(english);
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

  return ensureDetailedRecipeSteps(ensureArabicRecipeLanguage(base), "Arabic");
}

function normalizeRecipeImageUrl(value?: string) {
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  return undefined;
}

function capitalizeDifficulty(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

type RecipeLocalizedVariant = NonNullable<NonNullable<Recipe["localized"]>["English"]>;

export function ensureCompleteLocalizedRecipe(recipe: Recipe, language: "English" | "Arabic") {
  const englishSeed = mergeLocalizedRecipeVariant(
    language === "Arabic" ? localizeRecipeForEnglish(recipe) : recipe,
    recipe.localized?.English
  );
  const arabicSeed = mergeLocalizedRecipeVariant(
    language === "Arabic" ? recipe : ensureArabicRecipeLanguage(englishSeed),
    recipe.localized?.Arabic
  );

  const english = shouldRegenerateEnglishVariant(englishSeed)
    ? ensureDetailedRecipeSteps(localizeRecipeForEnglish(arabicSeed), "English")
    : ensureDetailedRecipeSteps(englishSeed, "English");
  const arabic = shouldRegenerateArabicVariant(arabicSeed)
    ? ensureDetailedRecipeSteps(ensureArabicRecipeLanguage(english), "Arabic")
    : ensureDetailedRecipeSteps(ensureArabicRecipeLanguage(arabicSeed), "Arabic");

  return stripUndefinedDeep({ English: english, Arabic: arabic }) as {
    English: Recipe;
    Arabic: Recipe;
  };
}

function mergeLocalizedRecipeVariant(base: Recipe, localized?: RecipeLocalizedVariant): Recipe {
  if (!localized) return base;

  return stripUndefinedDeep({
    ...base,
    ...localized,
    id: base.id,
    recipe_origin: base.recipe_origin,
    scan_match_explanation: base.scan_match_explanation,
    match_quality: base.match_quality,
    matched_required_count: base.matched_required_count,
    matched_optional_count: base.matched_optional_count,
    visual_match_label: base.visual_match_label,
    image_loading: base.image_loading,
    image_error: base.image_error,
    localized: undefined
  }) as Recipe;
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
  const specificIdentity = pickSpecificEnglishIdentity(recipe);
  if (specificIdentity) {
    return toTitleCase(specificIdentity);
  }

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

function repairWeakEnglishRecipeIdentity(recipe: RecipeCatalogDoc, candidate: Recipe): Recipe {
  if (!isWeakGeneratedTitle(candidate.name)) {
    return candidate;
  }

  const specificIdentity = pickSpecificEnglishIdentity(recipe, candidate);
  if (!specificIdentity) {
    return candidate;
  }

  return {
    ...candidate,
    name: toTitleCase(specificIdentity),
    image_search_index: candidate.image_search_index ?? specificIdentity,
    image_search_indices: candidate.image_search_indices?.length
      ? candidate.image_search_indices
      : [specificIdentity]
  };
}

function pickSpecificEnglishIdentity(recipe: RecipeCatalogDoc, candidate?: Pick<Recipe, "name" | "image_search_index" | "image_search_indices" | "dish_intent">) {
  return [
    candidate?.dish_intent?.dish_name,
    recipe.localized?.English?.dish_intent?.dish_name,
    recipe.dishIntent?.dish_name,
    candidate?.image_search_index,
    ...(candidate?.image_search_indices ?? []),
    recipe.localized?.English?.image_search_index,
    ...(recipe.localized?.English?.image_search_indices ?? []),
    recipe.image.sourceQuery,
    candidate?.name,
    recipe.title
  ].find((value) => typeof value === "string" && isSpecificEnglishIdentity(value));
}

function isWeakGeneratedTitle(value: string) {
  const normalized = value.toLowerCase();
  return (
    /\bany\b/.test(normalized) ||
    /\bdinner plate\b/.test(normalized) ||
    /\blunch bowl\b/.test(normalized) ||
    /\bbreakfast bowl\b/.test(normalized) ||
    /\bsnack plate\b/.test(normalized) ||
    hasRepeatedContentToken(normalized) ||
    value.includes("مكون إضافي")
  );
}

function isSpecificEnglishIdentity(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized || !hasLatinText(normalized) || hasArabicText(normalized)) return false;
  if (normalized.length < 4) return false;
  if (/\b(any|unknown|global|generic|food|meal|recipe)\b/.test(normalized)) return false;
  if (/\b(assembled|prepared|plated)\b/.test(normalized)) return false;
  if (/\b(dinner plate|lunch bowl|breakfast bowl|snack plate)\b/.test(normalized)) return false;
  if (hasRepeatedContentToken(normalized)) return false;
  return true;
}

function hasRepeatedContentToken(value: string) {
  const tokens = value
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9]/g, ""))
    .filter((token) => token.length >= 4 && !["with", "style"].includes(token));
  const seen = new Set<string>();

  for (const token of tokens) {
    if (seen.has(token)) return true;
    seen.add(token);
  }

  return false;
}

function buildFallbackEnglishCuisine(recipe: RecipeCatalogDoc, candidate?: Pick<Recipe, "cuisine">) {
  const options = [candidate?.cuisine, recipe.cuisine].map((value) => normalizeCuisineLabel(value ?? "").trim());
  const english = options.find((value) => value && !hasArabicText(value) && hasLatinText(value));
  return english || "Global";
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
