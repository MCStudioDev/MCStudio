import { z } from "zod";
import { normalizeMealPlanData } from "@/lib/mealPlan";
import { isReplicateGeneratedRecipeImageUrl } from "@/lib/recipeImageDurability";
import { accessErrorResponse, hasRecipeImageAccess, requireUser } from "@/services/authService";
import { listUserCachedRecipes } from "@/services/userRecipeCacheService";

export const runtime = "nodejs";
export const maxDuration = 30;

const requestSchema = z.object({
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
    if (!hasRecipeImageAccess(access)) {
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

    const cachedRecipes = await listUserCachedRecipes(access.uid);
    const cachedImagesByExactName = new Map<string, MatchedMealImage["imageUrl"]>();

    for (const recipe of cachedRecipes) {
      const imageUrl = recipe.image.thumbPath || recipe.image.storagePath || recipe.localized?.English?.image_url || recipe.localized?.Arabic?.image_url;
      if (!isRenderableImage(imageUrl)) continue;

      getCachedRecipeExactNames(recipe).forEach((name) => {
        const key = normalizeExactName(name);
        if (key && !cachedImagesByExactName.has(key)) {
          cachedImagesByExactName.set(key, imageUrl);
        }
      });
    }

    const images: MatchedMealImage[] = [];
    mealPlan.plan.forEach((day, dayIndex) => {
      (["breakfast", "lunch", "dinner"] as const).forEach((mealType) => {
        const meal = day[mealType];
        if (isRenderableImage(meal.image_url)) return;

        const imageUrl = getMealExactNames(meal).map(normalizeExactName).map((key) => cachedImagesByExactName.get(key)).find(isRenderableImage);
        if (!imageUrl) return;

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
  image_search_index?: string;
  image_search_indices?: string[];
  name: string;
}) {
  return [
    meal.name,
    meal.image_search_index,
    ...(meal.image_search_indices ?? [])
  ].filter((value): value is string => Boolean(value?.trim()));
}

function getCachedRecipeExactNames(recipe: Awaited<ReturnType<typeof listUserCachedRecipes>>[number]) {
  return [
    recipe.title,
    recipe.localized?.English?.name,
    recipe.localized?.Arabic?.name,
    recipe.localized?.English?.image_search_index,
    recipe.localized?.Arabic?.image_search_index,
    ...(recipe.localized?.English?.image_search_indices ?? []),
    ...(recipe.localized?.Arabic?.image_search_indices ?? [])
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
