import { normalizeCuisineLabel } from "@/lib/cuisines";
import { getCompleteCuisineCatalog } from "@/lib/cuisineCatalogs/completeCatalogs";
import type { CuisineDish, MealType } from "@/lib/cuisineCatalogs/types";
import { getCuisineDishCatalog } from "@/lib/cuisineDishCatalog";
import type { Recipe, RecipeDishIntent, RecipeMealType } from "@/lib/types";

type SupportedDiet =
  | "vegan"
  | "vegetarian"
  | "keto"
  | "gluten-free"
  | "dairy-free"
  | "high-protein"
  | "low-carb";

type SupportedCondition =
  | "diabetes"
  | "highBloodPressure"
  | "lowBloodPressure"
  | "weightLoss"
  | "weightGain"
  | "cholesterol";

export interface DishCandidate {
  anchorMatchCount: number;
  cookingMethod: string;
  cuisine: string;
  dishName: string;
  excludeKeywords: string[];
  hits: string[];
  ingredientAnchors: string[];
  mealType: RecipeMealType;
  seasoningProfile?: string[];
  searchPhrases?: string[];
  score: number;
  supportMatchCount: number;
  visualKeywords: string[];
}

interface DishBlueprint {
  cookingMethod: string;
  cuisine: string;
  dishName: string;
  dietTags?: SupportedDiet[];
  excludeKeywords: string[];
  healthStyles?: Array<"balanced" | "comfort" | "lighter" | "protein-forward" | "lower-sodium">;
  ingredientAnchors: string[];
  mealType: RecipeMealType;
  popularity: number;
  seasoningProfile?: string[];
  searchPhrases?: string[];
  supportAnchors?: string[];
  visualKeywords: string[];
}

interface DishCandidateContext {
  allergens?: string[];
  availableIngredients?: string[];
  calorieTarget?: number;
  conditions?: string[];
  diets?: string[];
  preferredCuisine?: string;
}

