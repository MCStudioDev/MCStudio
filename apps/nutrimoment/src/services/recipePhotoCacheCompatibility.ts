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

export function isGeneratedRecipePhotoUrlCompatibleWithQueries(
  imageUrl: string | undefined,
  requestQueries: string[]
) {
  const storedSignature = getStoredImageSignature(imageUrl);
  if (!storedSignature) return true;
  const storedQuery = normalizeCacheSignature(storedSignature);
  if (!storedQuery) return false;
  const storedIdentity = buildRecipePhotoIdentity(storedQuery);
  const storedTokens = collectFoodIdentityTokens(storedQuery);
  const visibleFormQueries = requestQueries.filter((requestQuery) => collectVisibleRecipeForms(requestQuery).size > 0);
  if (visibleFormQueries.some((requestQuery) => !haveCompatibleVisibleForms(storedQuery, requestQuery))) {
    return false;
  }
  const requestedSauceKeys = new Set(
    requestQueries
      .map((requestQuery) => buildRecipePhotoIdentity(requestQuery).sauceKey)
      .filter((value): value is string => Boolean(value))
  );
  if (
    (storedIdentity.sauceKey && !requestedSauceKeys.has(storedIdentity.sauceKey)) ||
    (!storedIdentity.sauceKey && requestedSauceKeys.size > 0)
  ) {
    return false;
  }

  return requestQueries.some((requestQuery) => {
    const requestIdentity = buildRecipePhotoIdentity(requestQuery);
    if (!haveCompatibleNamedStarches(storedQuery, requestQuery)) return false;
    if (!haveCompatibleVisibleForms(storedQuery, requestQuery)) return false;
    if (
      storedIdentity.mainIngredientKey &&
      requestIdentity.mainIngredientKey &&
      !mainIngredientKeysMatch(storedIdentity.mainIngredientKey, requestIdentity.mainIngredientKey)
    ) {
      return false;
    }
    if (storedIdentity.canonicalDishKey || requestIdentity.canonicalDishKey) {
      return storedIdentity.canonicalDishKey === requestIdentity.canonicalDishKey;
    }
    if (requestIdentity.mainIngredientKey) {
      if (storedIdentity.mainIngredientKey) {
        if (!mainIngredientKeysMatch(storedIdentity.mainIngredientKey, requestIdentity.mainIngredientKey)) {
          return false;
        }
      } else if (!storedTokens.has(normalize(requestIdentity.mainIngredientKey))) {
        return false;
      }

      if (
        requestIdentity.starchKey &&
        !identityComponentMatches(storedIdentity.starchKey, requestIdentity.starchKey, storedTokens)
      ) {
        return false;
      }
      if (
        storedIdentity.sauceKey &&
        requestIdentity.sauceKey &&
        storedIdentity.sauceKey !== requestIdentity.sauceKey
      ) {
        return false;
      }
      if (
        storedIdentity.cookingMethodKey &&
        requestIdentity.cookingMethodKey &&
        storedIdentity.cookingMethodKey !== requestIdentity.cookingMethodKey
      ) {
        return false;
      }
      if (
        storedIdentity.mealTypeKey &&
        requestIdentity.mealTypeKey &&
        storedIdentity.mealTypeKey !== requestIdentity.mealTypeKey
      ) {
        return false;
      }
      if (
        storedIdentity.familyKey &&
        requestIdentity.familyKey &&
        storedIdentity.familyKey !== requestIdentity.familyKey
      ) {
        return false;
      }

      // A shared image must identify the dish, not merely its protein. This
      // blocks chicken salad, curry, and rice photos from being linked to
      // unrelated chicken recipes such as wings or dumplings.
      const requestTokens = collectFoodIdentityTokens(requestQuery);
      const overlap = Array.from(requestTokens).filter((token) => storedTokens.has(token)).length;
      return overlap >= Math.min(2, requestTokens.size);
    }

    const requestTokens = collectFoodIdentityTokens(requestQuery);
    if (!requestTokens.size || !storedTokens.size) return false;
    const overlap = Array.from(requestTokens).filter((token) => storedTokens.has(token)).length;
    return overlap >= Math.min(2, requestTokens.size);
  });
}

