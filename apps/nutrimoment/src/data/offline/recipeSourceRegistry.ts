import type { RecipeSourceDoc } from "@/lib/domain";

export const REAL_RECIPE_SOURCE_REGISTRY: RecipeSourceDoc[] = [
  {
    id: "themealdb",
    name: "TheMealDB",
    provider: "themealdb",
    mode: "api",
    baseUrl: "https://www.themealdb.com",
    focusCuisines: ["egyptian", "italian", "middle eastern"],
    focusRegions: ["egypt", "levant", "anatolia", "mediterranean"],
    languages: ["en"],
    license: "Provider terms",
    trustScore: 72,
    importPriority: 10,
    active: true,
    notes: "Good bootstrap API for broad recipe import and first-pass cuisine coverage."
  },
  {
    id: "wikibooks",
    name: "Wikibooks Cookbook",
    provider: "wikibooks",
    mode: "wiki",
    baseUrl: "https://en.wikibooks.org/wiki/Cookbook",
    focusCuisines: ["italian", "egyptian", "middle eastern"],
    focusRegions: ["italy", "egypt", "middle east"],
    languages: ["en"],
    license: "CC BY-SA",
    trustScore: 66,
    importPriority: 20,
    active: true,
    notes: "Useful for established dish families and transparent attribution."
  },
  {
    id: "openrecipes",
    name: "Open Recipe Data",
    provider: "openrecipes",
    mode: "dataset",
    baseUrl: "https://github.com/jakevdp/open-recipe-data",
    focusCuisines: ["italian", "middle eastern", "egyptian"],
    focusRegions: ["italy", "egypt", "middle east"],
    languages: ["en"],
    license: "CC BY 3.0",
    trustScore: 58,
    importPriority: 30,
    active: true,
    notes: "Large real-source recipe index derived from the archived Open Recipes project; best used with strict filtering and review."
  }
];

export function getRecipeSourceById(sourceId: string) {
  return REAL_RECIPE_SOURCE_REGISTRY.find((source) => source.id === sourceId);
}