const DISH_BLUEPRINTS: DishBlueprint[] = [
  {
    dishName: "Hawawshi",
    cuisine: "Egyptian",
    mealType: "dinner",
    cookingMethod: "baked",
    ingredientAnchors: ["ground meat", "bread", "pita"],
    supportAnchors: ["onion", "garlic", "parsley", "tomato", "cumin", "coriander", "allspice"],
    visualKeywords: ["stuffed bread", "meat filled pita", "baked bread wedges"],
    excludeKeywords: ["dessert", "burger", "cookie"],
    healthStyles: ["comfort", "protein-forward"],
    popularity: 98,
    seasoningProfile: ["cumin", "coriander", "allspice", "black pepper", "parsley"],
    searchPhrases: ["hawawshi egyptian food", "hawawshi stuffed bread", "egyptian meat stuffed pita"]
  },
  {
    dishName: "Shakshuka",
    cuisine: "Egyptian",
    mealType: "breakfast",
    cookingMethod: "skillet",
    ingredientAnchors: ["egg", "tomato"],
    supportAnchors: ["onion", "bell pepper", "olive oil", "bread"],
    visualKeywords: ["eggs in tomato sauce", "tomato egg skillet", "shakshuka pan"],
    excludeKeywords: ["dessert", "burger", "pasta"],
    healthStyles: ["balanced", "protein-forward"],
    dietTags: ["vegetarian", "high-protein"],
    popularity: 92,
    searchPhrases: ["shakshuka egyptian breakfast", "egyptian tomato egg skillet", "shakshuka skillet eggs"]
  },
  {
    dishName: "Kofta",
    cuisine: "Egyptian",
    mealType: "dinner",
    cookingMethod: "grilled",
    ingredientAnchors: ["ground meat"],
    supportAnchors: ["onion", "parsley", "garlic", "cilantro", "rice", "tomato", "cumin", "coriander", "sumac"],
    visualKeywords: ["grilled kofta skewers", "kofta platter", "charred minced meat kebabs"],
    excludeKeywords: ["dessert", "meatballs pasta"],
    healthStyles: ["lighter", "protein-forward"],
    dietTags: ["high-protein", "low-carb"],
    popularity: 97,
    seasoningProfile: ["cumin", "coriander", "sumac", "parsley", "garlic"],
    searchPhrases: ["egyptian kofta grilled platter", "kofta kebab egyptian", "grilled kofta plate"]
  },
  {
    dishName: "Macarona Bechamel",
    cuisine: "Egyptian",
    mealType: "dinner",
    cookingMethod: "baked",
    ingredientAnchors: ["ground meat", "pasta"],
    supportAnchors: ["milk", "butter", "flour", "onion", "tomato sauce", "allspice", "nutmeg", "black pepper"],
    visualKeywords: ["baked pasta squares", "golden bechamel crust", "layered meat pasta bake"],
    excludeKeywords: ["lasagna", "dessert"],
    healthStyles: ["comfort"],
    popularity: 95,
    seasoningProfile: ["black pepper", "allspice", "nutmeg", "onion", "tomato sauce"],
    searchPhrases: ["macarona bechamel egyptian pasta bake", "egyptian bechamel pasta", "baked macarona bechamel"]
  },
  {
    dishName: "Mahshi Bell Peppers",
    cuisine: "Egyptian",
    mealType: "dinner",
    cookingMethod: "baked",
    ingredientAnchors: ["ground meat", "bell pepper"],
    supportAnchors: ["rice", "tomato", "onion", "parsley", "cinnamon", "cumin"],
    visualKeywords: ["stuffed bell peppers", "baked peppers with rice", "tomato baked mahshi"],
    excludeKeywords: ["salad", "dessert"],
    healthStyles: ["balanced"],
    popularity: 90,
    seasoningProfile: ["cinnamon", "cumin", "parsley", "black pepper", "tomato"],
    searchPhrases: ["mahshi bell peppers egyptian", "egyptian stuffed peppers", "stuffed peppers with meat"]
  },
  {
    dishName: "Egyptian Moussaka",
    cuisine: "Egyptian",
    mealType: "dinner",
    cookingMethod: "baked",
    ingredientAnchors: ["ground meat", "eggplant"],
    supportAnchors: ["tomato", "onion", "garlic", "cumin", "cinnamon"],
    visualKeywords: ["layered eggplant bake", "tomato eggplant casserole", "baked moussaka tray"],
    excludeKeywords: ["greek salad", "dessert"],
    healthStyles: ["balanced"],
    popularity: 91,
    seasoningProfile: ["cumin", "cinnamon", "garlic", "black pepper", "tomato"],
    searchPhrases: ["egyptian moussaka", "eggplant meat tomato bake", "egyptian baked eggplant"]
  },
  {
    dishName: "Shakshuka",
    cuisine: "Egyptian",
    mealType: "breakfast",
    cookingMethod: "skillet",
    ingredientAnchors: ["egg", "tomato"],
    supportAnchors: ["bell pepper", "onion", "garlic"],
    visualKeywords: ["eggs in tomato skillet", "breakfast egg skillet", "tomato poached eggs"],
    excludeKeywords: ["dessert", "salad"],
    healthStyles: ["lighter", "balanced"],
    dietTags: ["vegetarian", "gluten-free", "high-protein"],
    popularity: 88,
    searchPhrases: ["shakshuka egyptian breakfast", "eggs tomato skillet", "egyptian shakshuka"]
  },
  {
    dishName: "Taameya",
    cuisine: "Egyptian",
    mealType: "breakfast",
    cookingMethod: "fried",
    ingredientAnchors: ["fava bean"],
    supportAnchors: ["parsley", "cilantro", "onion", "garlic"],
    visualKeywords: ["green falafel patties", "taameya stack", "egyptian bean fritters"],
    excludeKeywords: ["chickpea falafel wrap", "dessert"],
    healthStyles: ["balanced", "protein-forward"],
    dietTags: ["vegan", "vegetarian", "dairy-free"],
    popularity: 89,
    searchPhrases: ["taameya egyptian falafel", "egyptian fava bean fritters", "taameya breakfast plate"]
  },
  {
    dishName: "Koshary",
    cuisine: "Egyptian",
    mealType: "dinner",
    cookingMethod: "assembled",
    ingredientAnchors: ["lentil", "rice", "pasta"],
    supportAnchors: ["tomato sauce", "chickpea", "fried onion"],
    visualKeywords: ["lentils rice pasta bowl", "crispy onion koshary", "tomato sauced koshary"],
    excludeKeywords: ["dessert", "plain pasta"],
    healthStyles: ["comfort", "balanced"],
    dietTags: ["vegetarian", "dairy-free"],
    popularity: 92,
    searchPhrases: ["koshary egyptian dish", "lentils rice pasta koshary", "egyptian koshary bowl"]
  },
  {
    dishName: "Ful Medames",
    cuisine: "Egyptian",
    mealType: "breakfast",
    cookingMethod: "stewed",
    ingredientAnchors: ["fava bean"],
    supportAnchors: ["lemon", "garlic", "cumin", "tomato"],
    visualKeywords: ["fava bean bowl", "ful breakfast plate", "stewed beans with olive oil"],
    excludeKeywords: ["dessert", "sweet beans"],
    healthStyles: ["balanced", "lower-sodium"],
    dietTags: ["vegan", "vegetarian", "dairy-free"],
    popularity: 86,
    searchPhrases: ["ful medames egyptian breakfast", "egyptian fava beans", "ful medames plate"]
  },
  {
    dishName: "Lentil Soup",
    cuisine: "Egyptian",
    mealType: "lunch",
    cookingMethod: "simmered",
    ingredientAnchors: ["lentil"],
    supportAnchors: ["carrot", "onion", "garlic", "cumin"],
    visualKeywords: ["golden lentil soup", "smooth lentil bowl", "egyptian lentil soup"],
    excludeKeywords: ["dessert", "salad"],
    healthStyles: ["lighter", "lower-sodium"],
    dietTags: ["vegan", "vegetarian", "dairy-free"],
    popularity: 80,
    searchPhrases: ["egyptian lentil soup", "red lentil soup bowl", "middle eastern lentil soup"]
  },
  {
    dishName: "Sayadeya",
    cuisine: "Egyptian",
    mealType: "dinner",
    cookingMethod: "simmered",
    ingredientAnchors: ["fish", "rice"],
    supportAnchors: ["onion", "tomato", "garlic", "cumin", "coriander"],
    visualKeywords: ["egyptian fish rice", "sayadeya fish plate", "spiced fish with rice"],
    excludeKeywords: ["dessert", "pasta", "beef"],
    healthStyles: ["balanced", "protein-forward"],
    dietTags: ["high-protein"],
    popularity: 87,
    seasoningProfile: ["cumin", "coriander", "garlic", "onion", "lemon"],
    searchPhrases: ["sayadeya egyptian fish rice", "egyptian fish rice", "spiced fish rice plate"]
  },
  {
    dishName: "Farakh Meshwi",
    cuisine: "Egyptian",
    mealType: "dinner",
    cookingMethod: "grilled",
    ingredientAnchors: ["chicken"],
    supportAnchors: ["garlic", "lemon", "onion", "cumin", "coriander", "paprika", "rice", "bread"],
    visualKeywords: ["egyptian grilled chicken", "charred butterflied chicken", "grilled chicken platter"],
    excludeKeywords: ["dessert", "pasta", "beef", "shrimp"],
    healthStyles: ["lighter", "protein-forward"],
    dietTags: ["gluten-free", "high-protein", "low-carb"],
    popularity: 92,
    seasoningProfile: ["garlic", "lemon", "cumin", "coriander", "paprika"],
    searchPhrases: ["egyptian grilled chicken", "farakh meshwi", "butterflied grilled chicken platter"]
  },
  {
    dishName: "Chicken Molokhia",
    cuisine: "Egyptian",
    mealType: "dinner",
    cookingMethod: "simmered",
    ingredientAnchors: ["chicken"],
    supportAnchors: ["molokhia", "garlic", "coriander", "rice", "lemon", "onion"],
    visualKeywords: ["green molokhia soup", "chicken molokhia with rice", "egyptian molokhia bowl"],
    excludeKeywords: ["dessert", "pasta", "beef", "shrimp"],
    healthStyles: ["balanced", "protein-forward"],
    dietTags: ["gluten-free", "high-protein"],
    popularity: 91,
    seasoningProfile: ["garlic", "coriander", "lemon", "onion"],
    searchPhrases: ["chicken molokhia egyptian", "molokhia with chicken and rice", "egyptian molokhia chicken"]
  },
  {
    dishName: "Chicken Fattah",
    cuisine: "Egyptian",
    mealType: "dinner",
    cookingMethod: "assembled",
    ingredientAnchors: ["chicken"],
    supportAnchors: ["rice", "bread", "garlic", "vinegar", "tomato sauce", "cumin"],
    visualKeywords: ["egyptian chicken fattah", "rice bread chicken platter", "garlic tomato fattah"],
    excludeKeywords: ["dessert", "pasta", "beef", "shrimp"],
    healthStyles: ["comfort", "protein-forward"],
    dietTags: ["high-protein"],
    popularity: 88,
    seasoningProfile: ["garlic", "vinegar", "cumin", "tomato sauce"],
    searchPhrases: ["egyptian chicken fattah", "chicken fattah rice bread", "fatta chicken egyptian"]
  },
  {
    dishName: "Chicken Negresco",
    cuisine: "Egyptian",
    mealType: "dinner",
    cookingMethod: "baked",
    ingredientAnchors: ["chicken", "pasta"],
    supportAnchors: ["milk", "butter", "flour", "cheese", "mushroom", "black pepper"],
    visualKeywords: ["egyptian chicken negresco pasta", "creamy baked chicken pasta", "golden white sauce pasta bake"],
    excludeKeywords: ["dessert", "red sauce", "beef", "shrimp"],
    healthStyles: ["comfort"],
    popularity: 86,
    seasoningProfile: ["black pepper", "nutmeg", "butter", "milk"],
    searchPhrases: ["chicken negresco egyptian", "egyptian chicken white sauce pasta", "baked chicken negresco"]
  },
  {
    dishName: "Taagen Kofta",
    cuisine: "Egyptian",
    mealType: "dinner",
    cookingMethod: "baked",
    ingredientAnchors: ["ground meat"],
    supportAnchors: ["tomato", "onion", "garlic", "potato", "cumin", "coriander", "rice"],
    visualKeywords: ["kofta in tomato sauce", "egyptian kofta tagine", "baked kofta tray"],
    excludeKeywords: ["dessert", "pasta", "burger"],
    healthStyles: ["balanced", "protein-forward"],
    dietTags: ["high-protein"],
    popularity: 90,
    seasoningProfile: ["cumin", "coriander", "garlic", "tomato", "parsley"],
    searchPhrases: ["taagen kofta egyptian", "egyptian kofta tomato sauce", "kofta tagine egyptian"]
  },
  {
    dishName: "Kebab Halla",
    cuisine: "Egyptian",
    mealType: "dinner",
    cookingMethod: "simmered",
    ingredientAnchors: ["beef"],
    supportAnchors: ["onion", "garlic", "pepper", "tomato", "cumin", "rice", "bread"],
    visualKeywords: ["egyptian beef stew", "kebab halla pot", "onion rich meat plate"],
    excludeKeywords: ["dessert", "pasta", "chicken", "shrimp"],
    healthStyles: ["comfort", "protein-forward"],
    dietTags: ["high-protein"],
    popularity: 89,
    seasoningProfile: ["onion", "garlic", "cumin", "black pepper"],
    searchPhrases: ["kebab halla egyptian", "egyptian beef stew", "egyptian meat tagine"]
  },
  {
    dishName: "Samak Singari",
    cuisine: "Egyptian",
    mealType: "dinner",
    cookingMethod: "baked",
    ingredientAnchors: ["fish"],
    supportAnchors: ["tomato", "bell pepper", "onion", "garlic", "lemon", "cumin", "coriander"],
    visualKeywords: ["egyptian baked fish", "stuffed butterflied fish", "samak singari platter"],
    excludeKeywords: ["dessert", "pasta", "beef", "chicken"],
    healthStyles: ["lighter", "protein-forward"],
    dietTags: ["gluten-free", "high-protein", "low-carb"],
    popularity: 88,
    seasoningProfile: ["garlic", "cumin", "coriander", "lemon", "bell pepper"],
    searchPhrases: ["samak singari egyptian", "egyptian baked fish", "butterflied baked fish egyptian"]
  },
  {
    dishName: "Egyptian Fish Tagine",
    cuisine: "Egyptian",
    mealType: "dinner",
    cookingMethod: "simmered",
    ingredientAnchors: ["fish"],
    supportAnchors: ["tomato", "onion", "garlic", "cumin", "coriander", "lemon", "rice"],
    visualKeywords: ["egyptian fish tagine", "tomato fish stew", "spiced fish with sauce"],
    excludeKeywords: ["dessert", "pasta", "beef", "chicken"],
    healthStyles: ["balanced", "protein-forward"],
    dietTags: ["gluten-free", "high-protein"],
    popularity: 86,
    seasoningProfile: ["cumin", "coriander", "garlic", "lemon", "tomato"],
    searchPhrases: ["egyptian fish tagine", "egyptian fish stew", "fish tagine egyptian"]
  },
  {
    dishName: "Alexandrian Shrimp",
    cuisine: "Egyptian",
    mealType: "dinner",
    cookingMethod: "skillet",
    ingredientAnchors: ["shrimp"],
    supportAnchors: ["garlic", "cumin", "coriander", "lemon", "chili", "tomato", "rice"],
    visualKeywords: ["alexandrian shrimp", "egyptian spiced shrimp", "garlic cumin shrimp skillet"],
    excludeKeywords: ["dessert", "pasta", "beef", "chicken"],
    healthStyles: ["lighter", "protein-forward"],
    dietTags: ["gluten-free", "high-protein", "low-carb"],
    popularity: 87,
    seasoningProfile: ["garlic", "cumin", "coriander", "lemon", "chili"],
    searchPhrases: ["alexandrian shrimp", "egyptian shrimp skillet", "garlic cumin shrimp egyptian"]
  },
  {
    dishName: "Seafood Sayadeya",
    cuisine: "Egyptian",
    mealType: "dinner",
    cookingMethod: "simmered",
    ingredientAnchors: ["shrimp"],
    supportAnchors: ["rice", "fish", "onion", "tomato", "garlic", "cumin", "coriander"],
    visualKeywords: ["seafood sayadeya rice", "egyptian seafood rice", "spiced shrimp rice plate"],
    excludeKeywords: ["dessert", "pasta", "beef", "chicken"],
    healthStyles: ["balanced", "protein-forward"],
    dietTags: ["high-protein"],
    popularity: 84,
    seasoningProfile: ["cumin", "coriander", "garlic", "onion", "lemon"],
    searchPhrases: ["seafood sayadeya egyptian", "egyptian seafood rice", "shrimp sayadeya rice"]
  },
  {
    dishName: "Pasta al Pomodoro",
    cuisine: "Italian",
    mealType: "dinner",
    cookingMethod: "boiled",
    ingredientAnchors: ["pasta", "tomato"],
    supportAnchors: ["garlic", "olive oil", "basil"],
    visualKeywords: ["red sauce pasta", "tomato basil pasta", "pomodoro spaghetti"],
    excludeKeywords: ["dessert", "white sauce"],
    healthStyles: ["balanced"],
    dietTags: ["vegetarian"],
    popularity: 90
  },
  {
    dishName: "Arrabbiata",
    cuisine: "Italian",
    mealType: "dinner",
    cookingMethod: "boiled",
    ingredientAnchors: ["pasta", "tomato"],
    supportAnchors: ["garlic", "chili", "olive oil"],
    visualKeywords: ["spicy red pasta", "arrabbiata penne", "tomato chili pasta"],
    excludeKeywords: ["dessert", "cream sauce"],
    healthStyles: ["balanced"],
    dietTags: ["vegetarian"],
    popularity: 84
  },
  {
    dishName: "Frittata",
    cuisine: "Italian",
    mealType: "breakfast",
    cookingMethod: "skillet",
    ingredientAnchors: ["egg"],
    supportAnchors: ["cheese", "spinach", "tomato", "onion"],
    visualKeywords: ["slice of frittata", "egg skillet pie", "italian omelette"],
    excludeKeywords: ["dessert", "pancake"],
    healthStyles: ["lighter", "protein-forward"],
    dietTags: ["vegetarian", "gluten-free", "high-protein"],
    popularity: 82
  },
  {
    dishName: "Chicken Piccata",
    cuisine: "Italian",
    mealType: "dinner",
    cookingMethod: "pan-seared",
    ingredientAnchors: ["chicken"],
    supportAnchors: ["lemon", "butter", "caper"],
    visualKeywords: ["lemon chicken cutlets", "piccata chicken plate", "pan seared chicken lemon sauce"],
    excludeKeywords: ["dessert", "red sauce"],
    healthStyles: ["lighter", "protein-forward"],
    dietTags: ["high-protein"],
    popularity: 78
  },
  {
    dishName: "Shrimp Linguine",
    cuisine: "Italian",
    mealType: "dinner",
    cookingMethod: "pan-seared",
    ingredientAnchors: ["shrimp", "pasta"],
    supportAnchors: ["garlic", "lemon", "parsley", "olive oil"],
    visualKeywords: ["shrimp linguine", "garlic shrimp spaghetti", "italian shrimp pasta"],
    excludeKeywords: ["dessert", "beef", "fried chicken"],
    healthStyles: ["balanced", "protein-forward"],
    dietTags: ["high-protein"],
    popularity: 83,
    seasoningProfile: ["garlic", "lemon zest", "parsley", "black pepper", "olive oil"],
    searchPhrases: ["shrimp linguine", "garlic shrimp spaghetti", "italian shrimp pasta"]
  },
  {
    dishName: "Minestrone",
    cuisine: "Italian",
    mealType: "lunch",
    cookingMethod: "simmered",
    ingredientAnchors: ["bean", "tomato"],
    supportAnchors: ["pasta", "carrot", "celery", "zucchini"],
    visualKeywords: ["vegetable bean soup", "minestrone bowl", "italian tomato soup"],
    excludeKeywords: ["dessert"],
    healthStyles: ["lighter", "balanced"],
    dietTags: ["vegan", "vegetarian", "dairy-free"],
    popularity: 75
  },
  {
    dishName: "Mujadara",
    cuisine: "Middle Eastern",
    mealType: "dinner",
    cookingMethod: "stewed",
    ingredientAnchors: ["lentil", "rice"],
    supportAnchors: ["onion", "olive oil", "cumin"],
    visualKeywords: ["lentils and rice", "crispy onion mujadara", "middle eastern rice lentils"],
    excludeKeywords: ["dessert", "plain rice"],
    healthStyles: ["balanced", "lower-sodium"],
    dietTags: ["vegan", "vegetarian", "dairy-free"],
    popularity: 89
  },
  {
    dishName: "Kofta Kebab",
    cuisine: "Middle Eastern",
    mealType: "dinner",
    cookingMethod: "grilled",
    ingredientAnchors: ["ground meat"],
    supportAnchors: ["parsley", "onion", "garlic", "cumin", "allspice", "sumac"],
    visualKeywords: ["grilled kofta skewers", "middle eastern kebab plate", "charred minced meat kebabs"],
    excludeKeywords: ["dessert", "meatballs pasta"],
    healthStyles: ["lighter", "protein-forward"],
    dietTags: ["high-protein", "low-carb"],
    popularity: 90,
    seasoningProfile: ["cumin", "allspice", "sumac", "parsley", "garlic"]
  },
  {
    dishName: "Shawarma Plate",
    cuisine: "Middle Eastern",
    mealType: "dinner",
    cookingMethod: "roasted",
    ingredientAnchors: ["chicken"],
    supportAnchors: ["garlic", "yogurt", "lemon", "pita"],
    visualKeywords: ["shawarma slices plate", "garlic sauce shawarma", "middle eastern chicken platter"],
    excludeKeywords: ["dessert", "burger"],
    healthStyles: ["protein-forward"],
    dietTags: ["high-protein"],
    popularity: 85
  },
  {
    dishName: "Mediterranean Stuffed Eggplant",
    cuisine: "Mediterranean",
    mealType: "dinner",
    cookingMethod: "baked",
    ingredientAnchors: ["eggplant"],
    supportAnchors: ["ground meat", "tomato", "olive oil", "onion"],
    visualKeywords: ["stuffed eggplant halves", "baked eggplant boat", "tomato baked eggplant"],
    excludeKeywords: ["dessert", "salad"],
    healthStyles: ["balanced"],
    popularity: 76
  },
  {
    dishName: "Greek Salad",
    cuisine: "Mediterranean",
    mealType: "lunch",
    cookingMethod: "assembled",
    ingredientAnchors: ["tomato", "cucumber"],
    supportAnchors: ["feta", "olive", "olive oil"],
    visualKeywords: ["greek salad bowl", "feta tomato cucumber salad", "mediterranean chopped salad"],
    excludeKeywords: ["dessert", "pasta"],
    healthStyles: ["lighter", "lower-sodium"],
    dietTags: ["vegetarian", "gluten-free"],
    popularity: 80
  },
  {
    dishName: "Grilled Lemon Herb Chicken",
    cuisine: "Mediterranean",
    mealType: "dinner",
    cookingMethod: "grilled",
    ingredientAnchors: ["chicken"],
    supportAnchors: ["lemon", "olive oil", "oregano", "garlic"],
    visualKeywords: ["grilled chicken platter", "lemon herb chicken", "mediterranean grilled chicken"],
    excludeKeywords: ["dessert", "fried chicken"],
    healthStyles: ["lighter", "protein-forward", "lower-sodium"],
    dietTags: ["high-protein", "gluten-free", "low-carb"],
    popularity: 82
  },
  {
    dishName: "Baked White Fish",
    cuisine: "Mediterranean",
    mealType: "dinner",
    cookingMethod: "baked",
    ingredientAnchors: ["fish"],
    supportAnchors: ["lemon", "olive oil", "tomato", "herbs"],
    visualKeywords: ["baked fish fillet", "white fish vegetables", "mediterranean fish plate"],
    excludeKeywords: ["dessert", "beef"],
    healthStyles: ["lighter", "protein-forward", "lower-sodium"],
    dietTags: ["high-protein", "gluten-free", "low-carb"],
    popularity: 80
  },
  {
    dishName: "Garlic Shrimp Pasta",
    cuisine: "Mediterranean",
    mealType: "dinner",
    cookingMethod: "pan-seared",
    ingredientAnchors: ["shrimp", "pasta"],
    supportAnchors: ["garlic", "olive oil", "lemon", "parsley"],
    visualKeywords: ["shrimp linguine", "garlic shrimp pasta", "lemon shrimp spaghetti"],
    excludeKeywords: ["dessert", "beef", "fried chicken"],
    healthStyles: ["balanced", "protein-forward"],
    dietTags: ["high-protein"],
    popularity: 84,
    seasoningProfile: ["garlic", "lemon zest", "parsley", "black pepper", "olive oil"],
    searchPhrases: ["shrimp linguine mediterranean", "garlic shrimp pasta", "lemon shrimp spaghetti"]
  },
  {
    dishName: "Dal Tadka",
    cuisine: "Indian",
    mealType: "dinner",
    cookingMethod: "simmered",
    ingredientAnchors: ["lentil"],
    supportAnchors: ["onion", "tomato", "garlic", "ginger", "cumin"],
    visualKeywords: ["dal bowl", "yellow lentil curry", "indian lentil stew"],
    excludeKeywords: ["dessert", "plain soup"],
    healthStyles: ["balanced", "lower-sodium"],
    dietTags: ["vegan", "vegetarian", "dairy-free"],
    popularity: 92
  },
  {
    dishName: "Chana Masala",
    cuisine: "Indian",
    mealType: "dinner",
    cookingMethod: "simmered",
    ingredientAnchors: ["chickpea"],
    supportAnchors: ["tomato", "onion", "garlic", "ginger"],
    visualKeywords: ["chickpea curry bowl", "chana masala", "indian chickpea stew"],
    excludeKeywords: ["dessert", "salad"],
    healthStyles: ["balanced", "protein-forward"],
    dietTags: ["vegan", "vegetarian", "dairy-free"],
    popularity: 89
  },
  {
    dishName: "Keema Matar",
    cuisine: "Indian",
    mealType: "dinner",
    cookingMethod: "simmered",
    ingredientAnchors: ["ground meat"],
    supportAnchors: ["pea", "tomato", "onion", "garlic", "ginger", "garam masala", "cumin", "turmeric"],
    visualKeywords: ["spiced minced meat curry", "keema bowl", "ground meat masala"],
    excludeKeywords: ["dessert", "burger"],
    healthStyles: ["protein-forward"],
    dietTags: ["high-protein", "low-carb"],
    popularity: 85,
    seasoningProfile: ["garam masala", "cumin", "turmeric", "ginger", "cilantro"]
  },
  {
    dishName: "Fish Curry",
    cuisine: "Indian",
    mealType: "dinner",
    cookingMethod: "simmered",
    ingredientAnchors: ["fish"],
    supportAnchors: ["tomato", "onion", "garlic", "ginger", "turmeric", "cumin"],
    visualKeywords: ["indian fish curry", "fish curry rice", "spiced fish gravy"],
    excludeKeywords: ["dessert", "pasta", "cream pasta"],
    healthStyles: ["balanced", "protein-forward"],
    dietTags: ["high-protein"],
    popularity: 82,
    seasoningProfile: ["turmeric", "cumin", "coriander", "ginger", "cilantro"],
    searchPhrases: ["indian fish curry", "fish curry with rice", "spiced fish gravy"]
  },
  {
    dishName: "Turkish Kofte",
    cuisine: "Turkish",
    mealType: "dinner",
    cookingMethod: "grilled",
    ingredientAnchors: ["ground meat"],
    supportAnchors: ["onion", "garlic", "parsley", "bread crumb", "sumac", "cumin"],
    visualKeywords: ["turkish kofte meatballs", "grilled kofte platter", "turkish meatball kebabs"],
    excludeKeywords: ["dessert", "meatballs pasta"],
    healthStyles: ["lighter", "protein-forward"],
    dietTags: ["high-protein", "low-carb"],
    popularity: 91,
    seasoningProfile: ["cumin", "sumac", "paprika", "aleppo pepper", "parsley"],
    searchPhrases: ["turkish kofte", "izgara kofte", "turkish meatballs platter"]
  },
  {
    dishName: "Karniyarik",
    cuisine: "Turkish",
    mealType: "dinner",
    cookingMethod: "baked",
    ingredientAnchors: ["eggplant", "ground meat"],
    supportAnchors: ["tomato", "onion", "garlic", "parsley", "cumin"],
    visualKeywords: ["stuffed eggplant halves", "turkish eggplant meat bake", "karniyarik tray"],
    excludeKeywords: ["dessert", "salad"],
    healthStyles: ["balanced"],
    popularity: 84,
    seasoningProfile: ["cumin", "paprika", "parsley", "black pepper", "tomato paste"],
    searchPhrases: ["karniyarik turkish food", "turkish stuffed eggplant", "eggplant minced meat bake"]
  },
  {
    dishName: "Adana Kebab",
    cuisine: "Turkish",
    mealType: "dinner",
    cookingMethod: "grilled",
    ingredientAnchors: ["ground meat"],
    supportAnchors: ["pepper paste", "paprika", "onion", "parsley", "cumin"],
    visualKeywords: ["adana kebab skewers", "turkish minced meat kebab", "grilled kebab platter"],
    excludeKeywords: ["dessert", "burger"],
    healthStyles: ["protein-forward"],
    dietTags: ["high-protein", "low-carb"],
    popularity: 88,
    seasoningProfile: ["paprika", "aleppo pepper", "cumin", "sumac", "parsley"],
    searchPhrases: ["adana kebab", "turkish kebab skewers", "spicy minced meat kebab"]
  },
  {
    dishName: "Menemen",
    cuisine: "Turkish",
    mealType: "breakfast",
    cookingMethod: "skillet",
    ingredientAnchors: ["egg", "tomato"],
    supportAnchors: ["bell pepper", "onion", "butter", "aleppo pepper"],
    visualKeywords: ["menemen pan", "turkish tomato eggs", "soft scrambled eggs with tomato"],
    excludeKeywords: ["dessert", "pancake"],
    healthStyles: ["balanced", "protein-forward"],
    dietTags: ["vegetarian", "high-protein"],
    popularity: 87,
    seasoningProfile: ["aleppo pepper", "black pepper", "butter", "tomato", "parsley"],
    searchPhrases: ["menemen turkish breakfast", "turkish tomato eggs", "menemen skillet"]
  },
  {
    dishName: "Cilbir",
    cuisine: "Turkish",
    mealType: "breakfast",
    cookingMethod: "assembled",
    ingredientAnchors: ["egg", "yogurt"],
    supportAnchors: ["garlic", "butter", "aleppo pepper", "dill", "bread"],
    visualKeywords: ["poached eggs over yogurt", "turkish yogurt eggs", "cilbir breakfast bowl"],
    excludeKeywords: ["dessert", "berry yogurt bowl", "oatmeal", "pancake"],
    healthStyles: ["balanced", "protein-forward", "lighter"],
    dietTags: ["vegetarian", "gluten-free", "high-protein"],
    popularity: 85,
    seasoningProfile: ["garlic", "aleppo pepper", "butter", "dill", "black pepper"],
    searchPhrases: ["cilbir turkish breakfast", "turkish poached eggs yogurt", "eggs with garlic yogurt"]
  },
  {
    dishName: "Balik Ekmek",
    cuisine: "Turkish",
    mealType: "lunch",
    cookingMethod: "grilled",
    ingredientAnchors: ["fish", "bread"],
    supportAnchors: ["onion", "lemon", "parsley", "tomato"],
    visualKeywords: ["turkish fish sandwich", "balik ekmek", "grilled fish in bread"],
    excludeKeywords: ["dessert", "burger beef", "pasta"],
    healthStyles: ["lighter", "protein-forward"],
    dietTags: ["high-protein"],
    popularity: 80,
    seasoningProfile: ["lemon", "parsley", "sumac", "black pepper", "olive oil"],
    searchPhrases: ["balik ekmek", "turkish fish sandwich", "grilled fish in bread"]
  },
  {
    dishName: "Masala Omelette",
    cuisine: "Indian",
    mealType: "breakfast",
    cookingMethod: "skillet",
    ingredientAnchors: ["egg"],
    supportAnchors: ["onion", "tomato", "chili", "cilantro"],
    visualKeywords: ["indian omelette", "spiced egg skillet", "masala omelette plate"],
    excludeKeywords: ["dessert", "pancake"],
    healthStyles: ["lighter", "protein-forward"],
    dietTags: ["vegetarian", "gluten-free", "high-protein"],
    popularity: 76
  },
  {
    dishName: "Huevos Rancheros",
    cuisine: "Mexican",
    mealType: "breakfast",
    cookingMethod: "assembled",
    ingredientAnchors: ["egg", "tortilla"],
    supportAnchors: ["salsa", "tomato", "bean", "cilantro"],
    visualKeywords: ["eggs on tortillas", "mexican breakfast plate", "rancheros salsa eggs"],
    excludeKeywords: ["dessert", "pancake"],
    healthStyles: ["balanced", "protein-forward"],
    popularity: 82
  },
  {
    dishName: "Quesadillas",
    cuisine: "Mexican",
    mealType: "lunch",
    cookingMethod: "griddled",
    ingredientAnchors: ["tortilla", "cheese"],
    supportAnchors: ["chicken", "bean", "onion"],
    visualKeywords: ["toasted quesadilla wedges", "mexican cheese tortilla", "quesadilla plate"],
    excludeKeywords: ["dessert", "pita"],
    healthStyles: ["balanced"],
    popularity: 84
  },
  {
    dishName: "Arroz con Pollo",
    cuisine: "Mexican",
    mealType: "dinner",
    cookingMethod: "simmered",
    ingredientAnchors: ["chicken", "rice"],
    supportAnchors: ["tomato", "onion", "pepper"],
    visualKeywords: ["mexican chicken rice", "tomato rice chicken skillet", "arroz con pollo"],
    excludeKeywords: ["dessert", "pasta"],
    healthStyles: ["balanced", "protein-forward"],
    popularity: 81
  },
  {
    dishName: "Camarones al Ajo",
    cuisine: "Mexican",
    mealType: "dinner",
    cookingMethod: "pan-seared",
    ingredientAnchors: ["shrimp"],
    supportAnchors: ["garlic", "lime", "butter", "rice", "cilantro"],
    visualKeywords: ["garlic shrimp plate", "mexican garlic shrimp", "shrimp rice platter"],
    excludeKeywords: ["dessert", "pasta alfredo"],
    healthStyles: ["protein-forward", "balanced"],
    dietTags: ["high-protein", "gluten-free"],
    popularity: 79,
    seasoningProfile: ["garlic", "lime", "cilantro", "paprika", "butter"],
    searchPhrases: ["camarones al ajo", "mexican garlic shrimp", "garlic shrimp rice plate"]
  },
  {
    dishName: "Breakfast Hash",
    cuisine: "American",
    mealType: "breakfast",
    cookingMethod: "skillet",
    ingredientAnchors: ["potato", "egg"],
    supportAnchors: ["onion", "cheese", "pepper"],
    visualKeywords: ["potato egg skillet", "american breakfast hash", "crispy breakfast potatoes"],
    excludeKeywords: ["dessert", "salad"],
    healthStyles: ["balanced"],
    popularity: 78
  },
  {
    dishName: "Meatloaf",
    cuisine: "American",
    mealType: "dinner",
    cookingMethod: "baked",
    ingredientAnchors: ["ground meat"],
    supportAnchors: ["egg", "bread", "onion"],
    visualKeywords: ["meatloaf slices", "american baked meatloaf", "glazed meatloaf plate"],
    excludeKeywords: ["dessert", "burger"],
    healthStyles: ["comfort", "protein-forward"],
    popularity: 74
  },
  {
    dishName: "Chili",
    cuisine: "American",
    mealType: "dinner",
    cookingMethod: "simmered",
    ingredientAnchors: ["ground meat", "bean"],
    supportAnchors: ["tomato", "onion", "pepper"],
    visualKeywords: ["chili bowl", "beef bean chili", "tomato chili stew"],
    excludeKeywords: ["dessert", "soup noodles"],
    healthStyles: ["balanced", "protein-forward"],
    popularity: 82
  },
  {
    dishName: "Fried Rice",
    cuisine: "Asian",
    mealType: "dinner",
    cookingMethod: "stir-fried",
    ingredientAnchors: ["rice"],
    supportAnchors: ["egg", "soy sauce", "scallion", "chicken", "shrimp"],
    visualKeywords: ["fried rice bowl", "egg fried rice", "asian rice stir fry"],
    excludeKeywords: ["dessert", "plain rice"],
    healthStyles: ["balanced"],
    popularity: 88
  },
  {
    dishName: "Noodle Stir Fry",
    cuisine: "Asian",
    mealType: "dinner",
    cookingMethod: "stir-fried",
    ingredientAnchors: ["noodle"],
    supportAnchors: ["soy sauce", "garlic", "ginger", "chicken", "vegetable"],
    visualKeywords: ["stir fried noodles", "asian noodle bowl", "saucy noodle stir fry"],
    excludeKeywords: ["dessert", "soup"],
    healthStyles: ["balanced"],
    popularity: 83
  },
  {
    dishName: "Garlic Honey Shrimp",
    cuisine: "Asian",
    mealType: "dinner",
    cookingMethod: "stir-fried",
    ingredientAnchors: ["shrimp"],
    supportAnchors: ["garlic", "honey", "soy sauce", "rice"],
    visualKeywords: ["garlic honey shrimp", "sticky shrimp rice", "asian glazed shrimp plate"],
    excludeKeywords: ["dessert", "pasta", "beef stew"],
    healthStyles: ["protein-forward", "balanced"],
    dietTags: ["high-protein"],
    popularity: 85,
    seasoningProfile: ["garlic", "soy sauce", "honey", "ginger", "scallion"],
    searchPhrases: ["garlic honey shrimp", "asian glazed shrimp", "shrimp rice plate"]
  },
  {
    dishName: "Teriyaki Chicken",
    cuisine: "Asian",
    mealType: "dinner",
    cookingMethod: "pan-seared",
    ingredientAnchors: ["chicken"],
    supportAnchors: ["soy sauce", "ginger", "garlic", "rice"],
    visualKeywords: ["glazed chicken rice", "teriyaki chicken plate", "asian grilled chicken"],
    excludeKeywords: ["dessert", "beef"],
    healthStyles: ["protein-forward"],
    popularity: 77
  },
  {
    dishName: "Pad Krapow",
    cuisine: "Thai",
    mealType: "dinner",
    cookingMethod: "stir-fried",
    ingredientAnchors: ["ground meat", "basil"],
    supportAnchors: ["chili", "garlic", "rice"],
    visualKeywords: ["thai basil beef", "pad krapow rice", "spicy basil stir fry"],
    excludeKeywords: ["dessert", "pasta"],
    healthStyles: ["protein-forward"],
    dietTags: ["high-protein", "low-carb"],
    popularity: 90,
    searchPhrases: ["pad krapow thai food", "thai basil beef rice", "thai basil stir fry"]
  },
  {
    dishName: "Thai Omelette",
    cuisine: "Thai",
    mealType: "breakfast",
    cookingMethod: "fried",
    ingredientAnchors: ["egg"],
    supportAnchors: ["fish sauce", "rice", "scallion"],
    visualKeywords: ["crispy thai omelette", "kai jeow", "thai egg over rice"],
    excludeKeywords: ["dessert", "pancake"],
    healthStyles: ["protein-forward"],
    dietTags: ["gluten-free", "high-protein"],
    popularity: 72
  },
  {
    dishName: "Green Curry",
    cuisine: "Thai",
    mealType: "dinner",
    cookingMethod: "simmered",
    ingredientAnchors: ["coconut milk"],
    supportAnchors: ["chicken", "vegetable", "basil", "chili"],
    visualKeywords: ["green curry bowl", "thai coconut curry", "green curry rice"],
    excludeKeywords: ["dessert", "soup"],
    healthStyles: ["balanced"],
    popularity: 80
  },
  {
    dishName: "Tom Yum Shrimp",
    cuisine: "Thai",
    mealType: "lunch",
    cookingMethod: "simmered",
    ingredientAnchors: ["shrimp"],
    supportAnchors: ["lemongrass", "lime", "chili", "fish sauce", "mushroom"],
    visualKeywords: ["tom yum shrimp soup", "thai shrimp soup", "hot sour shrimp broth"],
    excludeKeywords: ["dessert", "cream pasta"],
    healthStyles: ["lighter", "protein-forward"],
    dietTags: ["gluten-free", "high-protein"],
    popularity: 86,
    seasoningProfile: ["lemongrass", "lime", "fish sauce", "chili", "cilantro"],
    searchPhrases: ["tom yum goong", "thai shrimp soup", "hot sour shrimp broth"]
  },
  {
    dishName: "Thai Garlic Shrimp",
    cuisine: "Thai",
    mealType: "dinner",
    cookingMethod: "stir-fried",
    ingredientAnchors: ["shrimp"],
    supportAnchors: ["garlic", "rice", "fish sauce", "pepper", "cilantro"],
    visualKeywords: ["thai garlic shrimp", "garlic shrimp rice plate", "stir fried shrimp with rice"],
    excludeKeywords: ["dessert", "pasta", "beef stew"],
    healthStyles: ["protein-forward", "balanced"],
    dietTags: ["gluten-free", "high-protein"],
    popularity: 81,
    seasoningProfile: ["garlic", "white pepper", "fish sauce", "cilantro", "lime"],
    searchPhrases: ["thai garlic shrimp", "garlic shrimp with rice", "stir fried shrimp thai"]
  },
  {
    dishName: "Tagliatelle al Ragu",
    cuisine: "Italian",
    mealType: "dinner",
    cookingMethod: "simmered",
    ingredientAnchors: ["ground meat", "pasta"],
    supportAnchors: ["tomato", "onion", "carrot", "celery", "parmesan", "olive oil"],
    visualKeywords: ["tagliatelle ragu", "meat sauce pasta", "italian ragu pasta"],
    excludeKeywords: ["dessert", "cream sauce", "rice"],
    healthStyles: ["comfort", "protein-forward"],
    popularity: 89,
    seasoningProfile: ["tomato", "onion", "celery", "carrot", "parmesan"],
    searchPhrases: ["tagliatelle al ragu", "italian meat sauce pasta", "ragu bolognese pasta"]
  },
  {
    dishName: "Pollo Cacciatore",
    cuisine: "Italian",
    mealType: "dinner",
    cookingMethod: "simmered",
    ingredientAnchors: ["chicken"],
    supportAnchors: ["tomato", "onion", "garlic", "olive oil", "herbs", "mushroom"],
    visualKeywords: ["chicken cacciatore", "tomato braised chicken", "italian chicken stew"],
    excludeKeywords: ["dessert", "cream pasta", "shrimp"],
    healthStyles: ["balanced", "protein-forward"],
    dietTags: ["high-protein", "gluten-free"],
    popularity: 84,
    seasoningProfile: ["tomato", "garlic", "oregano", "basil", "olive oil"],
    searchPhrases: ["pollo cacciatore", "chicken cacciatore", "italian tomato braised chicken"]
  },
  {
    dishName: "Pesce all'Acqua Pazza",
    cuisine: "Italian",
    mealType: "dinner",
    cookingMethod: "simmered",
    ingredientAnchors: ["fish"],
    supportAnchors: ["tomato", "garlic", "olive oil", "parsley", "lemon"],
    visualKeywords: ["italian fish in tomato broth", "acqua pazza fish", "white fish cherry tomatoes"],
    excludeKeywords: ["dessert", "pasta", "beef"],
    healthStyles: ["lighter", "protein-forward"],
    dietTags: ["high-protein", "gluten-free", "low-carb"],
    popularity: 80,
    seasoningProfile: ["garlic", "parsley", "olive oil", "tomato", "lemon"],
    searchPhrases: ["pesce acqua pazza", "italian fish acqua pazza", "fish with cherry tomatoes italian"]
  },
  {
    dishName: "Shrimp Scampi",
    cuisine: "Italian",
    mealType: "dinner",
    cookingMethod: "pan-seared",
    ingredientAnchors: ["shrimp"],
    supportAnchors: ["garlic", "lemon", "butter", "parsley", "pasta"],
    visualKeywords: ["shrimp scampi", "garlic lemon shrimp", "shrimp with linguine"],
    excludeKeywords: ["dessert", "tomato stew", "beef"],
    healthStyles: ["balanced", "protein-forward"],
    dietTags: ["high-protein"],
    popularity: 82,
    seasoningProfile: ["garlic", "lemon", "parsley", "butter", "olive oil"],
    searchPhrases: ["shrimp scampi", "garlic lemon shrimp scampi", "italian shrimp scampi"]
  },
  {
    dishName: "Shish Tawook",
    cuisine: "Middle Eastern",
    mealType: "dinner",
    cookingMethod: "grilled",
    ingredientAnchors: ["chicken"],
    supportAnchors: ["yogurt", "garlic", "lemon", "paprika", "pita", "rice"],
    visualKeywords: ["shish tawook skewers", "middle eastern grilled chicken", "chicken kebab platter"],
    excludeKeywords: ["dessert", "pasta", "beef"],
    healthStyles: ["lighter", "protein-forward"],
    dietTags: ["high-protein"],
    popularity: 89,
    seasoningProfile: ["garlic", "lemon", "paprika", "yogurt", "allspice"],
    searchPhrases: ["shish tawook", "middle eastern grilled chicken skewers", "chicken tawook plate"]
  },
  {
    dishName: "Kibbeh",
    cuisine: "Middle Eastern",
    mealType: "dinner",
    cookingMethod: "baked",
    ingredientAnchors: ["ground meat"],
    supportAnchors: ["bulgur", "onion", "allspice", "mint", "pine nut", "yogurt"],
    visualKeywords: ["baked kibbeh", "bulgur meat pie", "middle eastern kibbeh tray"],
    excludeKeywords: ["dessert", "burger", "pasta"],
    healthStyles: ["comfort", "protein-forward"],
    dietTags: ["high-protein"],
    popularity: 88,
    seasoningProfile: ["allspice", "mint", "onion", "cinnamon", "pine nut"],
    searchPhrases: ["kibbeh", "baked kibbeh", "middle eastern bulgur meat pie"]
  },
  {
    dishName: "Samak Harra",
    cuisine: "Middle Eastern",
    mealType: "dinner",
    cookingMethod: "baked",
    ingredientAnchors: ["fish"],
    supportAnchors: ["tahini", "garlic", "chili", "lemon", "cilantro", "walnut"],
    visualKeywords: ["spicy baked fish", "samak harra", "middle eastern fish tahini"],
    excludeKeywords: ["dessert", "pasta", "beef"],
    healthStyles: ["balanced", "protein-forward"],
    dietTags: ["high-protein"],
    popularity: 82,
    seasoningProfile: ["tahini", "garlic", "chili", "lemon", "cilantro"],
    searchPhrases: ["samak harra", "middle eastern spicy fish", "lebanese baked fish tahini"]
  },
  {
    dishName: "Shrimp Sayadieh",
    cuisine: "Middle Eastern",
    mealType: "dinner",
    cookingMethod: "simmered",
    ingredientAnchors: ["shrimp"],
    supportAnchors: ["rice", "onion", "cumin", "coriander", "tomato", "lemon"],
    visualKeywords: ["shrimp sayadieh rice", "middle eastern seafood rice", "spiced shrimp rice"],
    excludeKeywords: ["dessert", "pasta", "beef"],
    healthStyles: ["balanced", "protein-forward"],
    dietTags: ["high-protein"],
    popularity: 78,
    seasoningProfile: ["cumin", "coriander", "onion", "lemon", "allspice"],
    searchPhrases: ["shrimp sayadieh", "middle eastern seafood rice", "spiced shrimp rice"]
  },
  {
    dishName: "Chicken Souvlaki",
    cuisine: "Mediterranean",
    mealType: "dinner",
    cookingMethod: "grilled",
    ingredientAnchors: ["chicken"],
    supportAnchors: ["lemon", "oregano", "olive oil", "garlic", "yogurt", "pita"],
    visualKeywords: ["chicken souvlaki skewers", "greek grilled chicken", "souvlaki platter"],
    excludeKeywords: ["dessert", "pasta", "beef"],
    healthStyles: ["lighter", "protein-forward"],
    dietTags: ["high-protein"],
    popularity: 86,
    seasoningProfile: ["lemon", "oregano", "garlic", "olive oil", "yogurt"],
    searchPhrases: ["chicken souvlaki", "greek chicken skewers", "mediterranean chicken souvlaki"]
  },
  {
    dishName: "Moussaka",
    cuisine: "Mediterranean",
    mealType: "dinner",
    cookingMethod: "baked",
    ingredientAnchors: ["ground meat", "eggplant"],
    supportAnchors: ["tomato", "onion", "cinnamon", "bechamel", "potato"],
    visualKeywords: ["greek moussaka", "eggplant meat casserole", "layered moussaka slice"],
    excludeKeywords: ["dessert", "pasta", "burger"],
    healthStyles: ["comfort"],
    popularity: 84,
    seasoningProfile: ["cinnamon", "tomato", "onion", "nutmeg", "olive oil"],
    searchPhrases: ["greek moussaka", "mediterranean eggplant meat casserole", "moussaka slice"]
  },
  {
    dishName: "Shrimp Saganaki",
    cuisine: "Mediterranean",
    mealType: "dinner",
    cookingMethod: "simmered",
    ingredientAnchors: ["shrimp"],
    supportAnchors: ["tomato", "feta", "olive oil", "garlic", "oregano"],
    visualKeywords: ["shrimp saganaki", "greek shrimp tomato feta", "shrimp in tomato feta sauce"],
    excludeKeywords: ["dessert", "cream pasta", "beef"],
    healthStyles: ["balanced", "protein-forward"],
    dietTags: ["high-protein", "gluten-free"],
    popularity: 83,
    seasoningProfile: ["tomato", "feta", "oregano", "garlic", "olive oil"],
    searchPhrases: ["shrimp saganaki", "greek shrimp tomato feta", "mediterranean shrimp saganaki"]
  },
  {
    dishName: "Seafood Paella",
    cuisine: "Mediterranean",
    mealType: "dinner",
    cookingMethod: "simmered",
    ingredientAnchors: ["shrimp", "rice"],
    supportAnchors: ["fish", "saffron", "tomato", "pepper", "pea", "lemon"],
    visualKeywords: ["seafood paella", "spanish shrimp rice", "paella pan seafood"],
    excludeKeywords: ["dessert", "pasta", "beef"],
    healthStyles: ["balanced", "protein-forward"],
    dietTags: ["high-protein"],
    popularity: 85,
    seasoningProfile: ["saffron", "paprika", "tomato", "lemon", "olive oil"],
    searchPhrases: ["seafood paella", "spanish seafood rice", "shrimp paella"]
  },
  {
    dishName: "Butter Chicken",
    cuisine: "Indian",
    mealType: "dinner",
    cookingMethod: "simmered",
    ingredientAnchors: ["chicken"],
    supportAnchors: ["tomato", "butter", "cream", "garam masala", "ginger", "garlic"],
    visualKeywords: ["butter chicken curry", "creamy tomato chicken", "indian chicken makhani"],
    excludeKeywords: ["dessert", "pasta", "fish"],
    healthStyles: ["comfort", "protein-forward"],
    dietTags: ["high-protein"],
    popularity: 92,
    seasoningProfile: ["garam masala", "ginger", "garlic", "tomato", "fenugreek"],
    searchPhrases: ["butter chicken", "murgh makhani", "indian butter chicken"]
  },
  {
    dishName: "Tandoori Chicken",
    cuisine: "Indian",
    mealType: "dinner",
    cookingMethod: "grilled",
    ingredientAnchors: ["chicken"],
    supportAnchors: ["yogurt", "garam masala", "ginger", "garlic", "lemon", "chili"],
    visualKeywords: ["tandoori chicken", "red grilled chicken", "indian grilled chicken"],
    excludeKeywords: ["dessert", "pasta", "fish"],
    healthStyles: ["lighter", "protein-forward"],
    dietTags: ["high-protein", "low-carb"],
    popularity: 90,
    seasoningProfile: ["yogurt", "garam masala", "ginger", "garlic", "chili"],
    searchPhrases: ["tandoori chicken", "indian grilled chicken", "tandoori chicken plate"]
  },
  {
    dishName: "Prawn Masala",
    cuisine: "Indian",
    mealType: "dinner",
    cookingMethod: "simmered",
    ingredientAnchors: ["shrimp"],
    supportAnchors: ["tomato", "onion", "ginger", "garlic", "cumin", "coriander"],
    visualKeywords: ["prawn masala curry", "indian shrimp curry", "shrimp masala gravy"],
    excludeKeywords: ["dessert", "pasta", "beef"],
    healthStyles: ["balanced", "protein-forward"],
    dietTags: ["high-protein"],
    popularity: 84,
    seasoningProfile: ["cumin", "coriander", "turmeric", "ginger", "garlic"],
    searchPhrases: ["prawn masala", "indian shrimp curry", "shrimp masala"]
  },
  {
    dishName: "Tinga de Pollo",
    cuisine: "Mexican",
    mealType: "dinner",
    cookingMethod: "simmered",
    ingredientAnchors: ["chicken"],
    supportAnchors: ["tomato", "onion", "chipotle", "tortilla", "cilantro"],
    visualKeywords: ["tinga de pollo", "shredded chicken tostadas", "chipotle chicken tacos"],
    excludeKeywords: ["dessert", "pasta", "beef"],
    healthStyles: ["balanced", "protein-forward"],
    dietTags: ["high-protein"],
    popularity: 86,
    seasoningProfile: ["chipotle", "tomato", "onion", "garlic", "cilantro"],
    searchPhrases: ["tinga de pollo", "mexican shredded chicken tinga", "chicken tinga tostadas"]
  },
  {
    dishName: "Picadillo",
    cuisine: "Mexican",
    mealType: "dinner",
    cookingMethod: "simmered",
    ingredientAnchors: ["ground meat"],
    supportAnchors: ["tomato", "potato", "onion", "garlic", "cumin", "rice"],
    visualKeywords: ["mexican picadillo", "ground beef potato stew", "picadillo rice plate"],
    excludeKeywords: ["dessert", "burger", "pasta"],
    healthStyles: ["balanced", "protein-forward"],
    dietTags: ["high-protein"],
    popularity: 84,
    seasoningProfile: ["cumin", "tomato", "garlic", "onion", "cilantro"],
    searchPhrases: ["mexican picadillo", "picadillo con papas", "ground beef picadillo"]
  },
  {
    dishName: "Pescado a la Veracruzana",
    cuisine: "Mexican",
    mealType: "dinner",
    cookingMethod: "simmered",
    ingredientAnchors: ["fish"],
    supportAnchors: ["tomato", "olive", "caper", "onion", "pepper", "lime"],
    visualKeywords: ["veracruz fish", "fish in tomato olive sauce", "mexican fish veracruz"],
    excludeKeywords: ["dessert", "pasta", "beef"],
    healthStyles: ["balanced", "protein-forward"],
    dietTags: ["high-protein", "gluten-free"],
    popularity: 83,
    seasoningProfile: ["tomato", "olive", "caper", "onion", "lime"],
    searchPhrases: ["pescado a la veracruzana", "fish veracruz", "mexican fish tomato olive sauce"]
  },
  {
    dishName: "Aguachile",
    cuisine: "Mexican",
    mealType: "lunch",
    cookingMethod: "assembled",
    ingredientAnchors: ["shrimp"],
    supportAnchors: ["lime", "chili", "cucumber", "onion", "cilantro"],
    visualKeywords: ["shrimp aguachile", "mexican lime shrimp", "green aguachile plate"],
    excludeKeywords: ["dessert", "pasta", "beef stew"],
    healthStyles: ["lighter", "protein-forward"],
    dietTags: ["high-protein", "gluten-free", "low-carb"],
    popularity: 82,
    seasoningProfile: ["lime", "chili", "cilantro", "onion", "cucumber"],
    searchPhrases: ["aguachile", "shrimp aguachile", "mexican lime shrimp aguachile"]
  },
  {
    dishName: "Fried Chicken",
    cuisine: "American",
    mealType: "dinner",
    cookingMethod: "fried",
    ingredientAnchors: ["chicken"],
    supportAnchors: ["flour", "buttermilk", "paprika", "potato", "cornbread"],
    visualKeywords: ["southern fried chicken", "crispy fried chicken plate", "fried chicken dinner"],
    excludeKeywords: ["dessert", "pasta", "fish"],
    healthStyles: ["comfort", "protein-forward"],
    dietTags: ["high-protein"],
    popularity: 89,
    seasoningProfile: ["paprika", "black pepper", "garlic", "buttermilk"],
    searchPhrases: ["southern fried chicken", "american fried chicken", "crispy fried chicken plate"]
  },
  {
    dishName: "Chicken Pot Pie",
    cuisine: "American",
    mealType: "dinner",
    cookingMethod: "baked",
    ingredientAnchors: ["chicken"],
    supportAnchors: ["pie crust", "carrot", "pea", "celery", "cream", "butter"],
    visualKeywords: ["chicken pot pie", "creamy chicken pie", "golden pot pie"],
    excludeKeywords: ["dessert", "pasta", "shrimp"],
    healthStyles: ["comfort"],
    popularity: 84,
    seasoningProfile: ["black pepper", "celery", "thyme", "butter"],
    searchPhrases: ["chicken pot pie", "american chicken pot pie", "golden chicken pie"]
  },
  {
    dishName: "Sloppy Joe",
    cuisine: "American",
    mealType: "dinner",
    cookingMethod: "simmered",
    ingredientAnchors: ["ground meat"],
    supportAnchors: ["tomato sauce", "bun", "onion", "mustard", "brown sugar"],
    visualKeywords: ["sloppy joe sandwich", "saucy ground beef bun", "american sloppy joe"],
    excludeKeywords: ["dessert", "pasta", "kebab"],
    healthStyles: ["comfort", "protein-forward"],
    popularity: 78,
    seasoningProfile: ["tomato sauce", "mustard", "onion", "black pepper"],
    searchPhrases: ["sloppy joe", "american sloppy joe sandwich", "saucy ground beef bun"]
  },
  {
    dishName: "Shrimp and Grits",
    cuisine: "American",
    mealType: "dinner",
    cookingMethod: "pan-seared",
    ingredientAnchors: ["shrimp"],
    supportAnchors: ["cornmeal", "butter", "cheese", "garlic", "scallion"],
    visualKeywords: ["shrimp and grits", "southern shrimp grits", "shrimp over creamy grits"],
    excludeKeywords: ["dessert", "pasta", "beef"],
    healthStyles: ["comfort", "protein-forward"],
    dietTags: ["high-protein"],
    popularity: 82,
    seasoningProfile: ["butter", "garlic", "black pepper", "scallion"],
    searchPhrases: ["shrimp and grits", "southern shrimp and grits", "shrimp over grits"]
  },
  {
    dishName: "Blackened Fish",
    cuisine: "American",
    mealType: "dinner",
    cookingMethod: "pan-seared",
    ingredientAnchors: ["fish"],
    supportAnchors: ["paprika", "garlic", "lemon", "butter", "cornmeal", "rice"],
    visualKeywords: ["blackened fish fillet", "cajun fish plate", "spiced seared fish"],
    excludeKeywords: ["dessert", "pasta", "beef"],
    healthStyles: ["lighter", "protein-forward"],
    dietTags: ["high-protein", "gluten-free", "low-carb"],
    popularity: 78,
    seasoningProfile: ["paprika", "garlic", "black pepper", "lemon", "butter"],
    searchPhrases: ["blackened fish", "cajun blackened fish", "american blackened fish plate"]
  },
  {
    dishName: "Kung Pao Chicken",
    cuisine: "Asian",
    mealType: "dinner",
    cookingMethod: "stir-fried",
    ingredientAnchors: ["chicken"],
    supportAnchors: ["soy sauce", "chili", "peanut", "garlic", "ginger", "rice"],
    visualKeywords: ["kung pao chicken", "chinese chicken stir fry", "chicken peanuts chili"],
    excludeKeywords: ["dessert", "pasta", "fish"],
    healthStyles: ["balanced", "protein-forward"],
    dietTags: ["high-protein"],
    popularity: 86,
    seasoningProfile: ["soy sauce", "chili", "garlic", "ginger", "peanut"],
    searchPhrases: ["kung pao chicken", "chinese chicken peanuts", "spicy chicken stir fry"]
  },
  {
    dishName: "Mapo Tofu",
    cuisine: "Asian",
    mealType: "dinner",
    cookingMethod: "simmered",
    ingredientAnchors: ["ground meat", "tofu"],
    supportAnchors: ["chili bean paste", "soy sauce", "scallion", "garlic", "rice"],
    visualKeywords: ["mapo tofu", "spicy tofu pork", "sichuan tofu bowl"],
    excludeKeywords: ["dessert", "pasta", "burger"],
    healthStyles: ["balanced", "protein-forward"],
    popularity: 84,
    seasoningProfile: ["chili bean paste", "soy sauce", "garlic", "scallion"],
    searchPhrases: ["mapo tofu", "sichuan mapo tofu", "spicy tofu with ground pork"]
  },
  {
    dishName: "Miso Salmon",
    cuisine: "Asian",
    mealType: "dinner",
    cookingMethod: "baked",
    ingredientAnchors: ["fish"],
    supportAnchors: ["miso", "soy sauce", "ginger", "rice", "scallion"],
    visualKeywords: ["miso salmon", "japanese glazed fish", "salmon rice plate"],
    excludeKeywords: ["dessert", "pasta", "beef"],
    healthStyles: ["lighter", "protein-forward"],
    dietTags: ["high-protein"],
    popularity: 82,
    seasoningProfile: ["miso", "soy sauce", "ginger", "scallion"],
    searchPhrases: ["miso salmon", "japanese miso fish", "miso glazed salmon"]
  },
  {
    dishName: "Gai Yang",
    cuisine: "Thai",
    mealType: "dinner",
    cookingMethod: "grilled",
    ingredientAnchors: ["chicken"],
    supportAnchors: ["fish sauce", "garlic", "lime", "cilantro", "rice", "chili"],
    visualKeywords: ["gai yang grilled chicken", "thai grilled chicken", "charred chicken sticky rice"],
    excludeKeywords: ["dessert", "pasta", "beef"],
    healthStyles: ["lighter", "protein-forward"],
    dietTags: ["high-protein"],
    popularity: 86,
    seasoningProfile: ["fish sauce", "garlic", "cilantro", "lime", "chili"],
    searchPhrases: ["gai yang", "thai grilled chicken", "grilled chicken sticky rice thai"]
  },
  {
    dishName: "Larb Gai",
    cuisine: "Thai",
    mealType: "dinner",
    cookingMethod: "skillet",
    ingredientAnchors: ["ground meat"],
    supportAnchors: ["lime", "fish sauce", "mint", "chili", "rice powder", "lettuce"],
    visualKeywords: ["larb gai", "thai minced chicken salad", "spicy minced meat herbs"],
    excludeKeywords: ["dessert", "pasta", "burger"],
    healthStyles: ["lighter", "protein-forward"],
    dietTags: ["high-protein", "low-carb"],
    popularity: 84,
    seasoningProfile: ["lime", "fish sauce", "mint", "chili", "toasted rice"],
    searchPhrases: ["larb gai", "thai minced chicken salad", "thai larb"]
  },
  {
    dishName: "Pla Rad Prik",
    cuisine: "Thai",
    mealType: "dinner",
    cookingMethod: "fried",
    ingredientAnchors: ["fish"],
    supportAnchors: ["chili", "garlic", "tamarind", "fish sauce", "rice"],
    visualKeywords: ["thai chili fish", "pla rad prik", "fried fish chili sauce"],
    excludeKeywords: ["dessert", "pasta", "beef"],
    healthStyles: ["balanced", "protein-forward"],
    dietTags: ["high-protein"],
    popularity: 82,
    seasoningProfile: ["chili", "garlic", "tamarind", "fish sauce", "lime"],
    searchPhrases: ["pla rad prik", "thai fried fish chili sauce", "thai chili fish"]
  },
  {
    dishName: "Goong Ob Woon Sen",
    cuisine: "Thai",
    mealType: "dinner",
    cookingMethod: "steamed",
    ingredientAnchors: ["shrimp"],
    supportAnchors: ["glass noodle", "ginger", "garlic", "soy sauce", "cilantro"],
    visualKeywords: ["thai shrimp glass noodles", "goong ob woon sen", "shrimp vermicelli pot"],
    excludeKeywords: ["dessert", "cream pasta", "beef"],
    healthStyles: ["balanced", "protein-forward"],
    dietTags: ["high-protein"],
    popularity: 82,
    seasoningProfile: ["ginger", "garlic", "soy sauce", "cilantro", "white pepper"],
    searchPhrases: ["goong ob woon sen", "thai shrimp glass noodles", "shrimp vermicelli pot"]
  },
  {
    dishName: "Tavuk Sis",
    cuisine: "Turkish",
    mealType: "dinner",
    cookingMethod: "grilled",
    ingredientAnchors: ["chicken"],
    supportAnchors: ["yogurt", "garlic", "lemon", "paprika", "flatbread", "rice"],
    visualKeywords: ["tavuk sis skewers", "turkish chicken kebab", "grilled chicken skewers"],
    excludeKeywords: ["dessert", "pasta", "beef"],
    healthStyles: ["lighter", "protein-forward"],
    dietTags: ["high-protein"],
    popularity: 86,
    seasoningProfile: ["yogurt", "garlic", "paprika", "lemon", "sumac"],
    searchPhrases: ["tavuk sis", "turkish chicken skewers", "turkish chicken kebab"]
  },
  {
    dishName: "Manti",
    cuisine: "Turkish",
    mealType: "dinner",
    cookingMethod: "boiled",
    ingredientAnchors: ["ground meat"],
    supportAnchors: ["flour", "yogurt", "garlic", "butter", "paprika", "mint"],
    visualKeywords: ["turkish manti", "meat dumplings yogurt", "manti with garlic yogurt"],
    excludeKeywords: ["dessert", "burger", "rice"],
    healthStyles: ["comfort", "protein-forward"],
    popularity: 87,
    seasoningProfile: ["garlic yogurt", "paprika butter", "mint", "black pepper"],
    searchPhrases: ["manti turkish", "turkish meat dumplings", "manti garlic yogurt"]
  },
  {
    dishName: "Levrek Bugulama",
    cuisine: "Turkish",
    mealType: "dinner",
    cookingMethod: "steamed",
    ingredientAnchors: ["fish"],
    supportAnchors: ["tomato", "pepper", "onion", "lemon", "olive oil", "parsley"],
    visualKeywords: ["turkish steamed fish", "levrek bugulama", "fish with tomatoes peppers"],
    excludeKeywords: ["dessert", "pasta", "beef"],
    healthStyles: ["lighter", "protein-forward"],
    dietTags: ["high-protein", "gluten-free", "low-carb"],
    popularity: 79,
    seasoningProfile: ["lemon", "parsley", "olive oil", "pepper", "tomato"],
    searchPhrases: ["levrek bugulama", "turkish steamed fish", "turkish fish tomato pepper"]
  },
  {
    dishName: "Karides Guvec",
    cuisine: "Turkish",
    mealType: "dinner",
    cookingMethod: "baked",
    ingredientAnchors: ["shrimp"],
    supportAnchors: ["tomato", "pepper", "garlic", "cheese", "butter", "parsley"],
    visualKeywords: ["turkish shrimp casserole", "karides guvec", "shrimp clay pot"],
    excludeKeywords: ["dessert", "pasta", "beef"],
    healthStyles: ["balanced", "protein-forward"],
    dietTags: ["high-protein"],
    popularity: 80,
    seasoningProfile: ["garlic", "tomato", "pepper", "butter", "parsley"],
    searchPhrases: ["karides guvec", "turkish shrimp casserole", "shrimp clay pot turkish"]
  }
];

