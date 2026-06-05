import {
  buildRecipePhotoIdentity,
  isStrictRecipePhotoIdentity,
  matchesStrictRecipePhotoIdentity,
  normalizeRecipePhotoQuery
} from "@/lib/recipePhotoIdentity";

export interface PexelsRecipePhotoLookupResult {
  imageUrl: string;
  matchedQuery: string;
  score: number;
  source: "pexels_search";
}

interface PexelsSearchResponse {
  photos?: Array<{
    alt?: string;
    avg_color?: string;
    photographer?: string;
    height?: number;
    src?: {
      large?: string;
      large2x?: string;
      medium?: string;
      original?: string;
      portrait?: string;
      small?: string;
    };
    url?: string;
    width?: number;
  }>;
}

const pexelsApiKey = process.env.PEXELS_API_KEY ?? "";
const PROVIDER_REQUEST_TIMEOUT_MS = 8000;

const BLOCKED_TERMS = ["dessert", "cake", "cookie", "pancake"];
const NON_FOOD_TERMS = [
  "ancient",
  "artifact",
  "drawing",
  "hieroglyph",
  "illustration",
  "library",
  "manuscript",
  "museum",
  "painting",
  "papyrus",
  "poster",
  "sculpture",
  "statue",
  "temple"
];
const FOOD_CONTEXT_TERMS = [
  "bowl",
  "breakfast",
  "cooked",
  "cuisine",
  "dinner",
  "dish",
  "food",
  "ingredient",
  "kitchen",
  "lunch",
  "meal",
  "plate",
  "plated",
  "recipe",
  "salad",
  "seafood",
  "serving",
  "skillet",
  "soup",
  "stew"
];

export function isPexelsRecipePhotoSearchConfigured() {
  return Boolean(pexelsApiKey);
}

export async function findPexelsRecipePhoto(
  query: string,
  options?: { excludeUrls?: Set<string> }
): Promise<PexelsRecipePhotoLookupResult | null> {
  if (!isPexelsRecipePhotoSearchConfigured()) return null;

  const identity = buildRecipePhotoIdentity(query);
  const candidates = Array.from(new Set([query, ...identity.searchQueries])).slice(0, 5);

  const results = await Promise.allSettled(
    candidates.map((candidateQuery) => searchPexelsPhotos(candidateQuery, identity, options?.excludeUrls))
  );
  const bestCandidate = results
    .flatMap((result) => (result.status === "fulfilled" && result.value ? [result.value] : []))
    .sort((left, right) => right.score - left.score)[0] ?? null;

  if (!bestCandidate) return null;

  return {
    imageUrl: bestCandidate.url,
    matchedQuery: bestCandidate.matchedQuery,
    score: bestCandidate.score,
    source: "pexels_search"
  };
}

async function searchPexelsPhotos(
  query: string,
  identity: ReturnType<typeof buildRecipePhotoIdentity>,
  excludeUrls?: Set<string>
) {
  const requestQueries = buildPexelsRequestQueries(query, identity);
  const results = await Promise.allSettled(requestQueries.map(async (requestQuery) => {
    const url = new URL("https://api.pexels.com/v1/search");
    url.searchParams.set("query", requestQuery);
    url.searchParams.set("orientation", "landscape");
    url.searchParams.set("per_page", "12");

    const response = await fetch(url, {
      headers: {
        Authorization: pexelsApiKey,
        "user-agent": "NutriMoment/1.0 (+https://localhost:3000)"
      },
      next: { revalidate: 60 * 60 * 24 * 7 },
      signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS)
    });

    if (!response.ok) return null;

    const data = (await response.json()) as PexelsSearchResponse;
    const bestForRequest = (data.photos ?? [])
      .map((photo) => {
        const imageUrl =
          photo.src?.large2x ??
          photo.src?.original ??
          photo.src?.large ??
          photo.src?.medium ??
          photo.src?.small ??
          photo.src?.portrait ??
          "";
        const descriptiveHaystack = normalizeRecipePhotoQuery([photo.alt, photo.url].filter(Boolean).join(" "));
        const attributionHaystack = normalizeRecipePhotoQuery([photo.photographer].filter(Boolean).join(" "));
        return {
          matchedQuery: requestQuery,
          score: scorePexelsCandidate(descriptiveHaystack, attributionHaystack, imageUrl, identity, requestQuery, photo),
          url: imageUrl
        };
      })
      .filter((candidate) => candidate.url && !excludeUrls?.has(candidate.url) && candidate.score >= getRequiredPexelsScore(identity))
      .sort((left, right) => right.score - left.score)[0];

    return bestForRequest ?? null;
  }));

  return results
    .flatMap((result) => (result.status === "fulfilled" && result.value ? [result.value] : []))
    .sort((left, right) => right.score - left.score)[0] ?? null;
}

