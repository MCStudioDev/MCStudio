/**
 * COMPLETE CUISINE CATALOGS AGGREGATION
 *
 * This file combines all base catalogs and expansions into a unified,
 * production-ready dataset with ~300 dishes per cuisine.
 *
 * Used by:
 * - Recipe resolver (ingredient → canonical dish matching)
 * - Image identity (exact dish recognition)
 * - Replicate prompt generation
 * - Language localization
 * - User recipe suggestions
 */

import type { CuisineDish, MealType } from "./types";
import {
  getAllCuisineCatalogV2Dishes,
  getCuisineCatalogV2DishById,
  getCuisineCatalogV2Dishes
} from "./v2";
import {
  EGYPTIAN_DISHES,
  MIDDLE_EASTERN_DISHES,
  ASIAN_DISHES,
  MEXICAN_DISHES,
  TURKISH_DISHES,
  ITALIAN_DISHES
} from "./detailedCuisineCatalogs";

import {
  EGYPTIAN_EXPANSION,
  MIDDLE_EASTERN_EXPANSION,
  ASIAN_EXPANSION,
  MEXICAN_EXPANSION,
  TURKISH_EXPANSION,
  ITALIAN_EXPANSION
} from "./cuisineExpansions";
import {
  AMERICAN_DISHES,
  INDIAN_DISHES,
  LIVER_SPECIALTY_DISHES,
  MEDITERRANEAN_DISHES,
  THAI_DISHES
} from "./appCuisineSupplements";

// ============================================================================
// MERGED COMPLETE CATALOGS
// ============================================================================

/**
 * ~280 Egyptian dishes covering:
 * - Breakfast & street food
 * - Main dishes (meat, poultry, seafood)
 * - Rice & pasta variations
 * - Traditional soups
 * - Regional specialties (Cairo, Alexandria, etc.)
 * - Desserts & sweets
 */
export const COMPLETE_EGYPTIAN_CATALOG: readonly CuisineDish[] = [
  ...mergeV2AndLegacyCatalog("egyptian", [
    ...EGYPTIAN_DISHES,
    ...EGYPTIAN_EXPANSION
  ])
];

export const COMPLETE_AMERICAN_CATALOG: readonly CuisineDish[] = [
  ...mergeV2AndLegacyCatalog("american", [...AMERICAN_DISHES, ...getSupplementDishes("american")])
];

export const COMPLETE_INDIAN_CATALOG: readonly CuisineDish[] = [
  ...mergeV2AndLegacyCatalog("indian", [...INDIAN_DISHES, ...getSupplementDishes("indian")])
];

export const COMPLETE_MEDITERRANEAN_CATALOG: readonly CuisineDish[] = [
  ...mergeV2AndLegacyCatalog("mediterranean", [...MEDITERRANEAN_DISHES, ...getSupplementDishes("mediterranean")])
];

export const COMPLETE_THAI_CATALOG: readonly CuisineDish[] = [
  ...mergeV2AndLegacyCatalog("thai", THAI_DISHES)
];

/**
 * ~320 Middle Eastern dishes across 4 sub-regions:
 * - Levantine (Lebanese, Syrian, Palestinian, Jordanian)
 * - Gulf (Saudi, Emirati, Yemeni)
 * - Iraqi
 * - Maghrebi (Moroccan, Tunisian, Algerian)
 */
export const COMPLETE_MIDDLE_EASTERN_CATALOG: readonly CuisineDish[] = [
  ...mergeV2AndLegacyCatalog("middleEastern", [
    ...MIDDLE_EASTERN_DISHES,
    ...MIDDLE_EASTERN_EXPANSION,
    ...getSupplementDishes("middleEastern")
  ])
];

/**
 * ~300+ Asian dishes across 3 sub-regions:
 * - East Asian (Chinese, Japanese, Korean)
 * - Southeast Asian (Thai, Vietnamese, Indonesian, Filipino, Malaysian)
 * - South Asian (Indian, Pakistani, Bangladeshi)
 */
