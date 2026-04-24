import { buildPreferenceProfile, type NutritionGoals } from "@/lib/preferences";

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
  allergens?: string[];
}

export interface MealPlanPromptOptions {
  pantry: string[];
  pantryItems?: { name: string; quantity?: string }[];
  diets: string[];
  conditions: string[];
  allergens?: string[];
  recipeLanguage?: string;
  preferredCuisine?: string;
  calorieTarget?: number;
}

export function buildRecipeGenerationPrompt(ingredients: RecipePromptIngredient[], options: RecipePromptOptions) {
  const cuisineHint = options.preferredCuisine === "Any" ? "Use any cuisine." : `Prefer ${options.preferredCuisine} cuisine.`;
  const preferenceBrief = buildPromptPreferenceBrief({
    preferredCuisine: options.preferredCuisine,
    calorieTarget: options.calorieTarget,
    diets: options.diets,
    conditions: options.conditions,
    allergens: options.allergens ?? []
  });
  const ingredientNames = ingredients.map((item) => item.name).filter(Boolean);
  const ingredientQuantities = ingredients
    .map((item) => [item.name, item.quantity].filter(Boolean).join(" - "))
    .filter(Boolean);
  const perMealCalories = Math.round(options.calorieTarget / 3);

  return [
    "You are NutriMoment's recipe generation assistant.",
    "Return ONLY valid JSON. Do not include markdown, prose, comments, or code fences.",
    "Generate exactly 5 practical recipes.",
    "Priority order: first satisfy diet rules and health-condition nutrition targets, second stay near the calorie target, third use available pantry ingredients and minimize missing items.",
    "Order the 5 recipes from best to worst by: most available pantry ingredients used, fewest missing ingredients, strongest dietary and health preference match, closest calorie target.",
    "Use clear, searchable meal names. Prefer canonical dish or meal-family names over creative marketing titles.",
    "Avoid filler adjectives like simple, hearty, lean, classic, spiced, vibrant, or loaded unless they are essential to distinguish the dish.",
    "When a recipe resembles a known dish family, use that family name in the title, for example: shakshuka, fasolia, ful medames, mujadara, koshary, kafta, white bean stew, bean salad, lentil soup, or chickpea salad.",
    "For every recipe also output image_search_indices: an array of 3 to 5 short English food-photo search phrases tuned for Unsplash and Pexels, ordered from most exact to broader backup searches.",
    "Each image_search_indices item should be 2 to 6 words, use canonical dish nouns first, add cuisine or protein only when it improves accuracy, and avoid quantities, health claims, macro words, filler adjectives, and branding.",
    "Also include image_search_index as the first/best string from image_search_indices for backward compatibility.",
    "Examples of good image_search_indices values: [\"mujadara\",\"lentils and rice\",\"middle eastern lentils rice\"], [\"white bean stew\",\"fasolia\",\"bean tomato stew\"], [\"greek yogurt berries\",\"yogurt bowl\",\"breakfast yogurt bowl\"].",
    "Do not use a pantry ingredient when it conflicts with the user's diet or health profile; choose a safer substitute and list it as a missing ingredient instead.",
    "The ingredients array must contain ONLY items explicitly listed in Available pantry ingredients. Any other ingredient, seasoning, garnish, sauce, or produce item must go in missing_ingredients.",
    `Available pantry ingredients: ${ingredientNames.join(", ") || "none provided"}.`,
    `Available ingredient quantities: ${ingredientQuantities.join(", ") || "not provided"}.`,
    preferenceBrief,
    cuisineHint,
    `Recipe language: ${options.recipeLanguage}.`,
    `Target calories per meal: approximately ${perMealCalories} kcal; keep each recipe within about 15% unless the health profile requires a tighter limit.`,
    `Maximum missing ingredients allowed per recipe: ${options.maxMissingIngredients}.`,
    "Missing ingredients must be compatible with the diet and health rules. Be strict: never put cucumber, herbs, spices, oil, sauces, or staple ingredients in ingredients unless they are in Available pantry ingredients.",
    "Avoid medical claims; describe meals as compatible with the stated profile, not as treatment.",
    "Return a JSON array, not an object.",
    "Each recipe object must include: name, cuisine, image_search_index, image_search_indices, ingredients, missing_ingredients, steps, calories, protein, carbs, fat, fiber, sugar, sodium, cook_time, difficulty, preference_hits.",
    "ingredients and missing_ingredients must be arrays of strings. steps must be an array of concise strings. preference_hits must name the diet, health, calorie, or pantry rules the recipe satisfies. image_search_index must be a single short English string and image_search_indices must be an array of 3 to 5 short English strings."
  ].join(" ");
}

