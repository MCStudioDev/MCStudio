import { cuisineMatchesPreference } from "@/lib/cuisines";
import { getCuisineDishCatalog } from "@/lib/cuisineDishCatalog";

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
    dishNames: getCuisineDishCatalog("egyptian")?.iconicDishes ?? ["kofta", "hawawshi", "koshary"],
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
    dishNames: getCuisineDishCatalog("italian")?.iconicDishes ?? ["pomodoro", "arrabbiata", "risotto"],
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
    dishNames: getCuisineDishCatalog("middle eastern")?.iconicDishes ?? ["mujadara", "shawarma", "hummus"],
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
    dishNames: getCuisineDishCatalog("indian")?.iconicDishes ?? ["dal", "chana masala", "rajma"],
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
    dishNames: getCuisineDishCatalog("thai")?.iconicDishes ?? ["pad krapow", "green curry", "tom yum"],
    breakfastDishNames: ["thai omelette"],
    dinnerDishNames: ["pad krapow", "fried rice", "red curry", "green curry", "larb", "tom yum"],
    breakfastSignals: ["egg", "rice"],
    dinnerSignals: ["rice noodle", "coconut milk", "basil", "fish sauce", "ground meat", "chicken"],
    triggerGroups: [
      { name: "pad krapow", ingredients: ["ground meat", "basil", "chili"] },
      { name: "red curry", ingredients: ["coconut milk", "chicken"] },
      { name: "thai noodle stir fry", ingredients: ["rice noodle", "egg"] }
    ]
  },
  mediterranean: {
    dishNames: getCuisineDishCatalog("mediterranean")?.iconicDishes ?? ["greek salad", "moussaka", "souvlaki"],
    breakfastDishNames: ["greek salad", "spanakopita", "shakshuka"],
    dinnerDishNames: ["moussaka", "souvlaki", "grilled sea bass", "ratatouille", "spanakopita"],
    breakfastSignals: ["egg", "tomato", "feta", "olive", "yogurt"],
    dinnerSignals: ["fish", "chickpea", "eggplant", "olive oil", "lemon", "lamb"],
    triggerGroups: [
      { name: "greek salad", ingredients: ["tomato", "cucumber", "feta"] },
      { name: "souvlaki", ingredients: ["chicken", "lemon", "oregano"] },
      { name: "ratatouille", ingredients: ["eggplant", "zucchini", "tomato"] }
    ]
  },
  mexican: {
    dishNames: getCuisineDishCatalog("mexican")?.iconicDishes ?? ["taco", "enchilada", "pozole"],
    breakfastDishNames: ["chilaquiles", "huevos rancheros", "huevos a la mexicana", "molletes"],
    dinnerDishNames: ["tacos al pastor", "birria", "enchiladas", "pozole", "mole poblano"],
    breakfastSignals: ["egg", "tortilla", "bean", "salsa"],
    dinnerSignals: ["corn tortilla", "chili", "tomato", "bean", "lime", "beef", "chicken"],
    triggerGroups: [
      { name: "chilaquiles", ingredients: ["tortilla", "salsa", "egg"] },
      { name: "enchiladas", ingredients: ["tortilla", "chicken", "salsa"] },
      { name: "quesadillas", ingredients: ["tortilla", "cheese"] }
    ]
  },
  american: {
    dishNames: getCuisineDishCatalog("american")?.iconicDishes ?? ["cheeseburger", "fried chicken", "chili"],
    breakfastDishNames: ["pancakes", "waffles", "eggs benedict", "biscuits and gravy", "breakfast hash"],
    dinnerDishNames: ["meatloaf", "pot roast", "barbecue ribs", "fried chicken", "chili"],
    breakfastSignals: ["egg", "bread", "potato", "sausage"],
    dinnerSignals: ["ground beef", "chicken", "potato", "barbecue sauce", "cheddar"],
    triggerGroups: [
      { name: "cheeseburger", ingredients: ["ground beef", "cheddar", "bread"] },
      { name: "meatloaf", ingredients: ["ground beef", "egg", "bread"] },
      { name: "fried chicken", ingredients: ["chicken", "flour"] }
    ]
  },
  asian: {
    dishNames: getCuisineDishCatalog("asian")?.iconicDishes ?? ["fried rice", "ramen", "bibimbap"],
    breakfastDishNames: ["congee", "onigiri", "miso soup"],
    dinnerDishNames: ["fried rice", "ramen", "bibimbap", "pho", "pad thai", "bulgogi"],
    breakfastSignals: ["egg", "rice", "broth"],
    dinnerSignals: ["rice", "noodle", "soy sauce", "ginger", "garlic", "tofu", "scallion"],
    triggerGroups: [
      { name: "fried rice", ingredients: ["rice", "egg", "soy sauce"] },
      { name: "stir fry", ingredients: ["soy sauce", "garlic", "ginger"] },
      { name: "noodle bowl", ingredients: ["noodle", "broth"] }
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
    const catalog = getCuisineDishCatalog(preferredCuisine);
    const fallbackDish = catalog?.iconicDishes.find((dish) => normalizeText(input.recipeName ?? "").includes(normalizeText(dish)));
    return {
      score: cuisineMatchesPreference(input.recipeCuisine ?? "", preferredCuisine) ? (fallbackDish ? 5 : 2) : 0,
      hits: cuisineMatchesPreference(input.recipeCuisine ?? "", preferredCuisine)
        ? fallbackDish
          ? ["cuisine-aligned", `dish-family:${fallbackDish}`]
          : ["cuisine-aligned"]
        : []
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