const CATALOG_INGREDIENT_NAME_ALIASES: Record<string, string[]> = {
  liver: ["kebda", "kibda", "ciger", "cigeri"]
};

export function buildCuisineAwareDishCandidates(context: DishCandidateContext): DishCandidate[] {
  const normalizedIngredients = normalizeIngredientList(context.availableIngredients ?? []);
  const cuisineKey = normalizeCuisineKey(context.preferredCuisine ?? "Any");
  const candidatePool =
    cuisineKey === "any"
      ? DISH_BLUEPRINTS
      : DISH_BLUEPRINTS.filter((dish) => normalizeCuisineKey(dish.cuisine) === cuisineKey);
  const catalogCandidates = buildCatalogDishCandidates(context, normalizedIngredients, cuisineKey);

  return dedupeDishCandidates([
    ...catalogCandidates,
    ...candidatePool
    .map((dish) => scoreDishBlueprint(dish, normalizedIngredients, context))
  ])
    .filter((candidate) => candidate.score > 0 && hasCandidatePantrySignal(candidate, normalizedIngredients))
    .sort((left, right) => right.score - left.score || left.dishName.localeCompare(right.dishName))
    .slice(0, 10);
}

export function buildDishCandidatePromptSummary(candidates: DishCandidate[]) {
  if (!candidates.length) return "";

  return candidates
    .slice(0, 10)
    .map(
      (candidate, index) =>
        `${index + 1}. ${candidate.dishName} (${candidate.cuisine}; ${candidate.mealType}; ${candidate.cookingMethod}; seasonings: ${(candidate.seasoningProfile ?? []).slice(0, 5).join(", ") || "none"}; signals: ${candidate.hits.join(", ")})`
    )
    .join(" | ");
}

