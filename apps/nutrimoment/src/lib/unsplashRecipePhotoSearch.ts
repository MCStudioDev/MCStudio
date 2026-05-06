import {
  buildRecipePhotoIdentity,
  isStrictRecipePhotoIdentity,
  matchesStrictRecipePhotoIdentity,
  normalizeRecipePhotoQuery
} from "@/lib/recipePhotoIdentity";

const UNSPLASH_APP_NAME = "nutrimoment";
const unsplashAccessKey = process.env.UNSPLASH_ACCESS_KEY ?? process.env.UNSPLASH_API_KEY ?? "";
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

export interface UnsplashRecipePhotoLookupResult {
  attributionName: string;
  attributionUrl: string;
  imageUrl: string;
  matchedQuery: string;
  score: number;
  source: "unsplash_search";
}

interface UnsplashSearchResponse {
  results?: Array<{
    alt_description?: string | null;
    color?: string | null;
    description?: string | null;
    height?: number;
    likes?: number;
    links?: {
      html?: string;
    };
    urls?: {
      full?: string;
      raw?: string;
      regular?: string;
      small?: string;
    };
    user?: {
      links?: {
        html?: string;
      };
      name?: string;
      username?: string;
    };
    width?: number;
  }>;
}

export function isUnsplashRecipePhotoSearchConfigured() {
  return Boolean(unsplashAccessKey);
}

export async function findUnsplashRecipePhoto(
  query: string,
  options?: { excludeUrls?: Set<string> }
): Promise<UnsplashRecipePhotoLookupResult | null> {
  if (!isUnsplashRecipePhotoSearchConfigured()) return null;

  const identity = buildRecipePhotoIdentity(query);
  const candidates = Array.from(new Set([query, ...identity.searchQueries])).slice(0, 5);

  const results = await Promise.allSettled(
    candidates.map((candidateQuery) => searchUnsplashPhotos(candidateQuery, identity, options?.excludeUrls))
  );
  const bestCandidate = results
    .flatMap((result) => (result.status === "fulfilled" && result.value ? [result.value] : []))
    .sort((left, right) => right.score - left.score)[0] ?? null;

  if (!bestCandidate) return null;

  return {
    attributionName: bestCandidate.attributionName,
    attributionUrl: bestCandidate.attributionUrl,
    imageUrl: bestCandidate.url,
    matchedQuery: bestCandidate.matchedQuery,
    score: bestCandidate.score,
    source: "unsplash_search"
  };
}

async function searchUnsplashPhotos(
  query: string,
  identity: ReturnType<typeof buildRecipePhotoIdentity>,
  excludeUrls?: Set<string>
) {
  const requestQueries = buildUnsplashRequestQueries(query, identity);
  const results = await Promise.allSettled(requestQueries.map(async (requestQuery) => {
    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", requestQuery);
    url.searchParams.set("orientation", "landscape");
    url.searchParams.set("per_page", "12");
    url.searchParams.set("content_filter", "high");
    url.searchParams.set("order_by", "relevant");

    const response = await fetch(url, {
      headers: {
        Authorization: `Client-ID ${unsplashAccessKey}`,
        "Accept-Version": "v1",
        "user-agent": "NutriMoment/1.0 (+https://localhost:3000)"
      },
      next: { revalidate: 60 * 60 * 24 * 7 },
      signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS)
    });

    if (!response.ok) return null;

    const data = (await response.json()) as UnsplashSearchResponse;
    const bestForRequest = (data.results ?? [])
      .map((photo) => {
        const imageUrl = buildUnsplashImageUrl(photo);
        const photographerName = photo.user?.name?.trim() ?? "";
        const photographerUrl = buildUnsplashReferralUrl(photo.user?.links?.html ?? photo.links?.html ?? "");
        const descriptiveHaystack = normalizeRecipePhotoQuery(
          [photo.alt_description, photo.description].filter(Boolean).join(" ")
        );
        const attributionHaystack = normalizeRecipePhotoQuery(
          [photographerName, photo.user?.username].filter(Boolean).join(" ")
        );

        return {
          attributionName: photographerName,
          attributionUrl: photographerUrl,
          matchedQuery: requestQuery,
          score: scoreUnsplashCandidate(descriptiveHaystack, attributionHaystack, imageUrl, identity, requestQuery, photo),
          url: imageUrl
        };
      })
      .filter(
        (candidate) =>
          candidate.url &&
          !excludeUrls?.has(candidate.url) &&
          candidate.attributionName &&
          candidate.attributionUrl &&
          candidate.score >= getRequiredUnsplashScore(identity)
      )
      .sort((left, right) => right.score - left.score)[0];

    return bestForRequest ?? null;
  }));

  return results
    .flatMap((result) => (result.status === "fulfilled" && result.value ? [result.value] : []))
    .sort((left, right) => right.score - left.score)[0] ?? null;
}

