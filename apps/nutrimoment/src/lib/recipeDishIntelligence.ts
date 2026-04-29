import { normalizeCuisineLabel } from "@/lib/cuisines";
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
  }
];

export function buildCuisineAwareDishCandidates(context: DishCandidateContext): DishCandidate[] {
  const normalizedIngredients = normalizeIngredientList(context.availableIngredients ?? []);
  const cuisineKey = normalizeCuisineKey(context.preferredCuisine ?? "Any");
  const candidatePool =
    cuisineKey === "any"
      ? DISH_BLUEPRINTS
      : DISH_BLUEPRINTS.filter((dish) => normalizeCuisineKey(dish.cuisine) === cuisineKey);

  return candidatePool
    .map((dish) => scoreDishBlueprint(dish, normalizedIngredients, context))
    .filter((candidate) => candidate.score > 0)
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
  const trustedCandidate = candidates.find((candidate) => Boolean(shouldTrustCandidate(recipe, candidate, inferredMealType)));
  const mealType = trustedCandidate?.mealType ?? inferredMealType;
  const cookingMethod = trustedCandidate?.cookingMethod ?? inferredCookingMethod;
  const dishIntent: RecipeDishIntent = {
    dish_name: trustedCandidate?.dishName ?? recipe.name,
    cuisine: trustedCandidate?.cuisine ?? normalizeCuisineLabel(recipe.cuisine),
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
    cuisine: dishIntent.cuisine || recipe.cuisine,
    dish_intent: dishIntent,
    image_search_index: photoQueries[0] ?? recipe.image_search_index,
    image_search_indices: photoQueries.length ? photoQueries : recipe.image_search_indices,
    preference_hits: uniqueKeywords([...(recipe.preference_hits ?? []), ...(trustedCandidate?.hits ?? [])]).slice(0, 6)
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
  if (hasIntentSignal && mealTypeMatch) return candidate;
  if (moderateAnchorFit && mealTypeMatch && candidate.score >= 110) return candidate;
  return undefined;
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
    if (/\b(hawawshi|kofta|macarona bechamel|moussaka|keema|meatloaf|chili|pad krapow|kofte|adana kebab)\b/.test(lowerDish)) {
      score += 18;
      hits.push("intent-ground-meat");
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
    if (/\b(sayadeya|fish curry|baked white fish|balik ekmek)\b/.test(lowerDish)) {
      score += 14;
      hits.push("intent-fish");
    }
  }

  if (includesIngredient(normalizedIngredients, "shrimp")) {
    if (/\b(shrimp linguine|garlic shrimp pasta|camarones al ajo|garlic honey shrimp|tom yum shrimp|thai garlic shrimp)\b/.test(lowerDish)) {
      score += 15;
      hits.push("intent-shrimp");
    }
  }

  if (includesIngredient(normalizedIngredients, "pasta") && /\b(macarona bechamel|pomodoro|arrabbiata)\b/.test(lowerDish)) {
    score += 10;
    hits.push("intent-pasta");
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
  const hits = recipe.preference_hits ?? [];
  const firstDietHit = hits.find((hit) => /\b(vegan|vegetarian|keto|gluten|dairy|high-protein|low-carb)\b/i.test(hit));
  return firstDietHit;
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
      normalizedAnchor.includes(ingredient)
  );
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