export function enrichRecipeWithDishIntent(recipe: Recipe, context: DishCandidateContext = {}): Recipe {
  // Source recipes already carry an authored dish identity. Dish blueprints are
  // useful for newly generated cards, but must never relabel a real recipe
  // simply because its pantry ingredients overlap a different regional dish.
  const preservesSourceIdentity =
    recipe.recipe_source_type === "local_database" || recipe.recipe_source_type === "external_source";
  const availableIngredients = normalizeIngredientList([
    ...recipe.ingredients,
    ...recipe.missing_ingredients,
    ...(context.availableIngredients ?? [])
  ]);
  const candidates = buildCuisineAwareDishCandidates({
    ...context,
    availableIngredients
  });
  const inferredMealType = inferMealType(recipe);
  const inferredCookingMethod = inferCookingMethod(recipe);
  const trustedCandidate = preservesSourceIdentity
    ? undefined
    : candidates.find((candidate) => Boolean(shouldTrustCandidate(recipe, candidate, inferredMealType)));
  const mealType = trustedCandidate?.mealType ?? inferredMealType;
  const cookingMethod = trustedCandidate?.cookingMethod ?? inferredCookingMethod;
  const dishIntent: RecipeDishIntent = {
    dish_name: preservesSourceIdentity ? recipe.name : trustedCandidate?.dishName ?? recipe.name,
    cuisine: preservesSourceIdentity ? recipe.cuisine : trustedCandidate?.cuisine ?? normalizeCuisineLabel(recipe.cuisine),
    meal_type: mealType,
    diet_type: inferDietType(recipe, context.diets ?? []),
    cooking_method: cookingMethod,
    visual_keywords: uniqueKeywords([
      ...(trustedCandidate?.visualKeywords ?? []),
      ...extractVisualKeywords(recipe),
      ...(trustedCandidate?.dishName ? [trustedCandidate.dishName] : [recipe.name])
    ]).slice(0, 6),
    exclude_keywords: uniqueKeywords([
      ...(trustedCandidate?.excludeKeywords ?? []),
      ...inferExcludeKeywords(recipe)
    ]).slice(0, 6),
    candidate_score: trustedCandidate?.score,
    candidate_hits: trustedCandidate?.hits
  };

  const photoQueries = buildDishAwareImageQueries(dishIntent, recipe, trustedCandidate);

  return {
    ...recipe,
    cuisine: preservesSourceIdentity ? recipe.cuisine : dishIntent.cuisine || recipe.cuisine,
    dish_intent: dishIntent,
    image_search_index: photoQueries[0] ?? recipe.image_search_index,
    image_search_indices: photoQueries.length ? photoQueries : recipe.image_search_indices,
    preference_hits: uniqueKeywords([
      ...normalizePreferenceHits(recipe.preference_hits),
      ...(trustedCandidate?.hits ?? [])
    ]).slice(0, 6)
  };
}

