import { config } from "dotenv";
import { getAdminAuth } from "../src/lib/firebaseAdmin";
import { resolveAuthenticCuisineDishes } from "../src/lib/cuisineAuthenticityResolver";
import { buildRecipePhotoIdentity, matchesStrictRecipePhotoIdentity } from "../src/lib/recipePhotoIdentity";
import { buildRecipePhotoQueryCandidates } from "../src/lib/recipePhotoQueries";
import type { Recipe } from "../src/lib/types";

config({ path: ".env.local" });

const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const BASE_URL = process.env.DEBUG_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.argv[2] ?? "bekhitc12@gmail.com";
const PHOTO_DELAY_MS = Number(process.env.DEBUG_PHOTO_DELAY_MS ?? 0);
const MAX_RECIPES = Number(process.env.DEBUG_MAX_RECIPES ?? 10);

if (!API_KEY) {
  throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY is required in .env.local");
}

type GenerateRecipesResponse = {
  recipes?: Recipe[];
  error?: string;
};

type RecipePhotoResponse = {
  imageUrl?: string;
  imageSource?: string;
  source?: string;
  model?: string;
  error?: string;
};

const AUTHENTICITY_CASES: Array<{
  cuisine: string;
  expectedDishId: string;
  ingredients: string[];
  mealType?: string;
}> = [
  { cuisine: "Egyptian", expectedDishId: "hawawshi", ingredients: ["ground beef", "baladi bread", "onion"], mealType: "dinner" },
  { cuisine: "Egyptian", expectedDishId: "ful-medames", ingredients: ["fava beans", "olive oil", "cumin"], mealType: "breakfast" },
  { cuisine: "Egyptian", expectedDishId: "koshary", ingredients: ["rice", "lentils", "macaroni", "tomato sauce"], mealType: "lunch" },
  { cuisine: "Middle Eastern", expectedDishId: "tabbouleh", ingredients: ["parsley", "bulgur", "tomato", "mint"], mealType: "lunch" },
  { cuisine: "Middle Eastern", expectedDishId: "mujaddara", ingredients: ["lentils", "rice", "onion"], mealType: "dinner" },
  { cuisine: "Middle Eastern", expectedDishId: "mansaf", ingredients: ["lamb", "jameed", "rice"], mealType: "dinner" },
  { cuisine: "Middle Eastern", expectedDishId: "maqluba", ingredients: ["rice", "eggplant", "chicken"], mealType: "dinner" },
  { cuisine: "Turkish", expectedDishId: "cig-kofte", ingredients: ["bulgur", "ground beef", "tomato paste"], mealType: "dinner" },
  { cuisine: "Turkish", expectedDishId: "menemen", ingredients: ["eggs", "tomato", "pepper"], mealType: "breakfast" },
  { cuisine: "Italian", expectedDishId: "pasta-puttanesca", ingredients: ["pasta", "olives", "capers", "tomato"], mealType: "dinner" },
  { cuisine: "Indian", expectedDishId: "dal-tadka", ingredients: ["lentils", "ghee", "cumin"], mealType: "dinner" },
  { cuisine: "Thai", expectedDishId: "pad-thai", ingredients: ["rice noodles", "tamarind", "egg", "peanuts"], mealType: "dinner" }
];

