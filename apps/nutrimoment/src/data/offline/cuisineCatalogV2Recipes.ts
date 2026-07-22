import { getAllCuisineCatalogV2Entries } from "@/lib/cuisineCatalogs/v2";
import type { CuisineCatalogV2Entry } from "@/lib/cuisineCatalogs/types";
import type { MealType, RecipeCatalogDoc } from "@/lib/domain";
import { normalizeCachedRecipeCatalogDoc } from "@/data/offline/recipeMetadata";

const CUISINE_LABELS: Record<string, string> = {
  american: "American",
  asian: "Asian",
  egyptian: "Egyptian",
  indian: "Indian",
  italian: "Italian",
  mediterranean: "Mediterranean",
  mexican: "Mexican",
  middleEastern: "Middle Eastern",
  thai: "Thai",
  turkish: "Turkish"
};

let cuisineCatalogV2RecipeDocs: RecipeCatalogDoc[] | null = null;

export function getCuisineCatalogV2RecipeDocs(): RecipeCatalogDoc[] {
  cuisineCatalogV2RecipeDocs ??= getAllCuisineCatalogV2Entries().map(convertCuisineCatalogV2EntryToRecipeDoc);
  return cuisineCatalogV2RecipeDocs;
}

export function convertCuisineCatalogV2EntryToRecipeDoc(entry: CuisineCatalogV2Entry): RecipeCatalogDoc {
  const requiredCanonicals = normalizeCanonicals(entry.ingredients.required);
  const optionalCanonicals = normalizeCanonicals(entry.ingredients.optional);
  const ingredientCanonicals = Array.from(new Set([...requiredCanonicals, ...optionalCanonicals]));
  const title = entry.names.english[0] ?? titleCase(entry.id);
  const cuisine = CUISINE_LABELS[entry.cuisine] ?? titleCase(entry.cuisine);
  const mealType = normalizeMealType(entry.mealTypes);
  const totalMinutes = inferTotalMinutes(entry);
  const calories = inferCalories(entry, ingredientCanonicals);
  const protein = inferProtein(ingredientCanonicals);
  const carbs = inferCarbs(ingredientCanonicals);
  const fat = inferFat(ingredientCanonicals);
  const timestamp = 0;

  const recipe: RecipeCatalogDoc = {
    id: `catalog-v2-${entry.cuisine}-${entry.id}`,
    title,
    slug: `catalog-v2-${entry.cuisine}-${entry.id}`,
    description: entry.description,
    ingredients: ingredientCanonicals.map((canonical) => ({
      name: canonical,
      canonical,
      required: requiredCanonicals.includes(canonical)
    })),
    ingredientCanonicals,
    requiredCanonicals,
    optionalCanonicals,
    dietTags: inferDietTags(ingredientCanonicals),
    allergenTags: inferAllergenTags(ingredientCanonicals),
    mealType,
    cuisine,
    prepMinutes: Math.max(5, Math.round(totalMinutes * 0.35)),
    cookMinutes: Math.max(10, totalMinutes - Math.round(totalMinutes * 0.35)),
    totalMinutes,
    difficulty: inferDifficulty(entry),
    calories,
    protein,
    carbs,
    fat,
    fiber: inferFiber(ingredientCanonicals),
    sodium: inferSodium(ingredientCanonicals),
    calorieBand: calories <= 300 ? "0_300" : calories <= 500 ? "301_500" : calories <= 700 ? "501_700" : "701_plus",
    servings: 1,
    steps: buildSteps(entry, title),
    image: {
      storagePath: "",
      sourceQuery: [cuisine, title, ...entry.names.english.slice(1), ...ingredientCanonicals.slice(0, 3)].join(" ")
    },
    source: {
      provider: "cuisine-catalog-v2"
    },
    dishIntent: {
      dish_name: title.toLowerCase(),
      cuisine,
      meal_type: mealType,
      cooking_method: inferCookingMethod(entry),
      visual_keywords: [title, cuisine, ...ingredientCanonicals.slice(0, 4)],
      exclude_keywords: []
    },
    regionalCuisines: [entry.cuisine, cuisine, entry.region, entry.subCuisine].filter(Boolean) as string[],
    styleTags: inferStyleTags(entry),
    searchTokens: Array.from(new Set([
      title,
      entry.id,
      entry.description,
      cuisine,
      entry.region,
      entry.subCuisine,
      ...entry.names.english,
      ...entry.names.native,
      ...(entry.names.other ?? []),
      ...ingredientCanonicals
    ])).filter(Boolean),
    popularityScore: entry.score,
    qualityScore: entry.authenticity.confidence === "high" ? 90 : entry.authenticity.confidence === "medium" ? 78 : 66,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  return normalizeCachedRecipeCatalogDoc(recipe);
}

function normalizeCanonicals(values: string[]) {
  return values
    .map((value) => value.trim().toLowerCase().replace(/\s+/g, " "))
    .filter(Boolean);
}

function normalizeMealType(mealTypes: CuisineCatalogV2Entry["mealTypes"]): MealType {
  if (mealTypes.includes("breakfast")) return "breakfast";
  if (mealTypes.includes("snack") || mealTypes.includes("dessert") || mealTypes.includes("drink")) return "snack";
  if (mealTypes.includes("lunch") || mealTypes.includes("side") || mealTypes.includes("soup") || mealTypes.includes("street_food")) return "lunch";
  return "dinner";
}

function inferTotalMinutes(entry: CuisineCatalogV2Entry) {
  const source = `${entry.id} ${entry.description}`.toLowerCase();
  if (/\b(grilled|kebab|kofta|shawarma|stir|salad|sandwich|taco)\b/.test(source)) return 30;
  if (/\b(stew|soup|baked|roast|casserole|bechamel|molokhia)\b/.test(source)) return 50;
  return 40;
}

function inferDifficulty(entry: CuisineCatalogV2Entry): RecipeCatalogDoc["difficulty"] {
  const source = `${entry.id} ${entry.description}`.toLowerCase();
  if (/\b(stuffed|bechamel|pastry|layered|roast|slow)\b/.test(source)) return "medium";
  return "easy";
}

function inferCalories(entry: CuisineCatalogV2Entry, ingredients: string[]) {
  let calories = 260;
  if (ingredients.some((ingredient) => /\b(beef|meat|lamb|chicken|turkey|fish|shrimp|egg)\b/.test(ingredient))) calories += 130;
  if (ingredients.some((ingredient) => /\b(rice|pasta|bread|potato|noodle|flour|bulgur|couscous)\b/.test(ingredient))) calories += 110;
  if (ingredients.some((ingredient) => /\b(cheese|butter|cream|milk|bechamel|nuts|peanut)\b/.test(ingredient))) calories += 80;
  if (entry.mealTypes.includes("snack")) calories -= 70;
  return Math.max(220, Math.min(720, calories));
}

function inferProtein(ingredients: string[]) {
  if (ingredients.some((ingredient) => /\b(beef|meat|lamb|chicken|turkey|fish|shrimp)\b/.test(ingredient))) return 28;
  if (ingredients.some((ingredient) => /\b(lentil|bean|chickpea|egg|tofu)\b/.test(ingredient))) return 16;
  return 10;
}

function inferCarbs(ingredients: string[]) {
  if (ingredients.some((ingredient) => /\b(rice|pasta|bread|potato|noodle|flour|bulgur|couscous)\b/.test(ingredient))) return 52;
  if (ingredients.some((ingredient) => /\b(lentil|bean|chickpea)\b/.test(ingredient))) return 38;
  return 20;
}

function inferFat(ingredients: string[]) {
  let fat = 10;
  if (ingredients.some((ingredient) => /\b(beef|meat|lamb|cheese|butter|cream|milk|bechamel|nuts|peanut)\b/.test(ingredient))) fat += 10;
  if (ingredients.some((ingredient) => /\b(olive oil|oil)\b/.test(ingredient))) fat += 5;
  return fat;
}

function inferFiber(ingredients: string[]) {
  if (ingredients.some((ingredient) => /\b(lentil|bean|chickpea|vegetable|eggplant|okra|greens)\b/.test(ingredient))) return 7;
  return 3;
}

function inferSodium(ingredients: string[]) {
  return ingredients.some((ingredient) => /\b(cheese|pickle|soy sauce|fish sauce)\b/.test(ingredient)) ? 620 : 430;
}

function inferDietTags(ingredients: string[]) {
  const hasAnimal = ingredients.some((ingredient) => /\b(beef|meat|lamb|chicken|turkey|fish|shrimp|egg|milk|cheese|butter|cream|yogurt)\b/.test(ingredient));
  return hasAnimal ? [] : ["vegetarian", "vegan"];
}

function inferAllergenTags(ingredients: string[]) {
  const tags = new Set<string>();
  if (ingredients.some((ingredient) => /\b(milk|cheese|butter|cream|yogurt|bechamel)\b/.test(ingredient))) tags.add("dairy");
  if (ingredients.some((ingredient) => /\b(egg)\b/.test(ingredient))) tags.add("egg");
  if (ingredients.some((ingredient) => /\b(bread|pasta|flour|bulgur|noodle)\b/.test(ingredient))) tags.add("gluten");
  if (ingredients.some((ingredient) => /\b(peanut|nuts)\b/.test(ingredient))) tags.add("nuts");
  if (ingredients.some((ingredient) => /\b(shrimp|fish|seafood)\b/.test(ingredient))) tags.add("seafood");
  return Array.from(tags);
}

function buildSteps(entry: CuisineCatalogV2Entry, title: string) {
  const required = entry.ingredients.required.join(", ");
  const optional = entry.ingredients.optional.slice(0, 3).join(", ");
  return [
    `Prepare the main ingredients for ${title}: ${required}.`,
    optional ? `Add supporting flavors such as ${optional}, adjusting to taste.` : "Season the dish to taste.",
    `Cook until the ingredients are tender and the flavors match the traditional ${title} profile.`,
    "Serve warm with a balanced portion size."
  ];
}

function inferCookingMethod(entry: CuisineCatalogV2Entry) {
  const source = `${entry.id} ${entry.description}`.toLowerCase();
  if (/\b(grill|kebab|shawarma)\b/.test(source)) return "grill";
  if (/\b(baked|bake|casserole|bechamel)\b/.test(source)) return "bake";
  if (/\b(stew|soup|simmer|slow)\b/.test(source)) return "simmer";
  if (/\b(fried|fry|stir)\b/.test(source)) return "saute";
  if (/\b(stuffed)\b/.test(source)) return "stuff";
  return "cook";
}

function inferStyleTags(entry: CuisineCatalogV2Entry) {
  return Array.from(new Set([
    entry.kind,
    entry.authenticity.confidence,
    inferCookingMethod(entry),
    ...entry.mealTypes
  ]));
}

function titleCase(value: string) {
  return value
    .replace(/[_-]/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
