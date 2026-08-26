import { isDurableRecipeImageUrl, isReplicateGeneratedRecipeImageUrl } from "@/lib/recipeImageDurability";
import { toIdentityKey } from "@/lib/photoIdentityBuilders";
import type { MealPlanMeal } from "@/lib/types";

const MEAL_PLAN_RECIPE_PHOTO_CACHE_VERSION = "strict-v7";

export function getMealPlanPhotoIdentityKey(meal: Pick<MealPlanMeal, "name" | "photo_identity">) {
  return toIdentityKey(meal.photo_identity?.dish_slug) ||
    toIdentityKey(meal.photo_identity?.english_name) ||
    toIdentityKey(meal.name) ||
    "unknown-meal";
}

export function getMealPlanPhotoCacheSignatures(
  meal: Pick<MealPlanMeal, "name" | "photo_identity">
) {
  const identityKey = getMealPlanPhotoIdentityKey(meal);
  const baseSignature = `generated:${MEAL_PLAN_RECIPE_PHOTO_CACHE_VERSION}:${identityKey}`;
  const cuisineKey = toIdentityKey(meal.photo_identity?.cuisine_key);

  return Array.from(new Set([
    baseSignature,
    ...(cuisineKey ? [`${baseSignature}|${cuisineKey}`] : [])
  ]));
}

export function isMealPlanImageIdentityCompatible(
  meal: Pick<MealPlanMeal, "name" | "photo_identity">,
  imageUrl?: string | null
): imageUrl is string {
  if (!isDurableRecipeImageUrl(imageUrl)) return false;
  if (!isReplicateGeneratedRecipeImageUrl(imageUrl)) return true;

  const storedSlug = getGeneratedRecipePhotoSlug(imageUrl);
  if (!storedSlug) return false;

  const expectedKeys = new Set([
    toIdentityKey(meal.photo_identity?.dish_slug),
    toIdentityKey(meal.photo_identity?.english_name),
    toIdentityKey(meal.name)
  ].filter((value): value is string => Boolean(value)));

  return expectedKeys.has(storedSlug);
}

export function isMealPlanRestorableImageUrl(imageUrl?: string | null): imageUrl is string {
  if (isReplicateGeneratedRecipeImageUrl(imageUrl)) return true;
  if (!isDurableRecipeImageUrl(imageUrl)) return false;

  try {
    const decodedPath = decodeURIComponent(new URL(imageUrl).pathname);
    return /\/shared-recipes-v2\/shared-[^/]+\/photo\.(?:avif|jpe?g|png|webp)$/i.test(decodedPath);
  } catch {
    return false;
  }
}

export function getGeneratedRecipePhotoSlug(imageUrl: string) {
  try {
    const decodedPath = decodeURIComponent(new URL(imageUrl).pathname);
    const match = decodedPath.match(/generated:(?:strict-v\d+:)?([^/]+?)\.(?:avif|jpe?g|png|webp)$/i);
    return toIdentityKey(match?.[1]);
  } catch {
    return undefined;
  }
}
