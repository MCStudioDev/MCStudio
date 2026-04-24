import { cuisineMatchesPreference } from "@/lib/cuisines";

interface CuisineHeuristicProfile {
  dishNames: string[];
  breakfastDishNames?: string[];
  dinnerDishNames?: string[];
  breakfastSignals?: string[];
  dinnerSignals?: string[];
  triggerGroups?: Array<{ name: string; ingredients: string[] }>;
}

export interface CuisineScoreInput {
  preferredCuisine?: string;
  recipeCuisine?: string;
  recipeName?: string;
  mealType?: string;
  availableIngredients?: string[];
  recipeIngredients?: string[];
  missingIngredients?: string[];
}

export interface CuisineScoreResult {
  score: number;
  hits: string[];
}

const CUISINE_HEURISTICS: Record<string, CuisineHeuristicProfile> = {
  egyptian: {
    dishNames: ["kofta", "kafta", "hawawshi", "koshary", "shakshuka", "shakshouka", "taameya", "tameya", "ful", "fasolia", "molokhia", "eggah", "macarona bechamel"],
    breakfastDishNames: ["shakshuka", "shakshouka", "taameya", "tameya", "ful", "eggah"],
    dinnerDishNames: ["kofta", "kafta", "hawawshi", "koshary", "fasolia", "molokhia", "macarona bechamel"],
    breakfastSignals: ["egg", "tomato", "bell pepper", "fava bean", "bread", "pita", "cheese"],
    dinnerSignals: ["ground meat", "rice", "pasta", "lentil", "chicken"],
    triggerGroups: [
      { name: "kofta", ingredients: ["ground meat", "onion", "parsley"] },
      { name: "hawawshi", ingredients: ["ground meat", "bread"] },
      { name: "macarona bechamel", ingredients: ["ground meat", "pasta", "milk"] },
      { name: "koshary", ingredients: ["lentil", "rice", "pasta"] },
      { name: "taameya", ingredients: ["fava bean", "garlic", "parsley"] },
      { name: "shakshuka", ingredients: ["egg", "tomato", "bell pepper"] }
    ]
  },
  italian: {
    dishNames: ["pomodoro", "arrabbiata", "aglio e olio", "frittata", "risotto", "minestrone", "alfredo", "baked pasta", "chicken parmesan", "piccata"],
    breakfastDishNames: ["frittata"],
    dinnerDishNames: ["pomodoro", "arrabbiata", "risotto", "alfredo", "baked pasta", "piccata"],
    breakfastSignals: ["egg", "cheese", "tomato"],
    dinnerSignals: ["pasta", "tomato sauce", "parmesan", "mozzarella", "rice"],
    triggerGroups: [
      { name: "pomodoro", ingredients: ["pasta", "tomato"] },
      { name: "alfredo", ingredients: ["pasta", "milk"] },
      { name: "frittata", ingredients: ["egg", "cheese"] },
      { name: "risotto", ingredients: ["rice", "parmesan"] }
    ]
  },
  middleeastern: {
    dishNames: ["mujadara", "kofta", "kafta", "shawarma", "shakshuka", "hummus", "fattoush", "tabbouleh", "lentil soup", "fasolia"],
    breakfastDishNames: ["shakshuka", "hummus"],
    dinnerDishNames: ["mujadara", "kofta", "kafta", "shawarma", "fasolia"],
    breakfastSignals: ["egg", "chickpea", "fava bean", "bread"],
    dinnerSignals: ["lentil", "rice", "ground meat", "chicken"],
    triggerGroups: [
      { name: "mujadara", ingredients: ["lentil", "rice", "onion"] },
      { name: "hummus", ingredients: ["chickpea", "tahini"] },
      { name: "kofta", ingredients: ["ground meat", "parsley"] }
    ]
  },
  indian: {
    dishNames: ["dal", "chana masala", "rajma", "bhurji", "paneer", "keema", "pulao", "upma", "poha"],
    breakfastDishNames: ["bhurji", "upma", "poha", "omelette"],
    dinnerDishNames: ["dal", "chana masala", "rajma", "paneer", "keema", "pulao"],
    breakfastSignals: ["egg", "semolina", "flattened rice"],
    dinnerSignals: ["lentil", "chickpea", "kidney bean", "ground meat", "rice"],
    triggerGroups: [
      { name: "dal", ingredients: ["lentil", "cumin"] },
      { name: "chana masala", ingredients: ["chickpea", "tomato", "onion"] },
      { name: "keema", ingredients: ["ground meat", "peas"] }
    ]
  },
  thai: {
    dishNames: ["pad krapow", "basil chicken", "fried rice", "red curry", "green curry", "larb", "tom yum", "thai omelette"],
    breakfastDishNames: ["thai omelette"],
    dinnerDishNames: ["pad krapow", "fried rice", "red curry", "green curry", "larb", "tom yum"],
    breakfastSignals: ["egg", "rice"],
    dinnerSignals: ["rice noodle", "coconut milk", "basil", "fish sauce", "ground meat", "chicken"],
    triggerGroups: [
      { name: "pad krapow", ingredients: ["ground meat", "basil", "chili"] },
      { name: "red curry", ingredients: ["coconut milk", "chicken"] },
      { name: "thai noodle stir fry", ingredients: ["rice noodle", "egg"] }
    ]
  }
};

