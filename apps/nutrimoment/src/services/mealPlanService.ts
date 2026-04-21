import type { MealPlanData, MealPlanDay } from "@/lib/types";
import type { RecipeCatalogDoc } from "@/lib/domain";
import { normalizePantryIngredientName, normalizeUnit, parsePantryQuantity, unitsMatch } from "@/lib/pantryQuantity";
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

export function buildMealPlanData(recipes: RecipeCatalogDoc[], pantryIngredients: PantryStockItem[] = []): MealPlanData {
  const slots = buildMealPlanFromCatalog(recipes);
  const pantryStock = buildPantryStockMap(pantryIngredients);
  const plan: MealPlanDay[] = slots.map((slot, index) => ({
    day: DAYS[index],
    breakfast: mapCatalogRecipeToMeal(slot.breakfast),
    lunch: mapCatalogRecipeToMeal(slot.lunch),
    dinner: mapCatalogRecipeToMeal(slot.dinner)
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

  return Array.from(needed.values())
    .map((item) => subtractPantryStock(item, pantryStock.get(item.canonical.toLowerCase())))
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
