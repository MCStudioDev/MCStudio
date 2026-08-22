import { isDurableRecipeImageUrl, isReplicateGeneratedRecipeImageUrl } from "@/lib/recipeImageDurability";
import { toIdentityKey } from "@/lib/photoIdentityBuilders";
import type { MealPlanMeal } from "@/lib/types";

export function getMealPlanPhotoIdentityKey(meal: Pick<MealPlanMeal, "name" | "photo_identity">) {
  return toIdentityKey(meal.photo_identity?.dish_slug) ||
    toIdentityKey(meal.photo_identity?.english_name) ||
    toIdentityKey(meal.name) ||
    "unknown-meal";
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

export function getGeneratedRecipePhotoSlug(imageUrl: string) {
  try {
    const decodedPath = decodeURIComponent(new URL(imageUrl).pathname);
    const match = decodedPath.match(/generated:(?:strict-v\d+:)?([^/]+?)\.(?:avif|jpe?g|png|webp)$/i);
    return toIdentityKey(match?.[1]);
  } catch {
    return undefined;
  }
}
