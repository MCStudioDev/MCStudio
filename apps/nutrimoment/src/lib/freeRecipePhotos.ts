export interface RecipePhotoLookupResult {
  imageUrl: string;
  source: "wikimedia";
}

interface WikimediaQueryResponse {
  query?: {
    pages?: Record<
      string,
      {
        title?: string;
        imageinfo?: Array<{
          thumburl?: string;
          url?: string;
        }>;
      }
    >;
  };
}

export async function findFreeRecipePhoto(query: string): Promise<RecipePhotoLookupResult | null> {
  const cleanQuery = normalizePhotoQuery(query);
  const knownDishPhoto = getKnownDishPhoto(cleanQuery);
  if (knownDishPhoto) {
    return knownDishPhoto;
  }

  for (const searchQuery of buildFocusedPhotoQueries(cleanQuery)) {
    const wikimediaImage = await searchWikimediaCommons(searchQuery);

    if (wikimediaImage) {
      return {
        imageUrl: wikimediaImage,
        source: "wikimedia"
      };
    }
  }

  return null;
}

function normalizePhotoQuery(query: string) {
  const clean = query
    .replace(/\bkposhary\b/gi, "koshary")
    .replace(/\bkoshari\b/gi, "koshary")
    .replace(/\bkushari\b/gi, "koshary")
    .replace(/\b(food plated|recipe|dish|meal)\b/gi, " ")
    .replace(/\b(prepared food|prepared|food)\b/gi, " ")
    .replace(/\b\d+(?:\/\d+)?\s*(?:g|gram|grams|kg|lb|oz|cup|cups|tbsp|tsp|large|small|medium|can|cans)\b/gi, " ")
    .replace(/[()[\]"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return clean || "healthy food";
}

async function searchWikimediaCommons(query: string) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", "8");
  url.searchParams.set("gsrsearch", `${query} food`);
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url");
  url.searchParams.set("iiurlwidth", "900");

  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "NutriMoment/1.0 (+https://localhost:3000)"
      },
      next: { revalidate: 60 * 60 * 24 * 7 }
    });

    if (!response.ok) return null;

    const data = (await response.json()) as WikimediaQueryResponse;
    const pages = Object.values(data.query?.pages ?? {});
    const queryTokens = getMeaningfulPhotoTokens(query);
    const image = pages
      .flatMap((page) =>
        (page.imageinfo ?? []).map((info) => ({
          title: page.title ?? "",
          url: info.thumburl ?? info.url ?? ""
        }))
      )
      .find((candidate) => isSupportedImageUrl(candidate.url) && hasPhotoTokenOverlap(candidate.title, candidate.url, queryTokens));

    return image?.url || null;
  } catch {
    return null;
  }
}

function buildFocusedPhotoQueries(query: string) {
  const candidates = [
    query,
    query.replace(/\s+with\s+.+$/i, ""),
    query.replace(/\s+(?:inspired|style)\b/gi, ""),
    query.split(/\s+/).slice(0, 7).join(" ")
  ]
    .map((candidate) => candidate.replace(/\s+/g, " ").trim())
    .filter((candidate) => candidate.length >= 3);

  return Array.from(new Set(candidates));
}

function isSupportedImageUrl(value: string) {
  if (/\.pdf\b|\/page\d+-/i.test(value)) return false;
  return /^https:\/\/upload\.wikimedia\.org\/.+\.(?:jpg|jpeg|png|webp)(?:[?#].*)?$/i.test(value);
}

function hasPhotoTokenOverlap(title: string, url: string, queryTokens: string[]) {
  if (!queryTokens.length) return true;
  const haystack = normalizePhotoQuery(`${title} ${decodeURIComponent(url)}`).toLowerCase();
  const hits = queryTokens.filter((token) => haystack.includes(token)).length;

  return hits >= Math.min(2, queryTokens.length);
}

function getMeaningfulPhotoTokens(query: string) {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9]/g, ""))
    .filter((token) => token.length >= 4 && !PHOTO_STOP_WORDS.has(token))
    .slice(0, 8);
}

function getKnownDishPhoto(query: string): RecipePhotoLookupResult | null {
  const normalized = query.toLowerCase();
  const hasEgyptian = /\begyptian\b/.test(normalized);
  const hasBeans = /\b(bean|beans|fava|chickpea|chickpeas)\b/.test(normalized);
  const hasRice = /\brice\b/.test(normalized);
  const hasLentils = /\b(lentil|lentils)\b/.test(normalized);
  const hasTomatoPaste = /tomato paste/.test(normalized);

  if (/\b(kafta|kofta|kofte|kefta|kufta)\b/.test(normalized)) {
    return {
      imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Oriental_food_including_beef_kabab%2C_shish_tawoook%2C_and_kafta_kabab_%28Orlando%29_May_2023.jpg/960px-Oriental_food_including_beef_kabab%2C_shish_tawoook%2C_and_kafta_kabab_%28Orlando%29_May_2023.jpg",
      source: "wikimedia"
    };
  }

  if (/\b(koshary|koshari|kushari|kposhary)\b/.test(normalized)) {
    return {
      imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Egyptian_food_Koshary.jpg/960px-Egyptian_food_Koshary.jpg",
      source: "wikimedia"
    };
  }

  if (/\b(ful|foul|fuul)\b/.test(normalized) || /medames/.test(normalized) || /egyptian.*\b(bean|beans|fava)\b/.test(normalized)) {
    return {
      imageUrl: "https://upload.wikimedia.org/wikipedia/commons/b/bf/Ful_medames_%28arabic_meal%29.jpg",
      source: "wikimedia"
    };
  }

  if (hasEgyptian && hasRice && (hasBeans || hasLentils || hasTomatoPaste)) {
    return {
      imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Egyptian_food_Koshary.jpg/960px-Egyptian_food_Koshary.jpg",
      source: "wikimedia"
    };
  }

  if (hasEgyptian && hasBeans) {
    return {
      imageUrl: "https://upload.wikimedia.org/wikipedia/commons/b/bf/Ful_medames_%28arabic_meal%29.jpg",
      source: "wikimedia"
    };
  }

  return null;
}

const PHOTO_STOP_WORDS = new Set([
  "food",
  "meal",
  "dish",
  "prepared",
  "style",
  "inspired",
  "with",
  "and",
  "rice",
  "bowl"
]);
