export type CuisineKey =
  | "american"
  | "mediterranean"
  | "indian"
  | "thai"
  | "egyptian"
  | "mexican"
  | "turkish"
  | "middleEastern"
  | "italian"
  | "asian";

export type SubCuisineKey =
  | "levantine"
  | "gulf"
  | "iraqi"
  | "yemeni"
  | "maghrebi"
  | "eastAsian"
  | "southeastAsian"
  | "southAsian"
  | "northIndian"
  | "southIndian"
  | "westIndian"
  | "eastIndian"
  | "centralThai"
  | "northernThai"
  | "northeasternThai"
  | "southernThai"
  | "greek"
  | "levantineMediterranean"
  | "spanish"
  | "southernAmerican"
  | "newEngland"
  | "cajunCreole"
  | "texMexAmerican"
  | "northernItalian"
  | "centralItalian"
  | "southernItalian"
  | "sicilian"
  | "sardinian";

export type MealType =
  | "breakfast"
  | "lunch"
  | "dinner"
  | "snack"
  | "dessert"
  | "side"
  | "soup"
  | "drink"
  | "street_food";

export interface CuisineDishNames {
  english: string[];
  native: string[];
  other?: string[];
}

export interface CuisineDish {
  id: string;
  cuisine: CuisineKey;
  subCuisine?: SubCuisineKey;
  region: string;
  names: CuisineDishNames;
  description: string;
  primaryIngredients: string[];
  optionalIngredients: string[];
  mealTypes: MealType[];
  iconicScore: number;
}

export type CuisineDishCatalog = readonly CuisineDish[];

export type CatalogEntryKind = "canonical" | "variant";
export type CatalogConfidence = "high" | "medium" | "low";

export interface CuisineCatalogV2IngredientProfile {
  avoid?: string[];
  optional: string[];
  required: string[];
}

export interface CuisineCatalogV2ImageProfile {
  avoid?: string[];
  searchPhrases?: string[];
  visual?: string[];
}

export interface CuisineCatalogV2AuthenticityProfile {
  confidence: CatalogConfidence;
  hardGate: boolean;
  parentId?: string;
}

export interface CuisineCatalogV2Entry {
  authenticity: CuisineCatalogV2AuthenticityProfile;
  cuisine: CuisineKey;
  description: string;
  id: string;
  ingredients: CuisineCatalogV2IngredientProfile;
  kind: CatalogEntryKind;
  mealTypes: MealType[];
  names: CuisineDishNames;
  parentId?: string;
  region: string;
  score: number;
  subCuisine?: SubCuisineKey;
}

export interface CuisineCatalogV2File {
  cuisine: CuisineKey;
  entries: CuisineCatalogV2Entry[];
  generatedAt: string;
  source: string;
  version: 2;
}

export interface CuisineCatalogV2Manifest {
  cuisines: Record<CuisineKey, string>;
  generatedAt: string;
  version: 2;
}
