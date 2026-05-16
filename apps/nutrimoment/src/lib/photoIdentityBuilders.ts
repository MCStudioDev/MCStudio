import type { PhotoIdentity } from "@/lib/types";
import type { RecipeCatalogDoc } from "@/lib/domain";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function toIdentityKey(value: string | undefined | null) {
  if (!value) return undefined;
  const slugged = value
    .toString()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slugged || undefined;
}

export function isUsablePhotoIdentitySlug(slug: string | undefined | null): slug is string {
  if (!slug) return false;
  return SLUG_PATTERN.test(slug) && slug.length >= 3 && slug.length <= 96;
}

export function buildPhotoIdentityFromCatalog(recipe: RecipeCatalogDoc): PhotoIdentity | undefined {
  const dishSlug = isUsablePhotoIdentitySlug(recipe.slug) ? recipe.slug : toIdentityKey(recipe.title);
  if (!dishSlug) return undefined;

  const englishName =
    recipe.localized?.English?.name?.trim() ||
    recipe.title?.trim() ||
    recipe.localized?.English?.dish_intent?.dish_name?.trim();
  if (!englishName) return undefined;

  return normalizePhotoIdentity({
    dish_slug: dishSlug,
    english_name: englishName,
    cuisine_key: toIdentityKey(recipe.cuisine),
    method: toIdentityKey(recipe.localized?.English?.dish_intent?.cooking_method)
  });
}

export function normalizePhotoIdentity(input: PhotoIdentity | undefined | null): PhotoIdentity | undefined {
  if (!input) return undefined;

  const dishSlug = toIdentityKey(input.dish_slug);
  const englishName = input.english_name?.trim();
  if (!isUsablePhotoIdentitySlug(dishSlug) || !englishName) return undefined;

  const cuisineKey = toIdentityKey(input.cuisine_key);
  const protein = toIdentityKey(input.protein);
  const starch = toIdentityKey(input.starch);
  const sauce = toIdentityKey(input.sauce);
  const method = toIdentityKey(input.method);

  return {
    dish_slug: dishSlug,
    english_name: englishName,
    ...(cuisineKey ? { cuisine_key: cuisineKey } : {}),
    ...(protein ? { protein } : {}),
    ...(starch ? { starch } : {}),
    ...(sauce ? { sauce } : {}),
    ...(method ? { method } : {})
  };
}
