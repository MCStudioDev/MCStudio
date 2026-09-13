import { CURATED_TRUSTED_RECIPE_CATALOG } from "@/data/offline/curatedTrustedRecipeCatalog";
import { arabicFingerprint } from "./fingerprint";
import { classifyRecipeContentQuality } from "@/services/recipeContentQualityService";

// Static source data only. Never call English search/cache promotion helpers.
export function listTrustedArabicSources() {
  return CURATED_TRUSTED_RECIPE_CATALOG.filter(recipe => recipe.isActive && classifyRecipeContentQuality(recipe).eligibleForDiscovery);
}
export function readTrustedArabicSource(id: string) {
  return listTrustedArabicSources().find(recipe => recipe.id === id) ?? null;
}
export function trustedArabicSourceFingerprint(source: NonNullable<ReturnType<typeof readTrustedArabicSource>>) {
  return `ar-trusted-v1-${arabicFingerprint(source)}`;
}
