import { isDurableRecipeImageUrl, isReplicateGeneratedRecipeImageUrl } from "@/lib/recipeImageDurability";

const KNOWN_RAW_INGREDIENT_PROVIDER_IMAGE_MARKERS = [
  "photo-1633096013004-e2cb4023b560",
  "photos/20350156/",
  "photos/34831931/",
  "israa_abdel_fattah"
];

export function isKnownWeakRecipeProviderImageUrl(imageUrl?: string | null) {
  const url = imageUrl ?? "";
  if (!url || isReplicateGeneratedRecipeImageUrl(url)) return false;
  const normalized = String(url).toLowerCase();
  return KNOWN_RAW_INGREDIENT_PROVIDER_IMAGE_MARKERS.some((marker) => normalized.includes(marker));
}

export function isUsableRecipeImageForAccess(imageUrl: string | undefined, hasGeneratedImageAccess: boolean): imageUrl is string {
  void hasGeneratedImageAccess;
  if (!isDurableRecipeImageUrl(imageUrl)) return false;
  return !isKnownWeakRecipeProviderImageUrl(imageUrl);
}
