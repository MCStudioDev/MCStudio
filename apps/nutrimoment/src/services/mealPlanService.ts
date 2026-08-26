import type { MealPlanData, MealPlanDay } from "@/lib/types";
import type { RecipeCatalogDoc } from "@/lib/domain";
import { normalizePantryIngredientName, normalizeUnit, parsePantryQuantity, unitsMatch } from "@/lib/pantryQuantity";
import { reconcileShoppingListWithPantryAndLanguage } from "@/lib/shoppingListNormalizer";
import { mapCatalogRecipeToMeal } from "@/services/recipeSearchService";

export interface MealPlanCandidateDay {
  breakfast?: RecipeCatalogDoc;
  lunch?: RecipeCatalogDoc;
  dinner?: RecipeCatalogDoc;
}

export function buildMealPlanFromCatalog(recipes: RecipeCatalogDoc[]): MealPlanCandidateDay[] {
  const breakfasts = recipes.filter((recipe) => recipe.mealType === "breakfast");
  const lunches = recipes.filter((recipe) => recipe.mealType === "lunch");
  const dinners = recipes.filter((recipe) => recipe.mealType === "dinner");

  return Array.from({ length: 7 }, (_, index) => ({
    breakfast: breakfasts[index % Math.max(breakfasts.length, 1)],
    lunch: lunches[index % Math.max(lunches.length, 1)],
    dinner: dinners[index % Math.max(dinners.length, 1)]
  }));
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface PantryStockItem {
  name: string;
  quantity?: string;
}

interface PantryStockAmount {
  canonical: string;
  quantity: number;
  unit: string;
}

export function buildMealPlanData(
  recipes: RecipeCatalogDoc[],
  pantryIngredients: PantryStockItem[] = [],
  options: { diets?: string[]; recipeLanguage?: string } = {}
): MealPlanData {
  const pantryStock = buildPantryStockMap(pantryIngredients);
  const pantryRankedRecipes = rankRecipesByPantryUsage(recipes, pantryStock);
  const slots = buildMealPlanFromCatalog(pantryRankedRecipes);
  const plan: MealPlanDay[] = slots.map((slot, index) => ({
    day: DAYS[index],
    breakfast: mapCatalogRecipeToMeal(slot.breakfast, options),
    lunch: mapCatalogRecipeToMeal(slot.lunch, options),
    dinner: mapCatalogRecipeToMeal(slot.dinner, options)
  }));

  const shoppingList = buildShoppingList(slots, pantryStock);

  return { plan, shoppingList };
}

function buildShoppingList(slots: MealPlanCandidateDay[], pantryStock: Map<string, PantryStockAmount>) {
  const needed = new Map<string, PantryStockAmount>();

  slots
    .flatMap((slot) => [slot.breakfast, slot.lunch, slot.dinner])
    .filter((recipe): recipe is RecipeCatalogDoc => Boolean(recipe))
    .flatMap((recipe) => recipe.ingredients)
    .forEach((ingredient) => {
      const key = normalizePantryIngredientName(ingredient.canonical);
      const unit = normalizeUnit(ingredient.unit ?? "whole") || "whole";
      const quantity = ingredient.quantity ?? 1;
      const current = needed.get(key);

      if (current && current.unit === unit) {
        current.quantity += quantity;
        return;
      }

      if (current) {
        current.quantity += quantity;
        current.unit = "mixed units";
        return;
      }

      needed.set(key, {
        canonical: ingredient.canonical,
        quantity,
        unit
      });
    });

  return Array.from(needed.entries())
    .map(([key, item]) => subtractPantryStock(item, pantryStock.get(key)))
    .filter((item) => item.quantity > 0)
    .map(formatShoppingItem);
}

function buildPantryStockMap(items: PantryStockItem[]) {
  const stock = new Map<string, PantryStockAmount>();

  items.forEach((item) => {
    const canonical = normalizePantryIngredientName(item.name);
    if (!canonical) return;

    const parsed = parsePantryQuantity(item.quantity, item.name);
    const current = stock.get(canonical);

    if (current && current.unit === parsed.unit) {
      current.quantity += parsed.quantity;
      return;
    }

    if (current) {
      current.quantity += parsed.quantity;
      current.unit = "mixed units";
      return;
    }

    stock.set(canonical, {
      canonical,
      quantity: parsed.quantity,
      unit: parsed.unit
    });
  });

  return stock;
}

function subtractPantryStock(item: PantryStockAmount, pantryItem?: PantryStockAmount): PantryStockAmount {
  if (!pantryItem) return item;

  if (unitsMatch(item.unit, pantryItem.unit)) {
    return {
      ...item,
      quantity: Math.max(0, item.quantity - pantryItem.quantity)
    };
  }

  return item;
}

function formatShoppingItem(item: PantryStockAmount) {
  const quantity = Number.isInteger(item.quantity) ? `${item.quantity}` : item.quantity.toFixed(1);
  return `${item.canonical} - ${quantity} ${item.unit}`;
}

export function reconcileShoppingListWithPantry(shoppingList: string[], pantryItems: PantryStockItem[]): string[] {
  return reconcileShoppingListWithPantryAndLanguage(shoppingList, pantryItems, "en");
}

export function rankRecipesByPantryUsage(
  recipes: RecipeCatalogDoc[],
  pantryStock: Map<string, PantryStockAmount>
) {
  return recipes
    .map((recipe, index) => {
      const ingredients = recipe.ingredientCanonicals.map(normalizePantryIngredientName).filter(Boolean);
      const ownedCount = ingredients.filter((ingredient) => pantryStock.has(ingredient)).length;
      const missingCount = Math.max(0, ingredients.length - ownedCount);
      const coverage = ingredients.length ? ownedCount / ingredients.length : 0;
      return { recipe, index, ownedCount, missingCount, coverage };
    })
    .sort((left, right) =>
      right.ownedCount - left.ownedCount ||
      right.coverage - left.coverage ||
      left.missingCount - right.missingCount ||
      left.index - right.index
    )
    .map(({ recipe }) => recipe);
}
