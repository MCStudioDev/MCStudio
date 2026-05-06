/**
 * CUISINE CATALOGS INDEX
 *
 * Complete dish catalogs for the app's supported cuisines:
 * - American
 * - Egyptian
 * - Indian
 * - Mediterranean
 * - Middle Eastern (Levantine, Gulf, Iraqi, Maghrebi)
 * - Asian (East, Southeast, broader regional bucket)
 * - Thai
 * - Mexican
 * - Turkish
 * - Italian
 */

// Type definitions
export type {
  CatalogConfidence,
  CatalogEntryKind,
  CuisineCatalogV2Entry,
  CuisineCatalogV2File,
  CuisineCatalogV2Manifest,
  CuisineKey,
  SubCuisineKey,
  MealType,
  CuisineDishNames,
  CuisineDish,
  CuisineDishCatalog
} from "./types";

export {
  CATALOG_V2_MANIFEST,
  convertV2EntryToCuisineDish,
  getAllCuisineCatalogV2Dishes,
  getAllCuisineCatalogV2Entries,
  getCuisineCatalogV2DishById,
  getCuisineCatalogV2Dishes,
  getCuisineCatalogV2Entries
} from "./v2";

// Base detailed catalogs
export {
  AMERICAN_DISHES,
  INDIAN_DISHES,
  LIVER_SPECIALTY_DISHES,
  MEDITERRANEAN_DISHES,
  THAI_DISHES
} from "./appCuisineSupplements";

// Base detailed catalogs
export {
  EGYPTIAN_DISHES,
  MIDDLE_EASTERN_DISHES,
  ASIAN_DISHES,
  MEXICAN_DISHES,
  TURKISH_DISHES,
  ITALIAN_DISHES,
  ALL_CUISINES_CATALOGS as BASE_CATALOGS
} from "./detailedCuisineCatalogs";

// Expanded dish lists
export {
  EGYPTIAN_EXPANSION,
  MIDDLE_EASTERN_EXPANSION,
  ASIAN_EXPANSION,
  MEXICAN_EXPANSION,
  TURKISH_EXPANSION,
  ITALIAN_EXPANSION,
  ALL_EXPANSIONS
} from "./cuisineExpansions";

// Complete merged catalogs
export {
  COMPLETE_AMERICAN_CATALOG,
  COMPLETE_EGYPTIAN_CATALOG,
  COMPLETE_INDIAN_CATALOG,
  COMPLETE_MEDITERRANEAN_CATALOG,
  COMPLETE_MIDDLE_EASTERN_CATALOG,
  COMPLETE_ASIAN_CATALOG,
  COMPLETE_MEXICAN_CATALOG,
  COMPLETE_THAI_CATALOG,
  COMPLETE_TURKISH_CATALOG,
  COMPLETE_ITALIAN_CATALOG,
  COMPLETE_CUISINE_CATALOGS,
  getCompleteCuisineCatalog,
  getDishesForSubCuisine,
  searchDishByName,
  getDishesForMealType,
  getIconicDishesForCuisine,
  findDishesByIngredient,
  getCatalogStatistics,
  getAllDishes,
  getDishById
} from "./completeCatalogs";
