import { formatPreferencesForPrompt } from "@/lib/preferences";

export interface RecipePromptIngredient {
  name: string;
  quantity?: string;
}

export interface RecipePromptOptions {
  recipeLanguage: string;
  preferredCuisine: string;
  calorieTarget: number;
  maxMissingIngredients: number;
  diets: string[];
  conditions: string[];
}

export interface MealPlanPromptOptions {
  pantry: string[];
  diets: string[];
  conditions: string[];
  recipeLanguage?: string;
  preferredCuisine?: string;
  calorieTarget?: number;
}

export function buildRecipeGenerationPrompt(ingredients: RecipePromptIngredient[], options: RecipePromptOptions) {
  const cuisineHint = options.preferredCuisine === "Any" ? "Use any cuisine." : `Prefer ${options.preferredCuisine} cuisine.`;
  const preferenceLabels = formatPreferencesForPrompt(options.diets, options.conditions);
  const diets = preferenceLabels.diets.length ? preferenceLabels.diets.join(", ") : "none";
  const conditions = preferenceLabels.conditions.length ? preferenceLabels.conditions.join(", ") : "none";
  const ingredientNames = ingredients.map((item) => item.name).filter(Boolean);
  const ingredientQuantities = ingredients
    .map((item) => [item.name, item.quantity].filter(Boolean).join(" - "))
    .filter(Boolean);

  return [
    "You are NutriMoment's recipe generation assistant.",
    "Return ONLY valid JSON. Do not include markdown, prose, comments, or code fences.",
    `Generate exactly 3 practical recipes using these available ingredients: ${ingredientNames.join(", ") || "none provided"}.`,
    `Available ingredient quantities: ${ingredientQuantities.join(", ") || "not provided"}.`,
    cuisineHint,
    `Recipe language: ${options.recipeLanguage}.`,
    `Target calories per meal: approximately ${Math.round(options.calorieTarget / 3)} kcal.`,
    `Maximum missing ingredients allowed per recipe: ${options.maxMissingIngredients}.`,
    `Dietary preferences: ${diets}.`,
    `Health conditions to respect: ${conditions}.`,
    "Use pantry ingredients first. Missing ingredients must be optional or low-count.",
    "Return a JSON array, not an object.",
    "Each recipe object must include: name, cuisine, ingredients, missing_ingredients, steps, calories, protein, carbs, fat, fiber, sugar, sodium, cook_time, difficulty.",
    "ingredients and missing_ingredients must be arrays of strings. steps must be an array of concise strings."
  ].join(" ");
}

export function buildMealPlanPrompt({
  pantry,
  diets,
  conditions,
  recipeLanguage = "English",
  preferredCuisine = "Any",
  calorieTarget = 2000
}: MealPlanPromptOptions) {
  const preferenceLabels = formatPreferencesForPrompt(diets, conditions);

  return [
    "You are NutriMoment's premium weekly meal planning assistant.",
    "Return ONLY valid JSON. Do not include markdown, prose, comments, or code fences.",
    "Generate a 7-day meal plan using pantry ingredients first and minimizing extra shopping.",
    `Pantry items: ${pantry.join(", ") || "none provided"}.`,
    `Dietary preferences: ${preferenceLabels.diets.join(", ") || "none"}.`,
    `Health conditions to respect: ${preferenceLabels.conditions.join(", ") || "none"}.`,
    `Preferred cuisine: ${preferredCuisine}.`,
    `Recipe language: ${recipeLanguage}.`,
    `Daily calorie target: ${calorieTarget}.`,
    "Return an object with exactly these top-level keys: plan, shoppingList.",
    "plan must be an array of 7 days.",
    "Each day must use this exact shape: {\"day\":\"Monday\",\"breakfast\":{\"name\":\"...\",\"calories\":400,\"protein\":\"20g\",\"carbs\":\"45g\",\"fat\":\"12g\"},\"lunch\":{\"name\":\"...\",\"calories\":550,\"protein\":\"30g\",\"carbs\":\"60g\",\"fat\":\"18g\"},\"dinner\":{\"name\":\"...\",\"calories\":650,\"protein\":\"35g\",\"carbs\":\"55g\",\"fat\":\"22g\"}}.",
    "shoppingList must be an array of strings with only missing items needed after pantry ingredients are used.",
    "Every shoppingList item must include summed quantity and unit, for example: \"rice - 4 cup\" or \"tomato - 8 whole\"."
  ].join(" ");
}

export function buildIngredientVisionPrompt(language = "English") {
  return [
    "You are NutriMoment's food vision assistant.",
    "Analyze the image and identify raw food ingredients visible in it.",
    "Return ONLY valid JSON. Do not include markdown, prose, comments, or code fences.",
    "Use this exact format: {\"ingredients\":[\"ingredient1\",\"ingredient2\"]}.",
    "Only include actual food ingredients. Use short singular names. Return an empty array if no food items are visible.",
    `Use ${language}.`
  ].join(" ");
}

export function buildIngredientNameArrayVisionPrompt(language = "English", isPantry = false) {
  return [
    "You are NutriMoment's food vision assistant.",
    isPantry
      ? "Identify distinct grocery or pantry items visible in the image, including jars, cans, packaged goods, fresh produce, and staples."
      : "Identify the raw ingredients visible in the image.",
    "Return ONLY valid JSON. Do not include markdown, prose, comments, or code fences.",
    isPantry
      ? "Return a JSON array of short item names, for example: [\"olive oil\",\"rice\",\"canned tomatoes\"]."
      : "Return a JSON array of short singular ingredient names, for example: [\"tomato\",\"onion\",\"chicken breast\"].",
    `Use ${language}.`
  ].join(" ");
}

export function buildPantryInventoryVisionPrompt(language = "English") {
  return [
    "You are NutriMoment's pantry inventory assistant.",
    "Analyze the pantry or grocery image and identify visible food items with approximate quantities.",
    "Return ONLY valid JSON. Do not include markdown, prose, comments, or code fences.",
    "Use this exact format: {\"items\":[{\"name\":\"rice\",\"quantity\":\"1 bag\"},{\"name\":\"olive oil\",\"quantity\":\"1 bottle\"}]}",
    "Estimate quantity approximately using simple units like \"1 jar\", \"2 cans\", \"half bag\", \"1 bunch\", or \"1 carton\".",
    "Use short singular item names where possible. Only include food or pantry items that are reasonably visible. If uncertain, provide a cautious approximate quantity.",
    `Use ${language}.`
  ].join(" ");
}

export function buildRecipeImagePrompt(recipeName: string, cuisine?: string, ingredients: string[] = []) {
  return [
    "Create a realistic, appetizing plated food photo.",
    `Dish: ${recipeName}.`,
    cuisine ? `Cuisine: ${cuisine}.` : "",
    ingredients.length ? `Visible ingredients: ${ingredients.slice(0, 5).join(", ")}.` : "",
    "Natural lighting, clean plate, no text, no labels, no hands, no watermark."
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildFoodImagePrompt(description: string) {
  return [
    "Create a realistic, appetizing plated food photo from this description.",
    `Description: ${description}.`,
    "Natural lighting, clean plate, editorial food photography, no text, no labels, no hands, no watermark."
  ].join(" ");
}
