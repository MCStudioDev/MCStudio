import { buildRecipePhotoIdentity, findKnownDish, normalizeRecipePhotoQuery } from "@/lib/recipePhotoIdentity";

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

const CONFLICTING_MEAL_TYPE_TERMS: Record<string, string[]> = {
  chili: ["salad", "soup"],
  dip: ["salad", "soup", "stew"],
  pilaf: ["salad", "soup", "roll"],
  salad: ["soup", "stew", "chili"],
  shakshuka: ["salad", "soup"],
  skillet: ["salad", "soup"],
  soup: ["salad", "stir fry"],
  stew: ["salad", "soup", "stir fry"],
  "stir-fry": ["salad", "soup", "stew"]
};

export function getKnownDishRecipePhoto(query: string): RecipePhotoLookupResult | null {
  const normalized = normalizeRecipePhotoQuery(query);
  const knownDish = findKnownDish(normalized);
  if (knownDish?.imageUrl) {
    return {
      imageUrl: knownDish.imageUrl,
      source: "wikimedia"
    };
  }

  const identity = buildRecipePhotoIdentity(query);

  if (identity.familyKey === "chicken-rice-pilaf") {
    return {
      imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Low-Carb%20Chicken%20and%20Rice.jpg",
      source: "wikimedia"
    };
  }

  if (identity.familyKey === "fish-rice-pilaf" || identity.familyKey === "rice-pilaf") {
    return {
      imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/14T%2020240407%2019.jpg",
      source: "wikimedia"
    };
  }

  if (identity.familyKey === "chicken-rice-salad") {
    return {
      imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Salad%20with%20plain%20rice.jpg",
      source: "wikimedia"
    };
  }

  if (identity.familyKey === "fasolia") {
    return {
      imageUrl: "https://upload.wikimedia.org/wikipedia/commons/b/bf/Ful_medames_%28arabic_meal%29.jpg",
      source: "wikimedia"
    };
  }

  const hasEgyptian = /\begyptian\b/.test(normalized);
  const hasBeans = /\b(bean|beans|fava|chickpea|chickpeas)\b/.test(normalized);
  const hasRice = /\brice\b/.test(normalized);
  const hasLentils = /\b(lentil|lentils)\b/.test(normalized);
  const hasTomatoPaste = /tomato paste/.test(normalized);

  if (hasEgyptian && hasRice && (hasBeans || hasLentils || hasTomatoPaste)) {
    return {
      imageUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Egyptian_food_Koshary.jpg/960px-Egyptian_food_Koshary.jpg",
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

export async function findFreeRecipePhoto(query: string): Promise<RecipePhotoLookupResult | null> {
  const knownDishPhoto = getKnownDishRecipePhoto(query);
  if (knownDishPhoto) {
    return knownDishPhoto;
  }

  const identity = buildRecipePhotoIdentity(query);

  for (const searchQuery of identity.searchQueries) {
    const wikimediaImage = await searchWikimediaCommons(searchQuery, identity);

    if (wikimediaImage) {
      return {
        imageUrl: wikimediaImage,
        source: "wikimedia"
      };
    }
  }

  return null;
}

async function searchWikimediaCommons(query: string, identity: ReturnType<typeof buildRecipePhotoIdentity>) {
  const exactPhrase = await searchWikimediaCommonsOnce(`"${query}"`, identity);
  if (exactPhrase) return exactPhrase;

  return searchWikimediaCommonsOnce(`${query} food`, identity);
}

async function searchWikimediaCommonsOnce(query: string, identity: ReturnType<typeof buildRecipePhotoIdentity>) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", "12");
  url.searchParams.set("gsrsearch", query);
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
    const image = pages
      .flatMap((page) =>
        (page.imageinfo ?? []).map((info) => {
          const title = page.title ?? "";
          const haystack = `${title} ${decodeURIComponent(info.url ?? "")}`;
          return {
            score: scoreWikimediaCandidate(haystack, identity),
            url: info.thumburl ?? info.url ?? ""
          };
        })
      )
      .filter((candidate) => isSupportedImageUrl(candidate.url) && candidate.score >= getRequiredWikimediaScore(identity))
      .sort((left, right) => right.score - left.score)[0];

    return image?.url || null;
  } catch {
    return null;
  }
}

function getRequiredWikimediaScore(identity: ReturnType<typeof buildRecipePhotoIdentity>) {
  if (identity.canonicalDishKey || identity.familyKey) {
    return 5;
  }

  if (identity.beanTypeKey || identity.mealTypeKey) {
    return 6;
  }

  return 7;
}

function isSupportedImageUrl(value: string) {
  if (/\.pdf\b|\/page\d+-/i.test(value)) return false;
  return /^https:\/\/(?:upload|commons)\.wikimedia\.org\/.+\.(?:jpg|jpeg|png|webp)(?:[?#].*)?$/i.test(value);
}

function scoreWikimediaCandidate(candidate: string, identity: ReturnType<typeof buildRecipePhotoIdentity>) {
  const haystack = normalizeRecipePhotoQuery(candidate);
  let score = 0;

  if (identity.canonicalDishKey) {
    const knownDish = findKnownDish(identity.canonicalDishKey);
    if (knownDish && haystack.includes(knownDish.canonicalName)) {
      score += 8;
    }
  }

  if (identity.familyKey) {
    const familyPhrase = identity.familyKey.replace(/-/g, " ");
    if (haystack.includes(familyPhrase)) {
      score += 5;
    }
  }

  if (identity.cuisineKey && haystack.includes(identity.cuisineKey.replace(/-/g, " "))) {
    score += 2;
  }

  if (identity.mainIngredientKey && haystack.includes(identity.mainIngredientKey.replace(/-/g, " "))) {
    score += 2;
  }

  if (identity.beanTypeKey && haystack.includes(identity.beanTypeKey.replace(/-/g, " "))) {
    score += 3;
  }

  if (identity.mealTypeKey) {
    const mealTypePhrase = identity.mealTypeKey.replace(/-/g, " ");
    if (haystack.includes(mealTypePhrase)) {
      score += 4;
    }

    for (const conflictingTerm of CONFLICTING_MEAL_TYPE_TERMS[identity.mealTypeKey] ?? []) {
      if (haystack.includes(conflictingTerm)) {
        score -= 4;
      }
    }
  }

  const tokenHits = identity.coreTokens.filter((token) => haystack.includes(token)).length;
  score += Math.min(tokenHits, 5);

  if (identity.mainIngredientKey === "lamb" && /\b(chicken|fish|salmon|tuna)\b/.test(haystack)) {
    score -= 5;
  }

  if ((identity.mainIngredientKey === "fish" || identity.mainIngredientKey === "tuna") && /\b(chicken|beef|lamb)\b/.test(haystack)) {
    score -= 5;
  }

  if (identity.mainIngredientKey === "tuna" && !/\btuna\b/.test(haystack)) {
    score -= 4;
  }

  if (identity.mainIngredientKey === "bean" && /\b(pancake|dessert|cake|cookie)\b/.test(haystack)) {
    score -= 8;
  }

  return score;
}