export function buildDishAwareImageQueries(intent: RecipeDishIntent, recipe: Pick<Recipe, "name" | "ingredients" | "missing_ingredients">, candidate?: DishCandidate) {
  const cuisine = normalizeSearchPhrase(intent.cuisine);
  const dish = normalizeSearchPhrase(intent.dish_name || recipe.name);
  const method = normalizeSearchPhrase(intent.cooking_method ?? candidate?.cookingMethod ?? "");
  const diet = normalizeSearchPhrase(intent.diet_type ?? "");
  const leadVisual = normalizeSearchPhrase(intent.visual_keywords[0] ?? "");
  const secondVisual = normalizeSearchPhrase(intent.visual_keywords[1] ?? "");
  const ingredientFallback = normalizeIngredientList([...recipe.ingredients, ...recipe.missing_ingredients]).slice(0, 2).join(" ");

  return uniqueKeywords([
    ...(candidate?.searchPhrases ?? []),
    joinSearchTerms(dish, cuisine, "food"),
    joinSearchTerms(dish, method, "plate"),
    joinSearchTerms(cuisine, "traditional", dish),
    joinSearchTerms(cuisine, method, leadVisual || dish),
    joinSearchTerms(diet, cuisine, leadVisual || dish),
    joinSearchTerms(leadVisual, cuisine),
    joinSearchTerms(secondVisual, cuisine),
    joinSearchTerms(ingredientFallback, cuisine, method),
    ...(candidate?.visualKeywords ?? []).map((value) => joinSearchTerms(value, cuisine))
  ]).slice(0, 5);
}