export function buildMealPlanPrompt({
  pantry,
  pantryItems = [],
  diets,
  conditions,
  allergens = [],
  recipeLanguage = "English",
  preferredCuisine = "Any",
  calorieTarget = 2000
}: MealPlanPromptOptions) {
  const pantryWithQuantities = pantryItems
    .map((item) => [item.name, item.quantity].filter(Boolean).join(" - "))
    .filter(Boolean);
  const preferenceBrief = buildPromptPreferenceBrief({
    preferredCuisine,
    calorieTarget,
    diets,
    conditions,
    allergens
  });

  return [
    "You are NutriMoment's premium weekly meal planning assistant.",
    "Return ONLY valid JSON. Do not include markdown, prose, comments, or code fences.",
    "Generate a 7-day meal plan.",
    "Priority order: first satisfy diet rules and health-condition nutrition targets, second stay near the daily calorie target, third use pantry ingredients and minimize extra shopping.",
    "Use clear, searchable meal names. Prefer canonical dish or meal-family names over creative titles.",
    "Avoid filler adjectives like simple, hearty, lean, classic, spiced, or loaded unless they are essential.",
    "When a meal matches a known family, title it that way, for example: shakshuka, fasolia, ful medames, mujadara, koshary, kafta, white bean stew, bean salad, lentil soup, or chickpea salad.",
    "For every breakfast, lunch, and dinner object also output image_search_indices: an array of 3 to 5 short English food-photo search phrases tuned for Unsplash and Pexels, ordered from most exact to broader backup searches.",
    "Each image_search_indices item should be 2 to 6 words, use canonical dish nouns first, add cuisine or protein only when it improves accuracy, and avoid quantities, health claims, macro words, filler adjectives, and branding.",
    "Also include image_search_index as the first/best string from image_search_indices for backward compatibility.",
    "Examples of good image_search_indices values: [\"mujadara\",\"lentils and rice\",\"middle eastern lentils rice\"], [\"chicken shawarma bowl\",\"chicken shawarma\",\"shawarma plate\"], [\"baked white fish\",\"white fish vegetables\",\"roasted fish plate\"].",
    "Do not use a pantry ingredient when it conflicts with the user's diet or health profile; choose a safer substitute and include the substitute in shoppingList.",
    `Pantry items: ${pantry.join(", ") || "none provided"}.`,
    `Pantry quantities (use these to decide what is actually needed for the week): ${pantryWithQuantities.join(", ") || "not provided"}.`,
    preferenceBrief,
    `Preferred cuisine: ${preferredCuisine}.`,
    `Recipe language: ${recipeLanguage}.`,
    `Daily calorie target: ${calorieTarget}; make breakfast about 25%, lunch about 35%, and dinner about 40% of the target, with the day total within about 10% unless the health profile requires tighter limits.`,
    "Every meal must be compatible with the diet and health-condition targets, not just one meal per day.",
    "Avoid medical claims; describe meals as compatible with the stated profile, not as treatment.",
    "Return an object with exactly these top-level keys: plan, shoppingList.",
    "plan must be an array of 7 days.",
    "Each day must use this exact shape: {\"day\":\"Monday\",\"breakfast\":{\"name\":\"…\",\"ingredients\":[\"…\"],\"calories\":400,\"protein\":\"20g\",\"carbs\":\"45g\",\"fat\":\"12g\"},\"lunch\":{\"name\":\"…\",\"ingredients\":[\"…\"],\"calories\":550,\"protein\":\"30g\",\"carbs\":\"60g\",\"fat\":\"18g\"},\"dinner\":{\"name\":\"…\",\"ingredients\":[\"…\"],\"calories\":650,\"protein\":\"35g\",\"carbs\":\"55g\",\"fat\":\"22g\"}}.",
    "Each meal MUST include an ingredients array of short canonical lowercase names that lists every ingredient the meal uses, including pantry items the diner already owns. This is needed for shopping coverage display.",
    "Include image_search_index and image_search_indices inside every breakfast, lunch, and dinner object, for example: breakfast {\"name\":\"Greek Yogurt Bowl\",\"image_search_index\":\"greek yogurt berries\",\"image_search_indices\":[\"greek yogurt berries\",\"yogurt bowl\",\"breakfast yogurt bowl\"],...}.",
    "shoppingList must be an array of strings with only missing items needed after pantry ingredients are used.",
    "Every shoppingList item must include summed quantity and unit, for example: \"rice - 4 cup\" or \"tomato - 8 whole\"."
  ].join(" ");
}

