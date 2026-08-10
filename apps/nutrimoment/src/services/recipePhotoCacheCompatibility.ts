import { buildRecipePhotoIdentity } from "@/lib/recipePhotoIdentity";

export interface RecipePhotoCacheIdentityEntry {
  imageUrl?: string;
  query?: string;
  signature?: string;
}

export function isGeneratedRecipePhotoCachePayloadConsistent(entry: RecipePhotoCacheIdentityEntry) {
  const storedSignature = getStoredImageSignature(entry.imageUrl);
  if (!storedSignature) return true;
  const storedQuery = normalizeCacheSignature(storedSignature);
  const metadataQueries = [entry.query, normalizeCacheSignature(entry.signature)]
    .filter((value): value is string => Boolean(value?.trim()));
  if (!metadataQueries.length) return false;
  return metadataQueries.every((query) => areApproximatePhotoIdentitiesCompatible(query, storedQuery));
}

/**
 * Approximate reuse is intentionally strict. Cuisine, plating, or a cooking
 * method alone never proves that an image depicts the requested food.
 */
export function isApproximateRecipePhotoCacheCompatible(
  entry: RecipePhotoCacheIdentityEntry,
  requestQueries: string[]
) {
  if (!isGeneratedRecipePhotoCachePayloadConsistent(entry)) return false;
  const cacheQueries = [entry.query, normalizeCacheSignature(entry.signature)]
    .filter((value): value is string => Boolean(value?.trim()));
  const normalizedRequests = requestQueries.filter((value) => value?.trim());
  if (!cacheQueries.length || !normalizedRequests.length) return false;

  return cacheQueries.some((cacheQuery) => normalizedRequests.some((requestQuery) => (
    areApproximatePhotoIdentitiesCompatible(cacheQuery, requestQuery)
  )));
}

function getStoredImageSignature(imageUrl: string | undefined) {
  if (!imageUrl) return "";
  const decoded = safeDecode(imageUrl);
  return decoded.match(/\/recipe-photo-cache\/([^/?#]+?)\.(?:jpg|jpeg|png|webp)(?:[?#].*)?$/i)?.[1] ?? "";
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function areApproximatePhotoIdentitiesCompatible(cacheQuery: string, requestQuery: string) {
  const cacheIdentity = buildRecipePhotoIdentity(cacheQuery);
  const requestIdentity = buildRecipePhotoIdentity(requestQuery);
  const cacheMethod = cacheIdentity.cookingMethodKey ?? detectVisibleMethod(cacheQuery);
  const requestMethod = requestIdentity.cookingMethodKey ?? detectVisibleMethod(requestQuery);

  if (cacheMethod && requestMethod && cacheMethod !== requestMethod) return false;
  if (
    cacheIdentity.canonicalDishKey &&
    requestIdentity.canonicalDishKey
  ) {
    return cacheIdentity.canonicalDishKey === requestIdentity.canonicalDishKey;
  }
  if (
    cacheIdentity.mainIngredientKey &&
    requestIdentity.mainIngredientKey
  ) {
    return cacheIdentity.mainIngredientKey === requestIdentity.mainIngredientKey;
  }
  if (cacheIdentity.familyKey && requestIdentity.familyKey) {
    return cacheIdentity.familyKey === requestIdentity.familyKey;
  }

  const cacheText = normalize(cacheQuery);
  const requestText = normalize(requestQuery);
  return cacheText.length >= 8 && (cacheText === requestText || requestText.includes(cacheText));
}

function normalizeCacheSignature(value: string | undefined) {
  return (value ?? "")
    .replace(/^generated:(?:strict-v\d+:)?/i, "")
    .replace(/^exact:(?:ar|en):/i, "")
    .replace(/^exact:cuisine:[^:]+:/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

function detectVisibleMethod(value: string) {
  const text = normalize(value);
  if (/\b(?:grill|grilled|barbecue|bbq)\b/.test(text)) return "grilled";
  if (/\b(?:bake|baked|roast|roasted|oven)\b/.test(text)) return "baked";
  if (/\b(?:fry|fried|deep fried|air fried)\b/.test(text)) return "fried";
  if (/\b(?:braise|braised|stew|stewed|simmered)\b/.test(text)) return "stewed";
  if (/\b(?:steam|steamed)\b/.test(text)) return "steamed";
  if (/\b(?:sear|seared|pan seared)\b/.test(text)) return "pan-seared";
  return null;
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