export function scoreCuisineFit(input: CuisineScoreInput): CuisineScoreResult {
  const preferredCuisine = input.preferredCuisine ?? "Any";
  if (!preferredCuisine || preferredCuisine === "Any") {
    return { score: 0, hits: [] };
  }

  const cuisineKey = normalizeCuisineKey(preferredCuisine);
  const profile = CUISINE_HEURISTICS[cuisineKey];
  if (!profile) {
    return {
      score: cuisineMatchesPreference(input.recipeCuisine ?? "", preferredCuisine) ? 2 : 0,
      hits: cuisineMatchesPreference(input.recipeCuisine ?? "", preferredCuisine) ? ["cuisine-aligned"] : []
    };
  }

  const scoreHits: string[] = [];
  let score = 0;
  const recipeName = normalizeText(input.recipeName ?? "");
  const allRecipeIngredients = [
    ...(input.recipeIngredients ?? []),
    ...(input.missingIngredients ?? [])
  ].map(normalizeText);
  const availableIngredients = (input.availableIngredients ?? []).map(normalizeText);

  if (cuisineMatchesPreference(input.recipeCuisine ?? "", preferredCuisine)) {
    score += 3;
    scoreHits.push("cuisine-aligned");
  }

  const matchedDishName = profile.dishNames.find((dish) => recipeName.includes(normalizeText(dish)));
  if (matchedDishName) {
    score += 5;
    scoreHits.push(`dish-family:${matchedDishName}`);
  }

  for (const trigger of profile.triggerGroups ?? []) {
    const matchedCount = trigger.ingredients.filter((ingredient) =>
      [...availableIngredients, ...allRecipeIngredients].some((value) => looselyMatchesIngredient(value, ingredient))
    ).length;

    if (matchedCount >= Math.max(2, trigger.ingredients.length - 1)) {
      score += 3;
      scoreHits.push(`ingredients-fit:${trigger.name}`);

      if (recipeName.includes(normalizeText(trigger.name))) {
        score += 2;
        scoreHits.push(`dish-trigger-match:${trigger.name}`);
      }
    }
  }

  const mealType = input.mealType ?? inferMealTypeFromIngredients(availableIngredients);
  if (mealType === "breakfast") {
    if ((profile.breakfastDishNames ?? []).some((dish) => recipeName.includes(normalizeText(dish)))) {
      score += 3;
      scoreHits.push("meal-type-fit:breakfast");
    } else if (countIngredientMatches(availableIngredients, profile.breakfastSignals ?? []) >= 2) {
      score += 1;
      scoreHits.push("meal-context:breakfast");
    }
  } else if (mealType === "lunch" || mealType === "dinner") {
    if ((profile.dinnerDishNames ?? []).some((dish) => recipeName.includes(normalizeText(dish)))) {
      score += 3;
      scoreHits.push("meal-type-fit:main");
    } else if (countIngredientMatches(availableIngredients, profile.dinnerSignals ?? []) >= 2) {
      score += 1;
      scoreHits.push("meal-context:main");
    }
  }

  return {
    score,
    hits: Array.from(new Set(scoreHits)).slice(0, 4)
  };
}

function inferMealTypeFromIngredients(ingredients: string[]) {
  const breakfastScore = countIngredientMatches(ingredients, ["egg", "fava bean", "bread", "cheese", "yogurt"]);
  const mainScore = countIngredientMatches(ingredients, ["ground meat", "chicken", "rice", "pasta", "lentil", "noodle"]);

  if (breakfastScore >= Math.max(2, mainScore + 1)) return "breakfast";
  if (mainScore >= 2) return "dinner";
  return undefined;
}

function countIngredientMatches(values: string[], candidates: string[]) {
  return candidates.reduce(
    (count, candidate) => count + (values.some((value) => looselyMatchesIngredient(value, candidate)) ? 1 : 0),
    0
  );
}

function looselyMatchesIngredient(value: string, candidate: string) {
  const normalizedCandidate = normalizeText(candidate);
  return (
    value === normalizedCandidate ||
    value.includes(normalizedCandidate) ||
    normalizedCandidate.includes(value)
  );
}

function normalizeCuisineKey(value: string) {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