function buildPromptPreferenceBrief(snapshot: {
  preferredCuisine: string;
  calorieTarget: number;
  diets: string[];
  conditions: string[];
  allergens: string[];
}) {
  const resolved = buildPreferenceProfile(snapshot);
  const dietLabels = resolved.promptDietLabels.length ? resolved.promptDietLabels.join(", ") : "none";
  const conditionLabels = resolved.promptConditionLabels.length ? resolved.promptConditionLabels.join(", ") : "none";
  const selectedDiets = snapshot.diets.length ? snapshot.diets.join(", ") : "none";
  const selectedConditions = snapshot.conditions.length ? snapshot.conditions.join(", ") : "none";
  const requiredDietTags = resolved.requiredDietTags.length ? resolved.requiredDietTags.join(", ") : "none";
  const preferredDietTags = resolved.preferredDietTags.length ? resolved.preferredDietTags.join(", ") : "none";
  const allergens = resolved.allergens?.length ? resolved.allergens.join(", ") : "none";
  const nutritionTargets = formatNutritionGoals(resolved.nutritionGoals);

  return [
    `Selected diet setting IDs: ${selectedDiets}.`,
    `Selected health condition setting IDs: ${selectedConditions}.`,
    `Dietary preferences: ${dietLabels}.`,
    `Health conditions to respect: ${conditionLabels}.`,
    `Required diet compatibility: ${requiredDietTags}.`,
    `Preferred diet compatibility: ${preferredDietTags}.`,
    `Known allergens to avoid: ${allergens}.`,
    `Nutrition targets derived from the profile: ${nutritionTargets}.`
  ].join(" ");
}

function formatNutritionGoals(goals: NutritionGoals) {
  const entries = [
    goals.minCalories ? `minimum calories ${goals.minCalories} kcal per meal` : "",
    goals.maxCalories ? `maximum calories ${goals.maxCalories} kcal per meal` : "",
    goals.minProtein ? `minimum protein ${goals.minProtein}g per meal` : "",
    goals.maxCarbs ? `maximum carbs ${goals.maxCarbs}g per meal` : "",
    goals.maxSugar ? `maximum sugar ${goals.maxSugar}g per meal` : "",
    goals.maxSodium ? `maximum sodium ${goals.maxSodium}mg per meal` : "",
    goals.minSodium ? `minimum sodium ${goals.minSodium}mg per meal` : "",
    goals.maxFat ? `maximum fat ${goals.maxFat}g per meal` : "",
    goals.minFiber ? `minimum fiber ${goals.minFiber}g per meal` : ""
  ].filter(Boolean);

  return entries.length ? entries.join("; ") : "standard balanced meals aligned to calorie target";
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
