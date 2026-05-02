import type { Recipe } from "@/lib/types";

const FAMILY_MEMBERS: Record<string, string[]> = {
  pasta: ["pasta", "spaghetti", "penne", "fettuccine", "macaroni", "linguine", "rigatoni", "fusilli", "farfalle", "lasagna noodles", "shell pasta", "pasta shells", "conchiglie"],
  rice: ["rice", "basmati rice", "jasmine rice", "brown rice", "white rice", "risotto rice"],
  noodle: ["noodle", "noodles", "egg noodles", "rice noodles"],
  shrimp: ["shrimp", "prawn", "prawns"],
  chicken: ["chicken", "chicken breast", "grilled chicken", "fried chicken"],
  groundmeat: ["ground meat", "ground beef", "minced beef", "minced meat", "ground lamb", "ground turkey"],
  tomato: ["tomato", "tomato sauce", "marinara", "red sauce"],
  whitesauce: ["white sauce", "alfredo sauce", "creamy sauce", "bechamel", "bechamel sauce"],
  pesto: ["pesto", "pesto sauce", "صلصة بيستو جاهزة"]
};

const FAMILY_BY_MEMBER = new Map<string, string>();
for (const [family, members] of Object.entries(FAMILY_MEMBERS)) {
  for (const member of members) {
    FAMILY_BY_MEMBER.set(member, family);
  }
}

export function expandIngredientFamilies(ingredients: string[]) {
  const expanded = new Set<string>();

  for (const ingredient of ingredients) {
    const normalized = normalizeFamilyText(ingredient);
    if (!normalized) continue;
    expanded.add(normalized);

    const family = FAMILY_BY_MEMBER.get(normalized);
    if (family) {
      expanded.add(family === "groundmeat" ? "ground meat" : family === "whitesauce" ? "white sauce" : family);
    }
  }

  return Array.from(expanded);
}

export function buildRecipeDishFamilyKey(recipe: Pick<Recipe, "name" | "dish_intent" | "image_search_index">) {
  return normalizeFamilyText(
    recipe.dish_intent?.dish_name ||
      recipe.image_search_index ||
      recipe.name
  )
    .replace(/\b(any|food|dish|meal|plate|bowl|dinner|lunch|breakfast|snack)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildRecipeStructureSignature(recipe: Pick<Recipe, "name" | "dish_intent" | "image_search_index" | "ingredients" | "missing_ingredients">) {
  const ingredients = expandIngredientFamilies([
    ...recipe.ingredients,
    ...recipe.missing_ingredients
  ]);
  const tokens = [
    buildRecipeDishFamilyKey(recipe) || "unknown",
    pickRecipeFamily(ingredients, ["pasta", "rice", "noodle"]) || "starch-none",
    pickRecipeFamily(ingredients, ["shrimp", "chicken", "ground meat", "fish"]) || "protein-none",
    pickRecipeFamily(ingredients, ["white sauce", "tomato", "pesto"]) || "sauce-none",
    normalizeFamilyText(recipe.dish_intent?.cooking_method ?? "") || "method-none"
  ];

  return tokens.join("|");
}

export function isPastaLikeIngredient(value: string) {
  const normalized = normalizeFamilyText(value);
  if (!normalized) return false;
  return normalized === "pasta" || FAMILY_BY_MEMBER.get(normalized) === "pasta";
}

function pickRecipeFamily(ingredients: string[], candidates: string[]) {
  return candidates.find((candidate) => ingredients.includes(candidate));
}

function normalizeFamilyText(value: string) {
  return value
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