function getRequiredPexelsScore(identity: ReturnType<typeof buildRecipePhotoIdentity>) {
  if (identity.canonicalDishKey || identity.familyKey) {
    return 6;
  }

  if (identity.mealTypeKey || identity.beanTypeKey) {
    return 7;
  }

  return 8;
}

function scorePexelsCandidate(
  descriptiveHaystack: string,
  attributionHaystack: string,
  imageUrl: string,
  identity: ReturnType<typeof buildRecipePhotoIdentity>,
  requestQuery: string,
  photo: NonNullable<PexelsSearchResponse["photos"]>[number]
) {
  let score = 0;
  const lowerUrl = imageUrl.toLowerCase();
  const normalizedRequestQuery = normalizeRecipePhotoQuery(requestQuery);
  const haystack = descriptiveHaystack;

  if (!/^https:\/\//i.test(imageUrl)) return -100;
  if (!/pexels\.com|images\.pexels\.com/i.test(lowerUrl)) return -100;
  if (NON_FOOD_TERMS.some((term) => haystack.includes(term) || attributionHaystack.includes(term))) return -100;
  if (!looksLikeFoodPhoto(haystack, identity, normalizedRequestQuery)) return -100;
  if (isStrictRecipePhotoIdentity(identity) && !matchesStrictRecipePhotoIdentity(identity, haystack, normalizedRequestQuery)) return -100;

  if (identity.canonicalDishKey && haystack.includes(identity.canonicalDishKey.replace(/-/g, " "))) {
    score += 8;
  }

  if (identity.familyKey && haystack.includes(identity.familyKey.replace(/-/g, " "))) {
    score += 5;
  }

  if (identity.cuisineKey && haystack.includes(identity.cuisineKey.replace(/-/g, " "))) {
    score += 2;
  }

  if (identity.mainIngredientKey && haystack.includes(identity.mainIngredientKey.replace(/-/g, " "))) {
    score += 2;
  }

  if (identity.beanTypeKey && haystack.includes(identity.beanTypeKey.replace(/-/g, " "))) {
    score += 2;
  }

  if (identity.mealTypeKey && haystack.includes(identity.mealTypeKey.replace(/-/g, " "))) {
    score += 3;
  }

  if (identity.starchKey && haystack.includes(identity.starchKey.replace(/-/g, " "))) {
    score += 3;
  }

  if (identity.sauceKey && haystack.includes(identity.sauceKey.replace(/-/g, " "))) {
    score += 3;
  }

  if (identity.cookingMethodKey && haystack.includes(identity.cookingMethodKey.replace(/-/g, " "))) {
    score += 2;
  }

  const semanticTokenHits = identity.coreTokens.filter((token) => haystack.includes(token)).length;
  const requestTokenHits = normalizedRequestQuery
    .split(/\s+/)
    .filter((token) => token.length >= 4)
    .filter((token) => haystack.includes(token)).length;
  score += Math.min(semanticTokenHits, 5);
  score += Math.min(requestTokenHits, 4);

  if (identity.mainIngredientKey === "fish" && /\b(chicken|beef|lamb)\b/.test(haystack)) score -= 5;
  if (identity.mainIngredientKey === "shrimp" && !/\bshrimp|prawn\b/.test(haystack)) score -= 5;
  if (identity.mainIngredientKey === "liver" && !/\b(liver|kebda|kibda|ciger|cigeri)\b/.test(haystack)) score -= 12;
  if (identity.mainIngredientKey === "tuna" && !/\btuna\b/.test(haystack)) score -= 4;
  if (identity.mainIngredientKey === "bean" && BLOCKED_TERMS.some((term) => haystack.includes(term))) score -= 8;

  if (semanticTokenHits < 2 && requestTokenHits < 2 && !hasFoodContext(haystack)) return -100;

  score += scorePexelsImageQuality(photo, imageUrl);

  return score;
}

function scorePexelsImageQuality(photo: NonNullable<PexelsSearchResponse["photos"]>[number], imageUrl: string) {
  let score = 0;

  const width = typeof photo.width === "number" ? photo.width : 0;
  const height = typeof photo.height === "number" ? photo.height : 0;
  const megapixels = width > 0 && height > 0 ? (width * height) / 1_000_000 : 0;

  if (megapixels >= 8) score += 4;
  else if (megapixels >= 4) score += 3;
  else if (megapixels >= 2) score += 2;
  else if (megapixels >= 1) score += 1;

  if (photo.src?.original && imageUrl === photo.src.original) score += 2;
  else if (photo.src?.large2x && imageUrl === photo.src.large2x) score += 2;
  else if (photo.src?.large && imageUrl === photo.src.large) score += 1;

  const brightness = estimateHexBrightness(photo.avg_color);
  if (brightness >= 210) score += 2;
  else if (brightness >= 160) score += 1;
  else if (brightness > 0 && brightness < 60) score -= 2;
  else if (brightness > 0 && brightness < 90) score -= 1;

  const aspectRatio = width > 0 && height > 0 ? width / Math.max(height, 1) : 0;
  if (aspectRatio >= 1.15 && aspectRatio <= 1.9) {
    score += 1;
  }

  return score;
}

function estimateHexBrightness(value?: string) {
  if (!value) return 0;
  const hex = value.trim().replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return 0;

  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);

  return (red * 299 + green * 587 + blue * 114) / 1000;
}

