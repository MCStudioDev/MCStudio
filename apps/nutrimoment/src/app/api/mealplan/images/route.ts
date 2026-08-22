import { z } from "zod";
import { normalizeMealPlanData } from "@/lib/mealPlan";
import { getMealPlanPhotoIdentityKey, isMealPlanImageIdentityCompatible } from "@/lib/mealPlanImageMatching";
import { isReplicateGeneratedRecipeImageUrl } from "@/lib/recipeImageDurability";
import type { RecipeCatalogDoc } from "@/lib/domain";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { accessErrorResponse, hasGeneratedRecipeImageAccess, requireUser } from "@/services/authService";
import { isRecipePhotoDietCompatible } from "@/services/recipePhotoDietCompatibility";
import { isSharedRecipePublishable } from "@/services/sharedRecipePoolQualityService";
import { listUserCachedRecipes } from "@/services/userRecipeCacheService";

export const runtime = "nodejs";
export const maxDuration = 30;

const requestSchema = z.object({
  diets: z.array(z.string()).optional(),
  mealPlan: z.unknown()
});

type MealType = "breakfast" | "lunch" | "dinner";

interface MatchedMealImage {
  dayIndex: number;
  imageAttributionName?: string;
  imageAttributionUrl?: string;
  imageSource?: "api" | "cache" | "search" | "unsplash" | "wikimedia";
  imageUrl: string;
  mealType: MealType;
}

export async function POST(request: Request) {
  try {
    const access = await requireUser(request);
    if (!hasGeneratedRecipeImageAccess(access)) {
      return Response.json({ error: "Meal plan image restore requires recipe image access." }, { status: 403 });
    }

    const parsed = requestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: "Meal plan data is required." }, { status: 400 });
    }

    const mealPlan = normalizeMealPlanData(parsed.data.mealPlan);
    if (!mealPlan) {
      return Response.json({ error: "Meal plan data was not usable." }, { status: 400 });
    }

    const [userCachedRecipes, sharedCachedRecipes] = await Promise.all([
      listUserCachedRecipes(access.uid),
      listExactSharedMealRecipes(mealPlan)
    ]);
    const cachedRecipes = [...userCachedRecipes, ...sharedCachedRecipes];
    const cachedImagesByExactName = new Map<string, MatchedMealImage["imageUrl"]>();

    for (const recipe of cachedRecipes) {
      const imageUrl = recipe.image.thumbPath || recipe.image.storagePath || recipe.localized?.English?.image_url || recipe.localized?.Arabic?.image_url;
      if (!isRenderableImage(imageUrl)) continue;
      if (!isRecipePhotoDietCompatible({
        imageUrl,
        query: [recipe.title, recipe.image.sourceQuery, recipe.localized?.English?.name].filter(Boolean).join(" "),
        signature: recipe.image.signature,
        source: recipe.image.source,
        dietTags: recipe.image.dietTags ?? recipe.dietTags
      }, { diets: parsed.data.diets ?? [] })) continue;

      getCachedRecipeExactNames(recipe).forEach((name) => {
        const key = normalizeExactName(name);
        if (key && !cachedImagesByExactName.has(key)) {
          cachedImagesByExactName.set(key, imageUrl);
        }
      });
    }

    const images: MatchedMealImage[] = [];
    const imageIdentityByUrl = new Map<string, string>();
    mealPlan.plan.forEach((day, dayIndex) => {
      (["breakfast", "lunch", "dinner"] as const).forEach((mealType) => {
        const meal = day[mealType];
        if (isMealPlanImageIdentityCompatible(meal, meal.image_url)) return;

        const mealIdentityKey = getMealPlanPhotoIdentityKey(meal);
        const imageUrl = getMealExactNames(meal)
          .map(normalizeExactName)
          .map((key) => cachedImagesByExactName.get(key))
          .find((candidate): candidate is string => {
            if (!isRenderableImage(candidate) || !isMealPlanImageIdentityCompatible(meal, candidate)) return false;
            const existingIdentity = imageIdentityByUrl.get(candidate);
            return !existingIdentity || existingIdentity === mealIdentityKey;
          });
        if (!imageUrl) return;
        imageIdentityByUrl.set(imageUrl, mealIdentityKey);

        images.push({
          dayIndex,
          imageSource: "cache",
          imageUrl,
          mealType
        });
      });
    });

    return Response.json({ images });
  } catch (error) {
    if (error instanceof Error && (error.message.includes("Sign in") || error.message.includes("Firebase Admin credentials"))) {
      return accessErrorResponse(error);
    }

    return Response.json({ error: "Meal plan image restore failed.", images: [] }, { status: 500 });
  }
}

function getMealExactNames(meal: {
  name: string;
  photo_identity?: { dish_slug?: string; english_name?: string };
}) {
  return [
    meal.name,
    meal.photo_identity?.english_name,
    meal.photo_identity?.dish_slug
  ].filter((value): value is string => Boolean(value?.trim()));
}

function getCachedRecipeExactNames(recipe: Awaited<ReturnType<typeof listUserCachedRecipes>>[number]) {
  return [
    recipe.title,
    recipe.localized?.English?.name,
    recipe.localized?.Arabic?.name,
    recipe.dishIntent?.dish_name,
    recipe.localized?.English?.dish_intent?.dish_name,
    recipe.localized?.Arabic?.dish_intent?.dish_name,
    recipe.slug
  ].filter((value): value is string => Boolean(value?.trim()));
}

function normalizeExactName(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isRenderableImage(value?: string): value is string {
  return isReplicateGeneratedRecipeImageUrl(value);
}

async function listExactSharedMealRecipes(mealPlan: NonNullable<ReturnType<typeof normalizeMealPlanData>>) {
  const meals = mealPlan.plan.flatMap((day) => [day.breakfast, day.lunch, day.dinner]);
  const titles = Array.from(new Set(meals.flatMap((meal) => [
    meal.photo_identity?.english_name,
    meal.name
  ]).filter((value): value is string => Boolean(value?.trim()))));
  const slugs = Array.from(new Set(meals.map((meal) => meal.photo_identity?.dish_slug).filter(
    (value): value is string => Boolean(value?.trim())
  )));
  const collection = getAdminDb().collection("sharedOfflineRecipeCache");
  const queries = [
    ...chunkValues(titles, 10).map((values) => collection.where("title", "in", values).get()),
    ...chunkValues(slugs, 10).map((values) => collection.where("slug", "in", values).get())
  ];
  const snapshots = await Promise.allSettled(queries);
  const recipes = new Map<string, RecipeCatalogDoc>();

  snapshots.forEach((result) => {
    if (result.status !== "fulfilled") return;
    result.value.docs.forEach((document) => {
      const recipe = document.data() as RecipeCatalogDoc;
      if (recipe.isActive && isSharedRecipePublishable(recipe)) {
        recipes.set(recipe.id || document.id, recipe);
      }
    });
  });

  return Array.from(recipes.values());
}

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}