function buildUnsplashImageUrl(photo: NonNullable<UnsplashSearchResponse["results"]>[number]) {
  const baseUrl = photo.urls?.regular ?? photo.urls?.full ?? photo.urls?.small ?? photo.urls?.raw ?? "";
  if (!baseUrl) return "";

  const url = new URL(baseUrl);
  url.searchParams.set("q", "80");
  url.searchParams.set("fm", "jpg");
  url.searchParams.set("fit", "crop");
  url.searchParams.set("crop", "entropy");
  return url.toString();
}

function buildUnsplashReferralUrl(url: string) {
  if (!url) return "";

  const nextUrl = new URL(url);
  nextUrl.searchParams.set("utm_source", UNSPLASH_APP_NAME);
  nextUrl.searchParams.set("utm_medium", "referral");
  return nextUrl.toString();
}

function getRequiredUnsplashScore(identity: ReturnType<typeof buildRecipePhotoIdentity>) {
  if (identity.canonicalDishKey || identity.familyKey) {
    return 7;
  }

  if (identity.mealTypeKey || identity.beanTypeKey) {
    return 8;
  }

  return 9;
}

function scoreUnsplashCandidate(
  descriptiveHaystack: string,
  attributionHaystack: string,
  imageUrl: string,
  identity: ReturnType<typeof buildRecipePhotoIdentity>,
  requestQuery: string,
  photo: NonNullable<UnsplashSearchResponse["results"]>[number]
) {
  let score = 0;
  const lowerUrl = imageUrl.toLowerCase();
  const normalizedRequestQuery = normalizeRecipePhotoQuery(requestQuery);
  const haystack = descriptiveHaystack;

  if (!/^https:\/\//i.test(imageUrl)) return -100;
  if (!/images\.unsplash\.com/i.test(lowerUrl)) return -100;
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

  if (identity.mainIngredientKey === "fish" && /\b(chicken|beef|lamb|pork)\b/.test(haystack)) score -= 5;
  if (identity.mainIngredientKey === "shrimp" && !/\bshrimp|prawn\b/.test(haystack)) score -= 5;
  if (identity.mainIngredientKey === "liver" && !/\b(liver|kebda|kibda|ciger|cigeri)\b/.test(haystack)) score -= 12;
  if (identity.mainIngredientKey === "tuna" && !/\btuna\b/.test(haystack)) score -= 4;
  if (identity.mainIngredientKey === "bean" && BLOCKED_TERMS.some((term) => haystack.includes(term))) score -= 8;

  if (semanticTokenHits < 2 && requestTokenHits < 2 && !hasFoodContext(haystack)) return -100;

  score += scoreUnsplashImageQuality(photo);

  return score;
}

function scoreUnsplashImageQuality(photo: NonNullable<UnsplashSearchResponse["results"]>[number]) {
  let score = 0;

  const width = typeof photo.width === "number" ? photo.width : 0;
  const height = typeof photo.height === "number" ? photo.height : 0;
  const megapixels = width > 0 && height > 0 ? (width * height) / 1_000_000 : 0;

  if (megapixels >= 8) score += 4;
  else if (megapixels >= 4) score += 3;
  else if (megapixels >= 2) score += 2;
  else if (megapixels >= 1) score += 1;

  const brightness = estimateHexBrightness(photo.color);
  if (brightness >= 210) score += 2;
  else if (brightness >= 160) score += 1;
  else if (brightness > 0 && brightness < 60) score -= 2;
  else if (brightness > 0 && brightness < 90) score -= 1;

  const likes = typeof photo.likes === "number" ? photo.likes : 0;
  if (likes >= 400) score += 2;
  else if (likes >= 100) score += 1;

  const aspectRatio = width > 0 && height > 0 ? width / Math.max(height, 1) : 0;
  if (aspectRatio >= 1.15 && aspectRatio <= 1.9) {
    score += 1;
  }

  return score;
}

function estimateHexBrightness(value?: string | null) {
  if (!value) return 0;
  const hex = value.trim().replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return 0;

  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);

  return (red * 299 + green * 587 + blue * 114) / 1000;
}

function buildUnsplashRequestQueries(query: string, identity: ReturnType<typeof buildRecipePhotoIdentity>) {
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

  return semanticHits >= 2 || requestHits >= 2 || hasFoodContext(haystack);
}

function hasFoodContext(haystack: string) {
  return FOOD_CONTEXT_TERMS.some((term) => haystack.includes(term));
}