function scoreDishBlueprint(
  dish: DishBlueprint,
  normalizedIngredients: string[],
  context: DishCandidateContext
): DishCandidate {
  const hits: string[] = [];
  let score = dish.popularity;
  const preferredCuisine = normalizeCuisineKey(context.preferredCuisine ?? "Any");
  const dishCuisine = normalizeCuisineKey(dish.cuisine);

  if (preferredCuisine === "any" || preferredCuisine === dishCuisine) {
    score += preferredCuisine === "any" ? 4 : 16;
    hits.push("cuisine-authentic");
  }

  const anchorMatches = countMatches(normalizedIngredients, dish.ingredientAnchors);
  const supportMatches = countMatches(normalizedIngredients, dish.supportAnchors ?? []);
  const structuralAnchorMisses = countStructuralAnchorMisses(dish.ingredientAnchors, normalizedIngredients);
  score += anchorMatches * 16;
  score += supportMatches * 5;
  score -= structuralAnchorMisses * 18;
  if (anchorMatches === 0) {
    score -= 20;
  } else {
    hits.push(`anchor-match:${anchorMatches}`);
  }
  if (supportMatches > 0) {
    hits.push(`support-match:${supportMatches}`);
  }
  if (structuralAnchorMisses > 0) {
    hits.push(`structure-miss:${structuralAnchorMisses}`);
  }

  score += scoreDietCompatibility(dish, context.diets ?? [], hits);
  score += scoreHealthCompatibility(dish, context.conditions ?? [], context.calorieTarget, hits);
  score += scoreAllergenSafety(dish, context.allergens ?? [], hits);
  score += scoreIngredientIntent(dish, normalizedIngredients, hits);
  score += scoreSparseCuisineIntent(dish, normalizedIngredients, preferredCuisine, hits);
  score += scoreCookingSimplicity(dish, hits);

  return {
    anchorMatchCount: anchorMatches,
    cookingMethod: dish.cookingMethod,
    cuisine: dish.cuisine,
    dishName: dish.dishName,
    excludeKeywords: dish.excludeKeywords,
    hits: uniqueKeywords(hits).slice(0, 5),
    ingredientAnchors: dish.ingredientAnchors,
    mealType: dish.mealType,
    seasoningProfile: dish.seasoningProfile,
    searchPhrases: dish.searchPhrases,
    score,
    supportMatchCount: supportMatches,
    visualKeywords: dish.visualKeywords
  };
}

