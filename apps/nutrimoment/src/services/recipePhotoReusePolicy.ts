import type { Recipe } from "@/lib/types";
import { isUsableRecipeImageForAccess } from "@/lib/recipeImageQuality";
import {
  inferRecipePhotoDietIds,
  isRecipePhotoDietCompatible,
  normalizeRecipePhotoDietIds
} from "@/services/recipePhotoDietCompatibility";
import {
  isGeneratedRecipePhotoCachePayloadConsistent,
  isGeneratedRecipePhotoUrlCompatibleWithQueries
} from "@/services/recipePhotoCacheCompatibility";

export const RECIPE_PHOTO_ASSET_VALIDATOR_HASH = "recipe-photo-asset-v1:diet-v1:2026-08-15";

function getRecipeImageUrl(recipe: Recipe) {
  return recipe.image_url || recipe.photo_asset?.url;
}

export function canReuseRecipePhotoForDiet(
  recipe: Recipe,
  diets: string[],
  hasGeneratedImageAccess = true
) {
  const effectiveDiets = getRecipePhotoDietScope(recipe, diets);
  const imageUrl = getRecipeImageUrl(recipe);
  if (!isUsableRecipeImageForAccess(imageUrl, hasGeneratedImageAccess)) return false;
  if (!isStoredGeneratedRecipePhoto(recipe, imageUrl)) return false;
  if (!isGeneratedRecipePhotoCachePayloadConsistent({
    imageUrl,
    query: recipe.localized?.English?.name || recipe.name
  })) {
    return false;
  }
  if (hasExplicitRecipePhotoProteinConflict(recipe, imageUrl, effectiveDiets)) return false;
  if (!isGeneratedRecipePhotoUrlCompatibleWithQueries(imageUrl, buildRecipePhotoIdentityQueries(recipe))) return false;
  if (!effectiveDiets.length) return true;

  const queryText = [
    recipe.name,
    recipe.dish_intent?.dish_name,
    recipe.plated_visual_description,
    recipe.image_search_index,
    ...(recipe.image_search_indices ?? []),
    ...recipe.ingredients,
    ...recipe.missing_ingredients
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
  return isRecipePhotoDietCompatible({
    canonicalDishKey: recipe.photo_identity?.dish_slug,
    dietTags: Array.from(new Set([
      ...(recipe.photo_asset?.dietTags ?? []),
      ...getDietTagsFromRecipePhotoUrl(imageUrl, effectiveDiets)
    ])),
    imageUrl,
    mainIngredientKey: recipe.photo_identity?.protein,
    query: queryText,
    signature: [
      recipe.photo_identity?.dish_slug,
      recipe.photo_identity?.cuisine_key,
      recipe.photo_identity?.protein,
      recipe.photo_identity?.starch,
      recipe.photo_identity?.sauce,
      recipe.photo_identity?.method
    ].filter(Boolean).join(" "),
    source: getRecipePhotoDietValidationSource(recipe.image_source)
  }, { diets: effectiveDiets });
}

export function hasRecipePhotoProteinConflict(
  recipe: Recipe,
  candidateIdentity: string,
  diets: string[] = []
) {
  return hasExplicitRecipePhotoProteinConflict(
    recipe,
    candidateIdentity,
    getRecipePhotoDietScope(recipe, diets)
  );
}

export function attachValidatedRecipePhotoAsset(recipe: Recipe, diets: string[], validatedAt = Date.now()): Recipe {
  const effectiveDiets = getRecipePhotoDietScope(recipe, diets);
  const imageUrl = getRecipeImageUrl(recipe);
  if (!canReuseRecipePhotoForDiet(recipe, diets, true)) {
    return {
      ...recipe,
      image_attribution_name: undefined,
      image_attribution_url: undefined,
      image_error: true,
      image_loading: false,
      image_source: undefined,
      image_url: undefined,
      photo_asset: {
        dietTags: effectiveDiets,
        status: "pending"
      }
    };
  }

  const readyPhotoAsset = {
    attributionName: recipe.image_attribution_name ?? recipe.photo_asset?.attributionName,
    attributionUrl: recipe.image_attribution_url ?? recipe.photo_asset?.attributionUrl,
    dietTags: effectiveDiets,
    source: recipe.image_source ?? recipe.photo_asset?.source,
    status: "ready" as const,
    url: imageUrl,
    validatedAt,
    validatorHash: RECIPE_PHOTO_ASSET_VALIDATOR_HASH
  };

  return {
    ...recipe,
    image_attribution_name: readyPhotoAsset.attributionName,
    image_attribution_url: readyPhotoAsset.attributionUrl,
    image_error: false,
    image_loading: false,
    image_source: readyPhotoAsset.source,
    image_url: imageUrl,
    photo_asset: readyPhotoAsset
  };
}

function normalizeDietTags(diets: string[]) {
  return normalizeRecipePhotoDietIds(diets);
}

function getRecipePhotoDietScope(recipe: Recipe, requestedDiets: string[]) {
  const recipeDiets = (recipe.dish_intent?.diet_type ?? "")
    .split(",")
    .map((diet) => diet.trim())
    .filter((diet) => /^(vegan|vegetarian|pescatarian|keto|paleo|dairy[ -]?free|gluten[ -]?free)$/i.test(diet));

  return normalizeDietTags([
    ...requestedDiets,
    ...recipeDiets,
    ...inferRecipePhotoDietIds([
      recipe.name,
      recipe.localized?.English?.name,
      recipe.dish_intent?.dish_name
    ]),
    ...(recipe.photo_asset?.dietTags ?? [])
  ]);
}

function buildRecipePhotoIdentityQueries(recipe: Recipe) {
  return Array.from(new Set([
    recipe.localized?.English?.name,
    recipe.name,
    recipe.dish_intent?.dish_name,
    recipe.photo_identity?.english_name
  ].filter((value): value is string => Boolean(value?.trim()))));
}

function hasExplicitRecipePhotoProteinConflict(recipe: Recipe, imageUrl: string, diets: string[]) {
  const imageProteins = collectExplicitAnimalProteins(safeDecodeURIComponent(imageUrl));
  if (!imageProteins.size) return false;
  if (diets.some((diet) => diet === "vegan" || diet === "vegetarian")) return true;

  const recipeProteins = collectExplicitAnimalProteins([
    recipe.name,
    recipe.dish_intent?.dish_name,
    recipe.photo_identity?.protein,
    ...recipe.ingredients,
    ...recipe.missing_ingredients
  ].filter(Boolean).join(" "));
  if (!recipeProteins.size) return false;

  return !Array.from(imageProteins).some((protein) => recipeProteins.has(protein));
}

function collectExplicitAnimalProteins(value: string) {
  const normalized = value.toLowerCase().replace(/[-_]+/g, " ");
  const patterns: Array<[string, RegExp]> = [
    ["beef", /\b(?:beef|steak|veal)\b/],
    ["chicken", /\b(?:chicken|poultry)\b/],
    ["duck", /\bduck\b/],
    ["fish", /\b(?:fish|salmon|tuna|tilapia|cod)\b/],
    ["lamb", /\b(?:lamb|mutton)\b/],
    ["pork", /\b(?:pork|bacon|ham)\b/],
    ["shrimp", /\b(?:shrimp|prawn)\b/],
    ["turkey", /\bturkey\b/]
  ];

  return new Set(patterns.filter(([, pattern]) => pattern.test(normalized)).map(([protein]) => protein));
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isStoredGeneratedRecipePhoto(recipe: Recipe, imageUrl: string) {
  const source = recipe.image_source ?? recipe.photo_asset?.source;
  if (source !== "replicate" && source !== "cache" && source !== "shared_pool") return false;
  try {
    const host = new URL(imageUrl).hostname.toLowerCase();
    return host === "firebasestorage.googleapis.com" || host === "storage.googleapis.com";
  } catch {
    return false;
  }
}

function getDietTagsFromRecipePhotoUrl(imageUrl: string, diets: string[]) {
  const decodedUrl = decodeURIComponent(imageUrl).toLowerCase();
  return diets.filter((diet) => decodedUrl.includes(`diet:${diet.trim().toLowerCase()}`));
}

function getRecipePhotoDietValidationSource(source: Recipe["image_source"]) {
  switch (source) {
    case "api":
      return "generated";
    case "search":
      return "pexels_search";
    case "unsplash":
      return "unsplash_search";
    case "wikimedia":
      return "wikimedia";
    default:
      return undefined;
  }
}
