import type { IngredientAliasDoc } from "@/lib/domain";
import { OFFLINE_INGREDIENT_TAXONOMY } from "@/data/offline/ingredientTaxonomy";

const DERIVED_ALIASES: IngredientAliasDoc[] = OFFLINE_INGREDIENT_TAXONOMY.map((ingredient) => {
  const englishVariants = ingredient.variants
    .filter((variant) => variant.locale === "en")
    .flatMap((variant) => variant.values);
  const arabicVariants = ingredient.variants
    .filter((variant) => variant.locale === "ar")
    .flatMap((variant) => variant.values);
  const raw = englishVariants[0] ?? ingredient.canonical;
  const synonyms = Array.from(new Set([ingredient.canonical, ...englishVariants.slice(1), ...arabicVariants]));

  return {
    id: `alias-${ingredient.canonical.replace(/\s+/g, "-")}`,
    raw,
    canonical: ingredient.canonical,
    category: ingredient.category,
    synonyms,
    misspellings: ingredient.misspellings,
    isActive: ingredient.isActive
  };
});

const CUSTOM_ALIASES: IngredientAliasDoc[] = [
  {
    id: "alias-rice-bag",
    raw: "rice bag",
    canonical: "rice",
    category: "grain",
    synonyms: ["bag of rice", "rice packet", "كيس رز", "كيس أرز"],
    misspellings: [],
    isActive: true
  },
  {
    id: "alias-canned-tomatoes",
    raw: "canned tomatoes",
    canonical: "tomato",
    category: "vegetable",
    synonyms: ["tomatoes", "tinned tomatoes", "طماطم معلبة"],
    misspellings: [],
    isActive: true
  },
  {
    id: "alias-beef-cubes",
    raw: "beef cubes",
    canonical: "beef",
    category: "protein",
    synonyms: ["stew beef", "beef chunks", "لحمة مكعبات", "تكات لحمة"],
    misspellings: [],
    isActive: true
  }
];

export const OFFLINE_INGREDIENT_ALIASES: IngredientAliasDoc[] = [...DERIVED_ALIASES, ...CUSTOM_ALIASES];