function hasCandidatePantrySignal(candidate: DishCandidate, normalizedIngredients: string[]) {
  if (!normalizedIngredients.length) return true;
  if (candidate.anchorMatchCount > 0 || candidate.supportMatchCount > 0) return true;
  return candidate.hits.some((hit) => hit.startsWith("intent-") || hit.startsWith("sparse-") || hit.startsWith("catalog-"));
}

function shouldTrustCandidate(
  recipe: Recipe,
  candidate: DishCandidate | undefined,
  inferredMealType: RecipeMealType
) {
  if (!candidate) return undefined;

  const recipeName = normalizeDishKey(recipe.name);
  const candidateName = normalizeDishKey(candidate.dishName);
  const exactNameMatch =
    recipeName === candidateName ||
    recipeName.includes(candidateName) ||
    candidateName.includes(recipeName);
  const hasIntentSignal = candidate.hits.some((hit) => hit.startsWith("intent-"));
  const hasCatalogSignal = candidate.hits.some((hit) => hit.startsWith("catalog-"));
  const mealTypeMatch = candidate.mealType === inferredMealType;
  const strongAnchorFit = candidate.anchorMatchCount >= 2;
  const moderateAnchorFit = candidate.anchorMatchCount >= 1 && candidate.supportMatchCount >= 2;
  const recipeSignals = normalizeIngredientList([
    recipe.name,
    recipe.image_search_index ?? "",
    ...(recipe.image_search_indices ?? []),
    ...recipe.ingredients,
    ...recipe.missing_ingredients
  ]);
  const hasStructuralMismatch = countStructuralAnchorMisses(candidate.ingredientAnchors, recipeSignals) > 0;

  if (exactNameMatch) return candidate;
  if (hasStructuralMismatch) return undefined;
  if (strongAnchorFit && mealTypeMatch) return candidate;
  if ((hasIntentSignal || hasCatalogSignal) && mealTypeMatch) return candidate;
  if (moderateAnchorFit && mealTypeMatch && candidate.score >= 110) return candidate;
  return undefined;
}

function buildCatalogDishCandidates(
  context: DishCandidateContext,
  normalizedIngredients: string[],
  cuisineKey: string
): DishCandidate[] {
  if (cuisineKey === "any" || !normalizedIngredients.length) return [];

  const detailedCatalog = getCompleteCuisineCatalog(context.preferredCuisine ?? "");
  if (detailedCatalog?.length) {
    return buildDetailedCatalogDishCandidates(detailedCatalog, normalizedIngredients, context.preferredCuisine ?? "");
  }

  const catalog = getCuisineDishCatalog(context.preferredCuisine ?? "");
  if (!catalog?.iconicDishes.length) return [];

  const cuisine = normalizeCuisineLabel(context.preferredCuisine ?? "");
  const candidates = catalog.iconicDishes
    .map<DishCandidate | undefined>((dishName, index) => {
      const dishKey = normalizeDishKey(dishName);
      const ingredientAnchors = normalizedIngredients.filter((ingredient) => matchesCatalogDishIngredient(dishKey, ingredient));
      if (!ingredientAnchors.length) return undefined;

      const score = 96 + Math.max(0, 24 - index) + ingredientAnchors.length * 22;
      const mealType = inferCatalogMealType(dishKey);
      const cookingMethod = inferCatalogCookingMethod(dishKey);

      return {
        anchorMatchCount: ingredientAnchors.length,
        cookingMethod,
        cuisine,
        dishName,
        excludeKeywords: inferCatalogExcludeKeywords(dishKey),
        hits: uniqueKeywords(["catalog-dish-match", `anchor-match:${ingredientAnchors.length}`]),
        ingredientAnchors,
        mealType,
        searchPhrases: uniqueKeywords([
          `${dishName} ${cuisine} food`,
          `${cuisine} traditional ${dishName}`,
          `${dishName} plate`
        ]),
        score,
        supportMatchCount: 0,
        visualKeywords: uniqueKeywords([dishName, `${cuisine} ${dishName}`, `${dishName} plate`])
      };
    })
    .filter((candidate): candidate is DishCandidate => Boolean(candidate));

  return candidates;
}

function buildDetailedCatalogDishCandidates(
  catalog: readonly CuisineDish[],
  normalizedIngredients: string[],
  preferredCuisine: string
): DishCandidate[] {
  const cuisine = normalizeCuisineLabel(preferredCuisine);

  return catalog
    .map<DishCandidate | undefined>((dish) => {
      const dishName = normalizeCatalogDishDisplayName(dish);
      const dishKey = normalizeDishKey(dishName);
      const primaryAnchors = normalizeCatalogAnchors(dish.primaryIngredients);
      const optionalAnchors = normalizeCatalogAnchors(dish.optionalIngredients);
      const anchorMatches = primaryAnchors.filter((anchor) => includesIngredient(normalizedIngredients, anchor));
      const supportMatches = optionalAnchors.filter((anchor) => includesIngredient(normalizedIngredients, anchor));
      const structuralAnchorMisses = countStructuralAnchorMisses(primaryAnchors, normalizedIngredients);

      if (!anchorMatches.length && !supportMatches.length) return undefined;

      const mealType = mapCatalogMealType(dish.mealTypes[0]) ?? inferCatalogMealType(dishKey);
      const cookingMethod = inferCatalogCookingMethod(dishKey);
      const score =
        72 +
        dish.iconicScore +
        anchorMatches.length * 24 +
        supportMatches.length * 7 -
        structuralAnchorMisses * 12;

      return {
        anchorMatchCount: anchorMatches.length,
        cookingMethod,
        cuisine,
        dishName,
        excludeKeywords: inferCatalogExcludeKeywords(dishKey),
        hits: uniqueKeywords([
          "catalog-dish-match",
          "catalog-ingredient-match",
          `anchor-match:${anchorMatches.length}`,
          ...(supportMatches.length ? [`support-match:${supportMatches.length}`] : [])
        ]),
        ingredientAnchors: anchorMatches.length ? anchorMatches : supportMatches,
        mealType,
        searchPhrases: uniqueKeywords([
          `${dishName} ${cuisine} food`,
          `${cuisine} traditional ${dishName}`,
          `${dishName} plate`,
          ...dish.names.english.map((name) => `${name} ${cuisine}`)
        ]),
        score,
        supportMatchCount: supportMatches.length,
        visualKeywords: uniqueKeywords([
          dishName,
          `${cuisine} ${dishName}`,
          `${dishName} plate`,
          ...dish.names.english
        ])
      };
    })
    .filter((candidate): candidate is DishCandidate => Boolean(candidate));
}

function normalizeCatalogDishDisplayName(dish: CuisineDish) {
  return dish.names.english[0]?.trim() || dish.id.replace(/-/g, " ");
}

function normalizeCatalogAnchors(anchors: string[]) {
  return uniqueKeywords(
    anchors
      .map(normalizeIngredient)
      .filter((anchor) => anchor && (!isWeakCatalogIngredient(anchor) || isStructuralAnchor(anchor)))
  );
}

function mapCatalogMealType(mealType?: MealType): RecipeMealType | undefined {
  if (mealType === "breakfast" || mealType === "lunch" || mealType === "dinner" || mealType === "snack") {
    return mealType;
  }
  if (mealType === "soup" || mealType === "side") return "lunch";
  if (mealType === "street_food") return "dinner";
  if (mealType === "dessert" || mealType === "drink") return "snack";
  return undefined;
}

function dedupeDishCandidates(candidates: DishCandidate[]) {
  const byDish = new Map<string, DishCandidate>();

  for (const candidate of candidates) {
    const key = `${normalizeCuisineKey(candidate.cuisine)}|${normalizeDishKey(candidate.dishName)}`;
    const current = byDish.get(key);
    if (!current || candidate.score > current.score) {
      byDish.set(key, candidate);
    }
  }

  return Array.from(byDish.values());
}

function matchesCatalogDishIngredient(dishKey: string, ingredient: string) {
  if (!dishKey || !ingredient || isWeakCatalogIngredient(ingredient)) return false;
  const needles = buildCatalogIngredientNeedles(ingredient);
  if (needles.some((needle) => dishKey.includes(needle))) return true;

  return false;
}

function buildCatalogIngredientNeedles(ingredient: string) {
  const tokens = ingredient.split(/\s+/).filter((token) => token.length >= 4);
  return uniqueKeywords(
    [ingredient, ...tokens]
      .filter((value) => !isWeakCatalogIngredient(value))
      .flatMap((value) => [value, ...(CATALOG_INGREDIENT_NAME_ALIASES[value] ?? [])])
      .map(normalizeDishKey)
      .filter((value) => value.length >= 3)
  );
}

function isWeakCatalogIngredient(value: string) {
  return /^(oil|olive|water|salt|pepper|spice|spices|sauce|tomato|onion|garlic|lemon|lime|rice|bread|pita|flatbread|pasta|food|meal|dish|plate|fresh|raw|cooked)$/.test(value);
}

function inferCatalogMealType(dishKey: string): RecipeMealType {
  if (/\b(ful|foul|taameya|shakshuka|eggah|menemen|cilbir|sucuklu yumurta|simit|pogaca)\b/.test(dishKey)) {
    return "breakfast";
  }
  if (/\b(soup|corbasi|salad|kisir|balik ekmek|sandwich)\b/.test(dishKey)) return "lunch";
  if (/\b(baklava|kunefe|basbousa|kunafa|om ali|sutlac|mahalabia|qatayef|zalabya|meshabek)\b/.test(dishKey)) {
    return "snack";
  }
  return "dinner";
}

function inferCatalogCookingMethod(dishKey: string) {
  if (/\b(grilled|meshwi|kebab|kofte|sis|izgara)\b/.test(dishKey)) return "grilled";
  if (/\b(fried|tava|taameya|falafel|arnavut)\b/.test(dishKey)) return "fried";
  if (/\b(baked|bechamel|pide|boregi|feteer|tagine|taagen|guvec)\b/.test(dishKey)) return "baked";
  if (/\b(soup|stew|corbasi|molokhia|fasolia|bamia|kurufasulye)\b/.test(dishKey)) return "simmered";
  if (/\b(shakshuka|menemen|liver|ciger|shrimp|karides)\b/.test(dishKey)) return "skillet";
  return "assembled";
}

function inferCatalogExcludeKeywords(dishKey: string) {
  const excludes = ["dessert", "cookie", "cake"];

  if (/\b(liver|ciger|kebda)\b/.test(dishKey)) excludes.push("chicken", "fish", "shrimp", "dessert");
  if (/\bfish|samak|balik\b/.test(dishKey)) excludes.push("beef", "chicken", "dessert");
  if (/\bshrimp|karides\b/.test(dishKey)) excludes.push("beef", "chicken", "dessert");
  if (/\bchicken|farakh|tavuk\b/.test(dishKey)) excludes.push("fish", "shrimp", "dessert");

  return uniqueKeywords(excludes);
}

function scoreDietCompatibility(dish: DishBlueprint, diets: string[], hits: string[]) {
  let score = 0;
  const normalizedDiets = new Set(diets);
  const tags = new Set(dish.dietTags ?? []);
  const lowerDish = normalizeDishKey(dish.dishName);

  if (normalizedDiets.has("vegan")) {
    if (!tags.has("vegan")) return -120;
    score += 10;
    hits.push("diet-vegan");
  }

  if (normalizedDiets.has("vegetarian")) {
    if (/\b(chicken|beef|lamb|fish|shrimp|meat)\b/.test(lowerDish)) return -120;
    score += 8;
    hits.push("diet-vegetarian");
  }

  if (normalizedDiets.has("keto")) {
    if (/\b(koshary|macarona|pasta|rice|potato|bread|tortilla)\b/.test(lowerDish)) return -80;
    score += tags.has("low-carb") ? 10 : 2;
    hits.push("diet-keto");
  }

  if (normalizedDiets.has("glutenFree")) {
    if (/\b(bread|pasta|tortilla|hawawshi|macarona)\b/.test(lowerDish)) return -60;
    score += tags.has("gluten-free") ? 8 : 2;
    hits.push("diet-gluten-free");
  }

  if (normalizedDiets.has("dairyFree")) {
    if (/\b(bechamel|frittata|quesadillas|greek salad)\b/.test(lowerDish)) return -45;
    score += tags.has("dairy-free") ? 8 : 2;
    hits.push("diet-dairy-free");
  }

  return score;
}

