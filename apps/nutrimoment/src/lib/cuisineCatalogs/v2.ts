import manifestJson from "@/data/cuisineCatalogV2/manifest.json";
import americanJson from "@/data/cuisineCatalogV2/american.json";
import asianJson from "@/data/cuisineCatalogV2/asian.json";
import egyptianJson from "@/data/cuisineCatalogV2/egyptian.json";
import indianJson from "@/data/cuisineCatalogV2/indian.json";
import italianJson from "@/data/cuisineCatalogV2/italian.json";
import mediterraneanJson from "@/data/cuisineCatalogV2/mediterranean.json";
import mexicanJson from "@/data/cuisineCatalogV2/mexican.json";
import middleEasternJson from "@/data/cuisineCatalogV2/middleEastern.json";
import thaiJson from "@/data/cuisineCatalogV2/thai.json";
import turkishJson from "@/data/cuisineCatalogV2/turkish.json";
import type {
  CuisineCatalogV2Entry,
  CuisineCatalogV2File,
  CuisineCatalogV2Manifest,
  CuisineDish,
  CuisineKey
} from "./types";

const CATALOG_V2_FILES: Partial<Record<CuisineKey, CuisineCatalogV2File>> = {
  american: americanJson as CuisineCatalogV2File,
  asian: asianJson as CuisineCatalogV2File,
  egyptian: egyptianJson as CuisineCatalogV2File,
  indian: indianJson as CuisineCatalogV2File,
  italian: italianJson as CuisineCatalogV2File,
  mediterranean: mediterraneanJson as CuisineCatalogV2File,
  mexican: mexicanJson as CuisineCatalogV2File,
  middleEastern: middleEasternJson as CuisineCatalogV2File,
  thai: thaiJson as CuisineCatalogV2File,
  turkish: turkishJson as CuisineCatalogV2File
};

export const CATALOG_V2_MANIFEST = manifestJson as CuisineCatalogV2Manifest;

export function getCuisineCatalogV2Entries(cuisineKey: string): readonly CuisineCatalogV2Entry[] {
  const normalized = normalizeCatalogV2CuisineKey(cuisineKey);
  if (!normalized) return [];
  return CATALOG_V2_FILES[normalized]?.entries ?? [];
}

export function getAllCuisineCatalogV2Entries(): readonly CuisineCatalogV2Entry[] {
  return Object.values(CATALOG_V2_FILES).flatMap((file) => file?.entries ?? []);
}

export function getCuisineCatalogV2Dishes(cuisineKey: string): readonly CuisineDish[] {
  return getCuisineCatalogV2Entries(cuisineKey).map(convertV2EntryToCuisineDish);
}

export function getAllCuisineCatalogV2Dishes(): readonly CuisineDish[] {
  return getAllCuisineCatalogV2Entries().map(convertV2EntryToCuisineDish);
}

export function getCuisineCatalogV2DishById(dishId: string): CuisineDish | null {
  const normalizedId = dishId.trim().toLowerCase();
  if (!normalizedId) return null;
  const entry = getAllCuisineCatalogV2Entries().find((candidate) => candidate.id === normalizedId);
  return entry ? convertV2EntryToCuisineDish(entry) : null;
}

export function convertV2EntryToCuisineDish(entry: CuisineCatalogV2Entry): CuisineDish {
  return {
    cuisine: entry.cuisine,
    description: entry.description,
    iconicScore: entry.score,
    id: entry.id,
    mealTypes: entry.mealTypes,
    names: entry.names,
    optionalIngredients: entry.ingredients.optional,
    primaryIngredients: entry.ingredients.required,
    region: entry.region,
    subCuisine: entry.subCuisine
  };
}

export function normalizeCatalogV2CuisineKey(cuisineKey: string): CuisineKey | null {
  const normalized = cuisineKey.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (!normalized) return null;
  if (normalized === "egyptian" || normalized === "egypt") return "egyptian";
  if (normalized === "middleeastern" || normalized === "levantine" || normalized === "arabic") return "middleEastern";
  if (normalized === "american") return "american";
  if (normalized === "asian") return "asian";
  if (normalized === "indian") return "indian";
  if (normalized === "mediterranean" || normalized === "greek" || normalized === "spanish") return "mediterranean";
  if (normalized === "mexican") return "mexican";
  if (normalized === "thai") return "thai";
  if (normalized === "turkish") return "turkish";
  if (normalized === "italian") return "italian";
  return null;
}
