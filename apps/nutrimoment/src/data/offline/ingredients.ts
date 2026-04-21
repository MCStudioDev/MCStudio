import type { IngredientDoc } from "@/lib/domain";

export const OFFLINE_INGREDIENTS: IngredientDoc[] = [
  {
    id: "ingredient-chicken-breast",
    name: "chicken breast",
    category: "protein",
    broadCategory: "meat",
    dietCompatibility: ["high-protein", "gluten-free"],
    commonSubstitutes: ["turkey breast", "tofu"],
    isActive: true
  },
  {
    id: "ingredient-rice",
    name: "rice",
    category: "grain",
    broadCategory: "grain",
    dietCompatibility: ["gluten-free"],
    commonSubstitutes: ["quinoa", "cauliflower rice"],
    isActive: true
  },
  {
    id: "ingredient-broccoli",
    name: "broccoli",
    category: "vegetable",
    broadCategory: "produce",
    dietCompatibility: ["vegan", "vegetarian", "gluten-free"],
    commonSubstitutes: ["cauliflower", "green beans"],
    isActive: true
  }
];