function scoreHealthCompatibility(
  dish: DishBlueprint,
  conditions: string[],
  calorieTarget: number | undefined,
  hits: string[]
) {
  let score = 0;
  const normalizedConditions = new Set(conditions as SupportedCondition[]);
  const lowerDish = normalizeDishKey(dish.dishName);
  const isHeavyStarchDish = /\b(koshary|macarona|rice|pasta|quesadillas)\b/.test(lowerDish);
  const isProteinForward = dish.healthStyles?.includes("protein-forward") || /\b(kofta|shawarma|chicken|fish|keema)\b/.test(lowerDish);
  const isLighter = dish.healthStyles?.includes("lighter") || ["grilled", "baked", "skillet", "pan-seared"].includes(dish.cookingMethod);

  if (normalizedConditions.has("weightLoss")) {
    score += isLighter ? 10 : -4;
    score += isProteinForward ? 6 : 0;
    score += isHeavyStarchDish ? -10 : 0;
    hits.push("goal-weight-loss");
  }

  if (normalizedConditions.has("diabetes")) {
    score += isProteinForward ? 6 : 0;
    score += isHeavyStarchDish ? -12 : 0;
    score += dish.healthStyles?.includes("balanced") ? 4 : 0;
    hits.push("condition-diabetes");
  }

  if (normalizedConditions.has("highBloodPressure")) {
    score += dish.healthStyles?.includes("lower-sodium") ? 8 : 0;
    score += /\b(shawarma|quesadillas)\b/.test(lowerDish) ? -5 : 0;
    hits.push("condition-low-sodium");
  }

  if (normalizedConditions.has("cholesterol")) {
    score += isLighter ? 6 : -3;
    score += /\b(fried|bechamel)\b/.test(dish.cookingMethod + lowerDish) ? -6 : 0;
    hits.push("condition-heart-friendly");
  }

  if (normalizedConditions.has("weightGain")) {
    score += isHeavyStarchDish ? 8 : 2;
    hits.push("goal-higher-calorie");
  }

  if (calorieTarget && calorieTarget <= 1500 && isHeavyStarchDish) {
    score -= 8;
  }

  return score;
}

function scoreAllergenSafety(dish: DishBlueprint, allergens: string[], hits: string[]) {
  if (!allergens.length) return 0;
  const lowerDish = normalizeDishKey(dish.dishName);
  const lowerVisuals = normalizeDishKey(dish.visualKeywords.join(" "));
  let score = 0;

  for (const allergen of allergens) {
    const key = normalizeDishKey(allergen);
    if (!key) continue;
    if (lowerDish.includes(key) || lowerVisuals.includes(key)) {
      score -= 120;
    }
  }

  if (score >= 0) {
    hits.push("allergen-screened");
  }

  return score;
}

function scoreIngredientIntent(dish: DishBlueprint, normalizedIngredients: string[], hits: string[]) {
  const lowerDish = normalizeDishKey(dish.dishName);
  let score = 0;

  if (includesIngredient(normalizedIngredients, "ground meat")) {
    if (/\b(hawawshi|kofta|taagen kofta|macarona bechamel|moussaka|tagliatelle al ragu|ragu|kibbeh|keema|picadillo|meatloaf|sloppy joe|chili|mapo tofu|larb gai|pad krapow|kofte|adana kebab|manti|lahmacun)\b/.test(lowerDish)) {
      score += 18;
      hits.push("intent-ground-meat");
    }
  }

  if (includesIngredient(normalizedIngredients, "chicken")) {
    if (/\b(farakh meshwi|chicken molokhia|chicken fattah|chicken negresco|taagen chicken|shish tawook|chicken souvlaki|butter chicken|tandoori chicken|tinga de pollo|fried chicken|chicken pot pie|kung pao chicken|gai yang|tavuk sis|pollo cacciatore|chicken piccata|teriyaki chicken|basil chicken|arroz con pollo|shawarma plate)\b/.test(lowerDish)) {
      score += 18;
      hits.push("intent-chicken");
    }
  }

  if (includesIngredient(normalizedIngredients, "egg")) {
    if (/\b(shakshuka|frittata|omelette|huevos rancheros|thai omelette|breakfast hash)\b/.test(lowerDish)) {
      score += 12;
      hits.push("intent-egg");
    }
  }

  if (includesIngredient(normalizedIngredients, "lentil")) {
    if (/\b(koshary|mujadara|dal|lentil soup)\b/.test(lowerDish)) {
      score += 13;
      hits.push("intent-lentil");
    }
  }

  if (includesIngredient(normalizedIngredients, "fish")) {
    if (/\b(sayadeya|samak singari|egyptian fish tagine|pesce all acqua pazza|samak harra|baked white fish|fish curry|pescado a la veracruzana|blackened fish|miso salmon|pla rad prik|levrek bugulama|balik ekmek)\b/.test(lowerDish)) {
      score += 14;
      hits.push("intent-fish");
    }
  }

  if (includesIngredient(normalizedIngredients, "shrimp")) {
    if (/\b(alexandrian shrimp|seafood sayadeya|shrimp scampi|shrimp sayadieh|shrimp saganaki|seafood paella|prawn masala|aguachile|shrimp and grits|garlic honey shrimp|tom yum shrimp|thai garlic shrimp|goong ob woon sen|karides guvec|shrimp linguine|garlic shrimp pasta|camarones al ajo)\b/.test(lowerDish)) {
      score += 15;
      hits.push("intent-shrimp");
    }
  }

  if (includesIngredient(normalizedIngredients, "seafood")) {
    if (/\b(seafood sayadeya|seafood paella|shrimp sayadieh|shrimp saganaki|tom yum shrimp|goong ob woon sen|karides guvec|prawn masala|aguachile)\b/.test(lowerDish)) {
      score += 14;
      hits.push("intent-seafood");
    }
  }

  if (includesIngredient(normalizedIngredients, "pasta") && /\b(macarona bechamel|pomodoro|arrabbiata)\b/.test(lowerDish)) {
    score += 10;
    hits.push("intent-pasta");
  }

  return score;
}

function scoreSparseCuisineIntent(
  dish: DishBlueprint,
  normalizedIngredients: string[],
  preferredCuisine: string,
  hits: string[]
) {
  const lowerDish = normalizeDishKey(dish.dishName);
  let score = 0;
  const hasPastaSignal =
    includesIngredient(normalizedIngredients, "pasta") ||
    includesIngredient(normalizedIngredients, "spaghetti") ||
    includesIngredient(normalizedIngredients, "shell pasta") ||
    includesIngredient(normalizedIngredients, "macaroni");

  if (preferredCuisine === "egyptian" && hasPastaSignal && /\bmacarona bechamel\b/.test(lowerDish)) {
    score += 18;
    hits.push("sparse-egyptian-pasta-bechamel");
  }

  if (preferredCuisine === "egyptian" && includesIngredient(normalizedIngredients, "chicken")) {
    if (/\b(farakh meshwi|chicken molokhia|chicken fattah|chicken negresco)\b/.test(lowerDish)) {
      score += 16;
      hits.push("sparse-egyptian-chicken-plate");
    }
  }

  if (preferredCuisine === "egyptian" && includesIngredient(normalizedIngredients, "fish")) {
    if (/\b(sayadeya|samak singari|egyptian fish tagine)\b/.test(lowerDish)) {
      score += 16;
      hits.push("sparse-egyptian-fish-plate");
    }
  }

  if (preferredCuisine === "egyptian" && includesIngredient(normalizedIngredients, "shrimp")) {
    if (/\b(alexandrian shrimp|seafood sayadeya)\b/.test(lowerDish)) {
      score += 16;
      hits.push("sparse-egyptian-shrimp-plate");
    }
  }

  return score;
}

function scoreCookingSimplicity(dish: DishBlueprint, hits: string[]) {
  const supportCount = dish.supportAnchors?.length ?? 0;
  const score = Math.max(0, 8 - Math.min(supportCount, 6));
  if (score >= 5) {
    hits.push("easy-to-execute");
  }
  return score;
}

function inferMealType(recipe: Recipe, candidate?: DishCandidate): RecipeMealType {
  if (candidate?.mealType) return candidate.mealType;
  const haystack = normalizeDishKey(`${recipe.name} ${recipe.steps.join(" ")}`);
  if (/\b(breakfast|egg|eggs|omelette|shakshuka|ful|taameya|rancheros|hash)\b/.test(haystack)) return "breakfast";
  if (/\b(snack|quesadilla)\b/.test(haystack)) return "snack";
  if (/\b(soup|salad)\b/.test(haystack)) return "lunch";
  return "dinner";
}

function inferCookingMethod(recipe: Recipe, candidate?: DishCandidate) {
  if (candidate?.cookingMethod) return candidate.cookingMethod;
  const haystack = normalizeDishKey(`${recipe.name} ${recipe.steps.join(" ")}`);
  if (/\bgrill|grilled\b/.test(haystack)) return "grilled";
  if (/\bbake|baked|oven\b/.test(haystack)) return "baked";
  if (/\bfry|fried|crispy\b/.test(haystack)) return "fried";
  if (/\bstir fry|stir-fried|wok\b/.test(haystack)) return "stir-fried";
  if (/\bsimmer|stew|soup\b/.test(haystack)) return "simmered";
  if (/\bskillet|pan\b/.test(haystack)) return "skillet";
  return "assembled";
}

function inferDietType(recipe: Recipe, diets: string[]) {
  if (diets.length) return diets.join(", ");
  const hits = normalizePreferenceHits(recipe.preference_hits);
  const firstDietHit = hits.find((hit) => /\b(vegan|vegetarian|keto|gluten|dairy|high-protein|low-carb)\b/i.test(hit));
  return firstDietHit;
}

function normalizePreferenceHits(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((hit): hit is string => typeof hit === "string" && hit.trim().length > 0);
}

function extractVisualKeywords(recipe: Recipe) {
  const keywords = [recipe.name, recipe.image_search_index, ...(recipe.image_search_indices ?? [])]
    .filter(Boolean)
    .flatMap((value) => String(value).split(/[|,]/))
    .map((value) => normalizeSearchPhrase(value))
    .filter((value) => value.length >= 3);
  return uniqueKeywords(keywords);
}

function inferExcludeKeywords(recipe: Recipe) {
  const haystack = normalizeDishKey(recipe.name);
  const excludes = ["dessert", "cookie", "cake"];

  if (/\bfish\b/.test(haystack)) excludes.push("beef", "chicken");
  if (/\bchicken\b/.test(haystack)) excludes.push("fish", "shrimp");
  if (/\bshrimp\b/.test(haystack)) excludes.push("beef", "chicken");
  if (/\bred sauce|pomodoro|arrabbiata|tomato\b/.test(haystack)) excludes.push("white sauce", "alfredo");
  if (/\bwhite sauce|alfredo|bechamel|creamy\b/.test(haystack)) excludes.push("red sauce", "tomato pasta");

  return excludes;
}

function countMatches(availableIngredients: string[], anchors: string[]) {
  return anchors.reduce((count, anchor) => count + (includesIngredient(availableIngredients, anchor) ? 1 : 0), 0);
}

function countStructuralAnchorMisses(anchors: string[], availableIngredients: string[]) {
  return anchors.reduce((count, anchor) => {
    if (!isStructuralAnchor(anchor)) return count;
    return count + (includesIngredient(availableIngredients, anchor) ? 0 : 1);
  }, 0);
}

function isStructuralAnchor(anchor: string) {
  return /\b(pasta|rice|bread|pita|flatbread|tortilla|noodle|eggplant|bell pepper|fish|shrimp|mussel|mussels)\b/i.test(anchor);
}

function includesIngredient(availableIngredients: string[], anchor: string) {
  const normalizedAnchor = normalizeIngredient(anchor);
  return availableIngredients.some(
    (ingredient) =>
      ingredient === normalizedAnchor ||
      ingredient.includes(normalizedAnchor) ||
      isSafeReverseIngredientMatch(normalizedAnchor, ingredient)
  );
}

function isSafeReverseIngredientMatch(normalizedAnchor: string, ingredient: string) {
  if (!ingredient || !normalizedAnchor.includes(ingredient)) return false;
  if (ingredient === "fish" && /\bfish sauce\b/.test(normalizedAnchor)) return false;
  if (ingredient === "chicken" && /\bchicken stock|chicken broth\b/.test(normalizedAnchor)) return false;
  return ingredient.split(/\s+/).length > 1 || /^(bread|pita|flatbread|rice|pasta|noodle|pepper|bean|meat)$/.test(ingredient);
}

function normalizeIngredientList(ingredients: string[]) {
  return uniqueKeywords(ingredients.map(normalizeIngredient).filter(Boolean));
}

function normalizeIngredient(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+-\s+.*$/, "")
    .replace(/\b\d+(?:\/\d+)?\b/g, " ")
    .replace(/\b(cup|cups|tbsp|tsp|g|gram|grams|kg|lb|oz|can|cans|large|small|medium|whole|clove|cloves|fresh|cooked|dry|rinsed|drained|chopped|diced|sliced|pressed|crumbled|optional)\b/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCuisineKey(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z]/g, "");
  return normalized || "any";
}

function normalizeDishKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSearchPhrase(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function joinSearchTerms(...values: string[]) {
  return normalizeSearchPhrase(values.filter(Boolean).join(" "));
}

function uniqueKeywords(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
