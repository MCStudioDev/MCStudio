import { z } from "zod";
import { normalizeMealPlanData } from "@/lib/mealPlan";
import {
  getMealPlanPhotoCacheSignatures,
  getMealPlanPhotoIdentityKey,
  isMealPlanImageIdentityCompatible,
  isMealPlanRestorableImageUrl
} from "@/lib/mealPlanImageMatching";
import { getSharedRecipePhotoBySignatures } from "@/lib/sharedRecipePhotoCache";
import type { RecipeCatalogDoc } from "@/lib/domain";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { accessErrorResponse, requireUser } from "@/services/authService";
import {
  isRecipePhotoDietCompatible,
  scopeRecipePhotoAliasesForDiet
} from "@/services/recipePhotoDietCompatibility";
import { isSharedRecipePublishable } from "@/services/sharedRecipePoolQualityService";
import { isSharedRecipeV2Searchable, SHARED_RECIPE_V2_COLLECTION } from "@/services/sharedRecipeV2PolicyService";
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
    const unresolvedMeals: Array<{
      dayIndex: number;
      meal: (typeof mealPlan.plan)[number][MealType];
      mealIdentityKey: string;
      mealType: MealType;
    }> = [];
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
        if (!imageUrl) {
          unresolvedMeals.push({ dayIndex, meal, mealIdentityKey, mealType });
          return;
        }
        imageIdentityByUrl.set(imageUrl, mealIdentityKey);

        images.push({
          dayIndex,
          imageSource: "cache",
          imageUrl,
          mealType
        });
      });
    });

    const unresolvedByIdentity = new Map<string, typeof unresolvedMeals>();
    unresolvedMeals.forEach((entry) => {
      unresolvedByIdentity.set(entry.mealIdentityKey, [
        ...(unresolvedByIdentity.get(entry.mealIdentityKey) ?? []),
        entry
      ]);
    });

    const directCacheMatches = await Promise.all(
      Array.from(unresolvedByIdentity.values()).map(async (entries) => {
        const representative = entries[0];
        const baseSignatures = getMealPlanPhotoCacheSignatures(representative.meal);
        const scopedSignatures = scopeRecipePhotoAliasesForDiet(baseSignatures, parsed.data.diets ?? []);
        const signatureGroups = scopedSignatures.some((signature, index) => signature !== baseSignatures[index])
          ? [scopedSignatures, baseSignatures]
          : [baseSignatures];
        let candidate = null;

        for (const signatures of signatureGroups) {
          const cached = await getSharedRecipePhotoBySignatures(signatures);
          if (!cached || !isRenderableImage(cached.imageUrl)) continue;
          if (!isMealPlanImageIdentityCompatible(representative.meal, cached.imageUrl)) continue;
          if (!isRecipePhotoDietCompatible(cached, { diets: parsed.data.diets ?? [] })) continue;
          candidate = cached;
          break;
        }
        if (!candidate) return null;

        return { candidate, entries };
      })
    );

    directCacheMatches.forEach((match) => {
      if (!match) return;
      const { candidate, entries } = match;
      const existingIdentity = imageIdentityByUrl.get(candidate.imageUrl);
      if (existingIdentity && existingIdentity !== entries[0].mealIdentityKey) return;
      imageIdentityByUrl.set(candidate.imageUrl, entries[0].mealIdentityKey);

      entries.forEach(({ dayIndex, mealType }) => {
        images.push({
          dayIndex,
          imageAttributionName: candidate.imageAttributionName,
          imageAttributionUrl: candidate.imageAttributionUrl,
          imageSource: "cache",
          imageUrl: candidate.imageUrl,
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
  return isMealPlanRestorableImageUrl(value);
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
  const sourceRecipeIds = Array.from(new Set(meals.map((meal) => meal.source_recipe_id).filter(
    (value): value is string => typeof value === "string" && Boolean(value.trim()) && !value.includes("/")
  )));
  const collection = getAdminDb().collection(SHARED_RECIPE_V2_COLLECTION);
  const queries = [
    ...chunkValues(titles, 10).map((values) => collection.where("title", "in", values).get()),
    ...chunkValues(slugs, 10).map((values) => collection.where("slug", "in", values).get())
  ];
  const snapshots = await Promise.allSettled(queries);
  const recipes = new Map<string, RecipeCatalogDoc>();

  const directSnapshots = await Promise.allSettled(
    sourceRecipeIds.map((sourceRecipeId) => collection.doc(sourceRecipeId).get())
  );
  directSnapshots.forEach((result) => {
    if (result.status !== "fulfilled" || !result.value.exists) return;
    const recipe = { ...result.value.data(), id: result.value.id } as RecipeCatalogDoc;
    if (recipe.isActive && isSharedRecipePublishable(recipe) && isSharedRecipeV2Searchable(recipe)) {
      recipes.set(recipe.id || result.value.id, recipe);
    }
  });

  snapshots.forEach((result) => {
    if (result.status !== "fulfilled") return;
    result.value.docs.forEach((document) => {
      const recipe = document.data() as RecipeCatalogDoc;
      if (recipe.isActive && isSharedRecipePublishable(recipe) && isSharedRecipeV2Searchable(recipe)) {
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
