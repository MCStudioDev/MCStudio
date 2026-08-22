import type { Recipe } from "@/lib/types";
import { isUsableRecipeImageForAccess } from "@/lib/recipeImageQuality";
import {
  isRecipePhotoDietCompatible,
  requiresPlantBasedRecipePhotoProof
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
  const imageUrl = getRecipeImageUrl(recipe);
  if (!isUsableRecipeImageForAccess(imageUrl, hasGeneratedImageAccess)) return false;
  // Provider search photos do not carry a durable food-identity contract.
  // They can be considered during live lookup, but must not be trusted as a
  // reusable shared asset for a different session or account.
  if (isExternalRecipePhotoProviderUrl(imageUrl)) return false;
  if (!isGeneratedRecipePhotoCachePayloadConsistent({
    imageUrl,
    query: recipe.localized?.English?.name || recipe.name
  })) {
    return false;
  }
  if (!isGeneratedRecipePhotoUrlCompatibleWithQueries(imageUrl, [
    recipe.localized?.English?.name,
    recipe.name,
    recipe.dish_intent?.dish_name
  ].filter((value): value is string => Boolean(value?.trim())))) return false;
  if (!diets.length) return true;

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
  const plantDietRequested = diets.some((diet) => /^(vegan|vegetarian)$/i.test(diet.trim()));
  if (
    plantDietRequested &&
    isExternalRecipePhotoProviderUrl(imageUrl) &&
    (requiresPlantBasedRecipePhotoProof([queryText]) ||
      !/\b(plant[ -]based|vegan|vegetarian)\b/i.test(queryText))
  ) {
    return false;
  }

  return isRecipePhotoDietCompatible({
    canonicalDishKey: recipe.photo_identity?.dish_slug,
    dietTags: Array.from(new Set([
      ...(recipe.photo_asset?.dietTags ?? []),
      ...getDietTagsFromRecipePhotoUrl(imageUrl, diets)
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
  }, { diets });
}

export function attachValidatedRecipePhotoAsset(recipe: Recipe, diets: string[], validatedAt = Date.now()): Recipe {
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
        dietTags: normalizeDietTags(diets),
        status: "pending"
      }
    };
  }

  const readyPhotoAsset = {
    attributionName: recipe.image_attribution_name ?? recipe.photo_asset?.attributionName,
    attributionUrl: recipe.image_attribution_url ?? recipe.photo_asset?.attributionUrl,
    dietTags: normalizeDietTags(diets),
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
  return Array.from(new Set(diets.map((diet) => diet.trim().toLowerCase()).filter(Boolean))).sort();
}

function isExternalRecipePhotoProviderUrl(imageUrl: string) {
  try {
    const host = new URL(imageUrl).hostname.toLowerCase();
    return host === "images.pexels.com" ||
      host.endsWith(".pexels.com") ||
      host === "images.unsplash.com" ||
      host.endsWith(".unsplash.com");
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