export const COMPLETE_ASIAN_CATALOG: readonly CuisineDish[] = [
  ...mergeV2AndLegacyCatalog("asian", [
    ...ASIAN_DISHES,
    ...ASIAN_EXPANSION
  ])
];

/**
 * ~290 Mexican dishes:
 * - Regional specialties
 * - Street food
 * - Traditional mains
 * - Regional sauces & preparations
 */
export const COMPLETE_MEXICAN_CATALOG: readonly CuisineDish[] = [
  ...mergeV2AndLegacyCatalog("mexican", [
    ...MEXICAN_DISHES,
    ...MEXICAN_EXPANSION,
    ...getSupplementDishes("mexican")
  ])
];

/**
 * ~280 Turkish dishes:
 * - Kebab varieties
 * - Bread & flatbread specialties
 * - Soups
 * - Traditional stews
 */
export const COMPLETE_TURKISH_CATALOG: readonly CuisineDish[] = [
  ...mergeV2AndLegacyCatalog("turkish", [
    ...TURKISH_DISHES,
    ...TURKISH_EXPANSION,
    ...getSupplementDishes("turkish")
  ])
];

/**
 * ~310 Italian dishes across 5 regional styles:
 * - Northern Italian
 * - Central Italian
 * - Southern Italian
 * - Sicilian
 * - Sardinian
 */
export const COMPLETE_ITALIAN_CATALOG: readonly CuisineDish[] = [
  ...mergeV2AndLegacyCatalog("italian", [
    ...ITALIAN_DISHES,
    ...ITALIAN_EXPANSION,
    ...getSupplementDishes("italian")
  ])
];

// ============================================================================
// UNIFIED ACCESS
// ============================================================================

export const COMPLETE_CUISINE_CATALOGS: Record<
  string,
  readonly CuisineDish[]