function buildPexelsRequestQueries(query: string, identity: ReturnType<typeof buildRecipePhotoIdentity>) {
  const familyPhrase = identity.familyKey?.replace(/-/g, " ") ?? "";
  const ingredientMealPhrase = [identity.mainIngredientKey, identity.mealTypeKey]
    .filter(Boolean)
    .join(" ")
    .replace(/-/g, " ")
    .trim();
  const ingredientSauceStarchPhrase = [identity.cookingMethodKey, identity.mainIngredientKey, identity.sauceKey, identity.starchKey]
    .filter(Boolean)
    .join(" ")
    .replace(/-/g, " ")
    .trim();
  const proteinSaucePhrase = [identity.mainIngredientKey, identity.sauceKey, identity.starchKey ?? identity.mealTypeKey]
    .filter(Boolean)
    .join(" ")
    .replace(/-/g, " ")
    .trim();
  const simplifiedBase = query
    .replace(/\bfood plated\b/gi, "")
    .replace(/\bprepared food\b/gi, "")
    .replace(/\bhome ?made\b/gi, "")
    .replace(/\bhealthy\b/gi, "")
    .replace(/\blow[- ]?carb\b/gi, "")
    .trim();

  const values = [
    query,
    simplifiedBase,
    simplifiedBase.replace(/\bwith\b.+$/i, "").trim(),
    familyPhrase,
    ingredientSauceStarchPhrase,
    proteinSaucePhrase,
    ingredientMealPhrase,
    ingredientMealPhrase ? `${ingredientMealPhrase} plate` : "",
    identity.mainIngredientKey ? `${identity.mainIngredientKey} dish` : "",
    `${query} food`,
    `${query} dish`
  ]
    .map((value) => normalizeRecipePhotoQuery(value))
    .filter((value) => value.length >= 3);

  return Array.from(new Set(values)).slice(0, 5);
}

function looksLikeFoodPhoto(
  haystack: string,
  identity: ReturnType<typeof buildRecipePhotoIdentity>,
  normalizedRequestQuery: string
) {
  const semanticHits = [
    identity.canonicalDishKey?.replace(/-/g, " "),
    identity.familyKey?.replace(/-/g, " "),
    identity.cuisineKey?.replace(/-/g, " "),
    identity.mainIngredientKey?.replace(/-/g, " "),
    identity.beanTypeKey?.replace(/-/g, " "),
    identity.mealTypeKey?.replace(/-/g, " "),
    identity.starchKey?.replace(/-/g, " "),
    identity.sauceKey?.replace(/-/g, " "),
    identity.cookingMethodKey?.replace(/-/g, " "),
    ...identity.coreTokens
  ]
    .filter(Boolean)
    .filter((token, index, values) => values.indexOf(token) === index)
    .filter((token) => haystack.includes(token as string)).length;

  const requestHits = normalizedRequestQuery
    .split(/\s+/)
    .filter((token) => token.length >= 4)
    .filter((token) => haystack.includes(token)).length;

  return semanticHits >= 2 || requestHits >= 2;
}

function hasFoodContext(haystack: string) {
  return FOOD_CONTEXT_TERMS.some((term) => haystack.includes(term));
}