async function createIdToken(email: string) {
  const user = await getAdminAuth().getUserByEmail(email);
  const customToken = await getAdminAuth().createCustomToken(user.uid, {
    tier: "premium",
    role: "user",
    email: user.email
  });

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: customToken,
        returnSecureToken: true
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Custom-token exchange failed with ${response.status}: ${await response.text()}`);
  }

  const payload = (await response.json()) as { idToken?: string };
  if (!payload.idToken) {
    throw new Error("Custom-token exchange returned no idToken");
  }

  return payload.idToken;
}

function buildPhotoQueries(recipe: Recipe) {
  const englishLocalized = recipe.localized?.English;
  return buildRecipePhotoQueryCandidates({
    cuisine: englishLocalized?.cuisine ?? recipe.cuisine,
    dishIntent: englishLocalized?.dish_intent ?? recipe.dish_intent,
    imageSearchIndex: englishLocalized?.image_search_index ?? recipe.image_search_index,
    imageSearchIndices: englishLocalized?.image_search_indices ?? recipe.image_search_indices,
    ingredients: englishLocalized?.ingredients ?? recipe.ingredients,
    missingIngredients: englishLocalized?.missing_ingredients ?? recipe.missing_ingredients,
    name: englishLocalized?.name ?? recipe.name
  });
}

function buildPhotoUrl(queries: string[], excludeUrls: string[]) {
  const params = new URLSearchParams();
  queries.slice(0, 5).forEach((query, index) => {
    if (index === 0) {
      params.set("query", query);
    } else {
      params.append("alt", query);
    }
  });

  excludeUrls.slice(0, 8).forEach((url) => params.append("exclude", url));
  return `${BASE_URL}/api/recipe-photo?${params.toString()}`;
}

async function main() {
  assertAuthenticityAndIdentityCases();

  console.log(`Creating premium session for ${EMAIL} against ${BASE_URL}`);
  const idToken = await createIdToken(EMAIL);

  const generateResponse = await fetch(`${BASE_URL}/api/generate-recipes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      ingredients: ["potato"],
      preferredCuisine: "Turkish",
      calorieTarget: 1950,
      recipeCount: 10,
      uiLanguage: "en"
    })
  });

  const generated = (await generateResponse.json()) as GenerateRecipesResponse;
  if (!generateResponse.ok) {
    throw new Error(`Recipe generation failed with ${generateResponse.status}: ${JSON.stringify(generated)}`);
  }

  const recipes = generated.recipes ?? [];
  console.log(`Generated ${recipes.length} recipes`);
  console.log(
    JSON.stringify(
      recipes.map((recipe, index) => ({
        index,
        recipe: recipe.localized?.English?.name ?? recipe.name,
        initialImageUrl: recipe.image_url ?? recipe.localized?.English?.image_url ?? null,
        initialImageSource: recipe.image_source ?? recipe.localized?.English?.image_source ?? null
      })),
      null,
      2
    )
  );

  const excludeUrls: string[] = [];
  const imageCounts = new Map<string, number>();

  for (const [index, recipe] of recipes.slice(0, MAX_RECIPES).entries()) {
    const queries = buildPhotoQueries(recipe);
    const photoUrl = buildPhotoUrl(queries, excludeUrls);
    const response = await fetch(photoUrl, {
      headers: {
        Authorization: `Bearer ${idToken}`
      }
    });
    const photo = (await response.json()) as RecipePhotoResponse;

    console.log(
      JSON.stringify(
        {
          index,
          recipe: recipe.localized?.English?.name ?? recipe.name,
          queries,
          status: response.status,
          imageUrl: photo.imageUrl,
          imageSource: photo.imageSource,
          source: photo.source,
          model: photo.model,
          error: photo.error
        },
        null,
        2
      )
    );

    if (photo.imageUrl) {
      excludeUrls.push(photo.imageUrl);
      imageCounts.set(photo.imageUrl, (imageCounts.get(photo.imageUrl) ?? 0) + 1);
    }

    if (PHOTO_DELAY_MS > 0 && index < recipes.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, PHOTO_DELAY_MS));
    }
  }

  console.log("Unique image URL count:", imageCounts.size);
  console.log("Repeated URLs:", Array.from(imageCounts.entries()).filter(([, count]) => count > 1));
}

function assertAuthenticityAndIdentityCases() {
  const failures: string[] = [];

  for (const testCase of AUTHENTICITY_CASES) {
    const [best] = resolveAuthenticCuisineDishes({
      cuisine: testCase.cuisine,
      ingredients: testCase.ingredients,
      mealType: testCase.mealType
    }, 3);

    if (best?.dish.id !== testCase.expectedDishId) {
      failures.push(
        `${testCase.cuisine} ${testCase.ingredients.join(", ")} expected ${testCase.expectedDishId}, got ${best?.dish.id ?? "none"}`
      );
    }
  }

  const hawawshiIdentity = buildRecipePhotoIdentity("Hawawshi Egyptian food");
  if (matchesStrictRecipePhotoIdentity(hawawshiIdentity, "photo of kebab skewers middle eastern food")) {
    failures.push("Hawawshi strict identity accepted a generic kebab photo haystack.");
  }
  if (!matchesStrictRecipePhotoIdentity(hawawshiIdentity, "fresh hawawshi egyptian stuffed bread")) {
    failures.push("Hawawshi strict identity rejected a direct hawawshi photo haystack.");
  }

  if (failures.length) {
    throw new Error(`Authenticity acceptance checks failed:\n${failures.join("\n")}`);
  }

  console.log(`Authenticity acceptance checks passed: ${AUTHENTICITY_CASES.length} resolver cases plus strict photo identity.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
