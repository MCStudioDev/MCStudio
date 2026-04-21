import type { IngredientAliasDoc } from "@/lib/domain";

export const OFFLINE_INGREDIENT_ALIASES: IngredientAliasDoc[] = [
  {
    id: "alias-chicken-breasts",
    raw: "chicken breasts",
    canonical: "chicken breast",
    category: "protein",
    synonyms: ["boneless chicken breast", "skinless chicken breast"],
    misspellings: ["chiken breast", "chicken brest"],
    isActive: true
  },
  {
    id: "alias-brocolli",
    raw: "brocolli",
    canonical: "broccoli",
    category: "vegetable",
    synonyms: [],
    misspellings: ["broccolli"],
    isActive: true
  },
  {
    id: "alias-rice-bag",
    raw: "rice bag",
    canonical: "rice",
    category: "grain",
    synonyms: ["white rice", "brown rice"],
    misspellings: [],
    isActive: true
  },
  {
    id: "alias-canned-tomatoes",
    raw: "canned tomatoes",
    canonical: "tomato",
    category: "vegetable",
    synonyms: ["tomatoes"],
    misspellings: [],
    isActive: true
  }
];