export function isExactGeneratedRecipePhotoQueryMatch(
  cachedQuery: string,
  requestQueries: string[]
) {
  const normalizedCachedQuery = normalize(cachedQuery);
  if (!normalizedCachedQuery) return false;

  const cachedIdentity = buildRecipePhotoIdentity(normalizedCachedQuery);
  return requestQueries.some((requestQuery) => {
    const normalizedRequestQuery = normalize(requestQuery);
    if (!normalizedRequestQuery) return false;
    if (normalizedRequestQuery === normalizedCachedQuery) return true;

    const requestIdentity = buildRecipePhotoIdentity(normalizedRequestQuery);
    return Boolean(
      cachedIdentity.canonicalDishKey &&
      requestIdentity.canonicalDishKey &&
      cachedIdentity.canonicalDishKey === requestIdentity.canonicalDishKey &&
      haveCompatibleVisibleForms(normalizedCachedQuery, normalizedRequestQuery)
    );
  });
}

function haveCompatibleVisibleForms(storedQuery: string, requestQuery: string) {
  const storedForms = collectVisibleRecipeForms(storedQuery);
  const requestedForms = collectVisibleRecipeForms(requestQuery);
  if (!storedForms.size && !requestedForms.size) return true;
  if (storedForms.size !== requestedForms.size) return false;
  return Array.from(requestedForms).every((form) => storedForms.has(form));
}

function collectVisibleRecipeForms(value: string) {
  const text = normalize(value);
  const forms = new Set<string>();
  if (/\b(?:stuffed|mahshi|mahshy)\b/.test(text)) forms.add("stuffed");
  if (/\b(?:patty|patties|burger|burgers)\b/.test(text)) forms.add("patty");
  if (/\b(?:sandwich|sandwiches|wrap|wraps)\b/.test(text)) forms.add("sandwich");
  if (/\b(?:skewer|skewers|kabob|kabobs|kebab|kebabs)\b/.test(text)) forms.add("skewer");
  if (/\b(?:soup|broth|bisque)\b/.test(text)) forms.add("soup");
  if (/\b(?:salad|slaw)\b/.test(text)) forms.add("salad");
  if (/\b(?:fritter|fritters|croquette|croquettes)\b/.test(text)) forms.add("fritter");
  if (/\b(?:meatball|meatballs)\b/.test(text)) forms.add("meatball");
  return forms;
}

function haveCompatibleNamedStarches(storedQuery: string, requestQuery: string) {
  const requested = collectNamedStarchFamilies(requestQuery);
  const stored = collectNamedStarchFamilies(storedQuery);
  if (!requested.size && !stored.size) return true;
  if (requested.size !== stored.size) return false;
  return Array.from(requested).every((starch) => stored.has(starch));
}

function collectNamedStarchFamilies(value: string) {
  const text = ` ${normalize(value)} `;
  const families = new Set<string>();
  if (/\b(?:rice|risotto)\b/.test(text)) families.add("rice");
  if (/\b(?:noodle|noodles|ramen|udon|vermicelli)\b/.test(text)) families.add("noodles");
  if (/\b(?:pasta|spaghetti|macaroni|penne|linguine|fettuccine)\b/.test(text)) families.add("pasta");
  if (/\b(?:bread|pita|flatbread|toast|bun|roll)\b/.test(text)) families.add("bread");
  if (/\b(?:potato|potatoes)\b/.test(text)) families.add("potato");
  if (/\b(?:dumpling|dumplings|gnocchi)\b/.test(text)) families.add("dumpling");
  if (/\b(?:couscous|bulgur)\b/.test(text)) families.add("grain");
  return families;
}

function identityComponentMatches(storedKey: string | undefined, requestKey: string, storedTokens: Set<string>) {
  if (storedKey) return normalize(storedKey) === normalize(requestKey);
  return storedTokens.has(normalize(requestKey));
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
  if (!haveCompatibleVisibleForms(cacheQuery, requestQuery)) return false;
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
    .replace(/^diet:[^:]+:/i, "")
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

const GENERIC_PHOTO_IDENTITY_TOKENS = new Set([
  "and", "asian", "baked", "bowl", "dinner", "easy", "fried", "fresh",
  "garlic", "ginger", "grilled", "honey", "lunch", "plate", "recipe",
  "roasted", "sauce", "simple", "spicy", "steamed", "stew", "stir", "style",
  "with"
]);

function collectFoodIdentityTokens(value: string) {
  return new Set(normalize(value).split(" ").filter((token) =>
    token.length >= 3 && !GENERIC_PHOTO_IDENTITY_TOKENS.has(token)
  ));
}

function mainIngredientKeysMatch(left: string, right: string) {
  if (left === right) return true;
  const seafood = new Set(["fish", "seafood", "shrimp"]);
  if (seafood.has(left) && seafood.has(right)) return true;
  const legumes = new Set(["bean", "chickpea", "lentil"]);
  return legumes.has(left) && legumes.has(right);
}