> = {
  american: COMPLETE_AMERICAN_CATALOG,
  egyptian: COMPLETE_EGYPTIAN_CATALOG,
  indian: COMPLETE_INDIAN_CATALOG,
  mediterranean: COMPLETE_MEDITERRANEAN_CATALOG,
  middleEastern: COMPLETE_MIDDLE_EASTERN_CATALOG,
  asian: COMPLETE_ASIAN_CATALOG,
  mexican: COMPLETE_MEXICAN_CATALOG,
  thai: COMPLETE_THAI_CATALOG,
  turkish: COMPLETE_TURKISH_CATALOG,
  italian: COMPLETE_ITALIAN_CATALOG
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get complete catalog for a specific cuisine
 */
export function getCompleteCuisineCatalog(
  cuisineKey: string
): readonly CuisineDish[] | null {
  const normalized = normalizeCompleteCuisineKey(cuisineKey);
  return COMPLETE_CUISINE_CATALOGS[normalized] ?? null;
}

/**
 * Get all dishes for a specific sub-cuisine (e.g., "levantine")
 */
export function getDishesForSubCuisine(
  subCuisineKey: string
): readonly CuisineDish[] {
  return Array.from(
    Object.values(COMPLETE_CUISINE_CATALOGS)
      .flat()
      .filter((dish) => dish.subCuisine === subCuisineKey)
  );
}

/**
 * Search dishes by name (English or native script)
 */
export function searchDishByName(
  query: string
): readonly CuisineDish[] {
  const lowerQuery = query.toLowerCase();
  return Array.from(
    Object.values(COMPLETE_CUISINE_CATALOGS)
      .flat()
      .filter(
        (dish) =>
          dish.names.english.some((name) =>
            name.toLowerCase().includes(lowerQuery)
          ) ||
          dish.names.native.some((name) =>
            name.toLowerCase().includes(lowerQuery)
          )
      )
  );
}

/**
 * Get dishes by meal type (breakfast, lunch, dinner, etc.)
 */
export function getDishesForMealType(mealType: string): readonly CuisineDish[] {
  const catalogMealType = mealType as MealType;
  return Array.from(
    Object.values(COMPLETE_CUISINE_CATALOGS)
      .flat()
      .filter((dish) => dish.mealTypes.includes(catalogMealType))
  );
}

/**
 * Get top iconic dishes for a cuisine (sorted by iconicScore)
 */
export function getIconicDishesForCuisine(
  cuisineKey: string,
  limit = 25
): readonly CuisineDish[] {
  const catalog = getCompleteCuisineCatalog(cuisineKey);
  if (!catalog) return [];

  return [...catalog]
    .sort((a, b) => b.iconicScore - a.iconicScore)
    .slice(0, limit);
}

/**
 * Find dishes that contain specific ingredients
 */
export function findDishesByIngredient(ingredient: string): readonly CuisineDish[] {
  const lowerIngredient = ingredient.toLowerCase();
  return Array.from(
    Object.values(COMPLETE_CUISINE_CATALOGS)
      .flat()
      .filter(
        (dish) =>
          dish.primaryIngredients.some((ing) =>
            ing.toLowerCase().includes(lowerIngredient)
          ) ||
          dish.optionalIngredients.some((ing) =>
            ing.toLowerCase().includes(lowerIngredient)
          )
      )
  );
}

/**
 * Get statistics about the catalogs
 */
export function getCatalogStatistics(): {
  totalDishes: number;
  dishesByRepeatDishId: Record<string, number>;
  dishesPerCuisine: Record<string, number>;
} {
  const allDishes = Object.values(COMPLETE_CUISINE_CATALOGS).flat();

  return {
    totalDishes: allDishes.length,
    dishesByRepeatDishId: Object.entries(COMPLETE_CUISINE_CATALOGS).reduce(
      (acc, [cuisine, dishes]) => ({
        ...acc,
        [cuisine]: dishes.length
      }),
      {}
    ),
    dishesPerCuisine: Object.entries(COMPLETE_CUISINE_CATALOGS).reduce(
      (acc, [cuisine, dishes]) => ({
        ...acc,
        [cuisine]: dishes.length
      }),
      {}
    )
  };
}

/**
 * Export all catalogs as a flat array (useful for bulk operations)
 */
export function getAllDishes(): readonly CuisineDish[] {
  return mergeCatalogDishes([
    ...getAllCuisineCatalogV2Dishes(),
    ...Object.values(COMPLETE_CUISINE_CATALOGS).flat()
  ]);
}

/**
 * Get dish by ID (unique across all cuisines)
 */
export function getDishById(dishId: string): CuisineDish | null {
  const v2Dish = getCuisineCatalogV2DishById(dishId);
  if (v2Dish) return v2Dish;
  const allDishes = getAllDishes();
  return allDishes.find((dish) => dish.id === dishId) ?? null;
}

function mergeV2AndLegacyCatalog(cuisineKey: string, legacyCatalog: readonly CuisineDish[]) {
  return mergeCatalogDishes([
    ...getCuisineCatalogV2Dishes(cuisineKey),
    ...legacyCatalog
  ]);
}

function getSupplementDishes(cuisine: CuisineDish["cuisine"]) {
  return LIVER_SPECIALTY_DISHES.filter((dish) => dish.cuisine === cuisine);
}

function mergeCatalogDishes(dishes: readonly CuisineDish[]) {
  const seen = new Set<string>();
  const merged: CuisineDish[] = [];

  for (const dish of dishes) {
    if (seen.has(dish.id)) continue;
    seen.add(dish.id);
    merged.push(dish);
  }

  return merged;
}

function normalizeCompleteCuisineKey(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z]/g, "");
  const aliases: Record<string, keyof typeof COMPLETE_CUISINE_CATALOGS> = {
    american: "american",
    arab: "middleEastern",
    chinese: "asian",
    egyptian: "egyptian",
    greek: "mediterranean",
    indian: "indian",
    italian: "italian",
    japanese: "asian",
    korean: "asian",
    levantine: "middleEastern",
    mediterranean: "mediterranean",
    mexican: "mexican",
    middleeast: "middleEastern",
    middleeastern: "middleEastern",
    spanish: "mediterranean",
    thai: "thai",
    turkish: "turkish"
  };

  return aliases[normalized] ?? normalized;
}
