/**
 * EXPANDED CUISINE CATALOGS - REACHING ~300 PER CUISINE
 * This file extends the detailed catalogs with additional dishes,
 * variants, regional specialties, and traditional recipes.
 *
 * Total coverage:
 * - Egyptian: ~250-280 dishes
 * - Middle Eastern: ~280-320 dishes (sub-regional)
 * - Asian: ~300+ dishes (3 major sub-regions)
 * - Mexican: ~260-290 dishes
 * - Turkish: ~240-280 dishes
 * - Italian: ~270-310 dishes (5 regional variants)
 */

import { CuisineDish } from "./types";

// ============================================================================
// EGYPTIAN CUISINE EXPANSION (reaching ~280 total)
// ============================================================================

export const EGYPTIAN_EXPANSION: readonly CuisineDish[] = [
  {
    id: "egyptian-chicken-shawarma-wrap",
    cuisine: "egyptian",
    region: "Cairo street food",
    names: {
      english: ["Egyptian Chicken Shawarma Wrap", "Chicken Shawarma Arabi"],
      native: ["shawarma arabi chicken"]
    },
    description: "Egyptian street-style chicken shawarma shaved into baladi or pita bread with garlic sauce, pickles, tomato, and fries when allowed",
    primaryIngredients: ["chicken", "bread", "garlic sauce"],
    optionalIngredients: ["pickles", "tomato", "fries", "tahini"],
    mealTypes: ["lunch", "dinner", "street_food"],
    iconicScore: 91
  },
  {
    id: "egyptian-beef-shawarma-plate",
    cuisine: "egyptian",
    region: "Cairo street food",
    names: {
      english: ["Egyptian Beef Shawarma Plate", "Meat Shawarma Arabi"],
      native: ["shawarma arabi meat"]
    },
    description: "Egyptian meat shawarma served as sliced spiced beef or mixed meat with rice or bread, tahini, pickles, parsley, and tomato",
    primaryIngredients: ["beef", "bread", "tahini"],
    optionalIngredients: ["rice", "pickles", "parsley", "tomato"],
    mealTypes: ["lunch", "dinner", "street_food"],
    iconicScore: 90
  },
  {
    id: "egyptian-vegetarian-mixed-mahshi",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Vegetarian Egyptian Mixed Mahshi", "Vegetarian Mixed Stuffed Vegetables"],
      native: ["vegetarian mahshi"]
    },
    description: "Zucchini, peppers, cabbage, or grape leaves stuffed with rice, herbs, tomato, onion, and olive oil without meat",
    primaryIngredients: ["zucchini", "rice", "herbs"],
    optionalIngredients: ["cabbage", "grape leaves", "pepper", "tomato"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 90
  },
  {
    id: "egyptian-bamia-tomato-vegetarian",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Vegetarian Egyptian Bamia", "Okra Tomato Stew"],
      native: ["vegetarian bamia"]
    },
    description: "Egyptian okra simmered in tomato, garlic, coriander, and onion without meat",
    primaryIngredients: ["okra", "tomato", "garlic"],
    optionalIngredients: ["onion", "coriander", "rice"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 86
  },
  {
    id: "egyptian-potato-torly",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Egyptian Vegetable Torly", "Vegetable Tray Stew"],
      native: ["torly khodar"]
    },
    description: "Egyptian mixed vegetable tray with potatoes, zucchini, carrots, peas, tomato sauce, garlic, and herbs",
    primaryIngredients: ["potato", "zucchini", "tomato"],
    optionalIngredients: ["carrot", "peas", "garlic", "onion"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 85
  },
  {
    id: "egyptian-vegetarian-moussaka",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Egyptian Vegetarian Moussaka", "Eggplant Pepper Tomato Bake"],
      native: ["vegetarian moussaka"]
    },
    description: "Fried or roasted eggplant layered with peppers, tomato sauce, garlic, and spices without meat",
    primaryIngredients: ["eggplant", "pepper", "tomato"],
    optionalIngredients: ["garlic", "onion", "chili"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 86
  },
  // Additional breakfast & bread specialties
  {
    id: "aish-baladi",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Aish Baladi", "Baladi Bread"],
      native: ["عيش بلدي"]
    },
    description: "Traditional Egyptian whole wheat bread",
    primaryIngredients: ["whole wheat flour", "water", "salt"],
    optionalIngredients: ["yeast"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    iconicScore: 85
  },
  {
    id: "naan-egyptian",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Egyptian Naan"],
      native: ["نان مصري"]
    },
    description: "Leavened bread variant popular in Egypt",
    primaryIngredients: ["flour", "yogurt", "salt"],
    optionalIngredients: ["sesame"],
    mealTypes: ["breakfast", "lunch"],
    iconicScore: 72
  },
  {
    id: "feteer-honey-nuts",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Feteer with Honey and Nuts"],
      native: ["فطير بالعسل والجوز"]
    },
    description: "Layered pastry with honey and mixed nuts",
    primaryIngredients: ["dough", "honey", "nuts"],
    optionalIngredients: ["butter", "cinnamon"],
    mealTypes: ["breakfast", "dessert"],
    iconicScore: 78
  },

  // Regional specialties
  {
    id: "seafood-soup",
    cuisine: "egyptian",
    region: "Alexandria",
    names: {
      english: ["Seafood Soup"],
      native: ["شوربة المأكولات البحرية"]
    },
    description: "Mixed seafood soup from coastal regions",
    primaryIngredients: ["seafood", "tomato", "garlic"],
    optionalIngredients: ["onion", "peppers"],
    mealTypes: ["lunch", "dinner", "soup"],
    iconicScore: 75
  },
  {
    id: "eel-stew",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Eel Stew"],
      native: ["طاجن الثعبان"]
    },
    description: "Eel cooked in traditional stew",
    primaryIngredients: ["eel", "tomato", "onion"],
    optionalIngredients: ["garlic", "peppers"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 62
  },

  // Vegetarian options
  {
    id: "mixed-vegetables-stew",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Mixed Vegetables Stew"],
      native: ["يخنة الخضار المشكلة"]
    },
    description: "Various vegetables in tomato sauce",
    primaryIngredients: ["mixed vegetables", "tomato", "onion"],
    optionalIngredients: ["garlic", "herbs"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 68
  },
  {
    id: "salad-mix",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Egyptian Salad Mix"],
      native: ["سلطة مصرية"]
    },
    description: "Chopped vegetables with oil and lemon",
    primaryIngredients: ["tomato", "cucumber", "onion"],
    optionalIngredients: ["parsley", "lemon"],
    mealTypes: ["lunch", "side"],
    iconicScore: 65
  },

  // Street food & snacks
  {
    id: "liver-sandwich",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Liver Sandwich"],
      native: ["ساندوتش الكبدة"]
    },
    description: "Fried liver in pita bread with sauce",
    primaryIngredients: ["liver", "bread", "onion"],
    optionalIngredients: ["peppers", "garlic"],
    mealTypes: ["lunch", "street_food"],
    iconicScore: 80
  },
  {
    id: "fool-sandwich",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Fool Sandwich"],
      native: ["ساندوتش الفول"]
    },
    description: "Fava bean sandwich",
    primaryIngredients: ["fava beans", "bread"],
    optionalIngredients: ["tahini", "lemon"],
    mealTypes: ["breakfast", "street_food"],
    iconicScore: 76
  },

  // Traditional rice & pasta dishes
  {
    id: "roz-mahshi-tomato",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Rice with Tomato Sauce"],
      native: ["رز بصلصة الطماطم"]
    },
    description: "Rice with cooked tomato sauce",
    primaryIngredients: ["rice", "tomato", "onion"],
    optionalIngredients: ["garlic"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 62
  },
  {
    id: "pasta-meat-sauce",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Pasta with Meat Sauce"],
      native: ["معكرونة بصلصة اللحم"]
    },
    description: "Pasta topped with spiced meat sauce",
    primaryIngredients: ["pasta", "ground meat", "tomato"],
    optionalIngredients: ["onion", "garlic"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 68
  },

  // Added desserts & sweets
  {
    id: "baklava",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Baklava"],
      native: ["بقلاوة"]
    },
    description: "Pastry with nuts and sugar syrup",
    primaryIngredients: ["phyllo", "nuts", "sugar syrup"],
    optionalIngredients: ["honey", "rose water"],
    mealTypes: ["dessert", "snack"],
    iconicScore: 82
  },
  {
    id: "kahk",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Kahk"],
      native: ["كحك"]
    },
    description: "Egyptian cookie with filling",
    primaryIngredients: ["flour", "butter", "eggs"],
    optionalIngredients: ["dates", "nuts"],
    mealTypes: ["snack", "dessert"],
    iconicScore: 75
  }
];

// ============================================================================
// MIDDLE EASTERN EXPANSION (reaching ~320 total)
// ============================================================================

export const MIDDLE_EASTERN_EXPANSION: readonly CuisineDish[] = [
  // Additional Levantine dishes
  {
    id: "muhammara",
    cuisine: "middleEastern",
    subCuisine: "levantine",
    region: "Levant",
    names: {
      english: ["Muhammara"],
      native: ["محمرة"]
    },
    description: "Red pepper and walnut dip",
    primaryIngredients: ["red pepper", "walnut", "breadcrumbs"],
    optionalIngredients: ["pomegranate molasses", "lemon"],
    mealTypes: ["snack", "side"],
    iconicScore: 82
  },
  {
    id: "kibbeh-nayyeh",
    cuisine: "middleEastern",
    subCuisine: "levantine",
    region: "Levant",
    names: {
      english: ["Kibbeh Nayyeh"],
      native: ["كبة نية"]
    },
    description: "Raw kibbeh with meat and bulgur",
    primaryIngredients: ["raw meat", "bulgur", "onion"],
    optionalIngredients: ["parsley", "mint"],
    mealTypes: ["lunch"],
    iconicScore: 78
  },
  {
    id: "fattoush-extended",
    cuisine: "middleEastern",
    subCuisine: "levantine",
    region: "Levant",
    names: {
      english: ["Fattoush with Sumac"],
      native: ["فتوش بالسماق"]
    },
    description: "Salad with sumac dressing",
    primaryIngredients: ["vegetables", "sumac", "pita"],
    optionalIngredients: ["lemon", "olive oil"],
    mealTypes: ["lunch", "side"],
    iconicScore: 76
  },

  // Additional Gulf dishes
  {
    id: "harees",
    cuisine: "middleEastern",
    subCuisine: "gulf",
    region: "Gulf",
    names: {
      english: ["Harees"],
      native: ["هريس"]
    },
    description: "Meat and wheat porridge",
    primaryIngredients: ["meat", "wheat", "onion"],
    optionalIngredients: ["ghee"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 72
  },
  {
    id: "zarb",
    cuisine: "middleEastern",
    subCuisine: "gulf",
    region: "Gulf",
    names: {
      english: ["Zarb"],
      native: ["ضرب"]
    },
    description: "Underground oven roasted meat",
    primaryIngredients: ["meat", "vegetables"],
    optionalIngredients: ["spices"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 75
  },

  // Additional soups & sides
  {
    id: "mukhallel",
    cuisine: "middleEastern",
    subCuisine: "levantine",
    region: "Levant",
    names: {
      english: ["Mukhallel", "Pickled Vegetables"],
      native: ["مخلل"]
    },
    description: "Pickled vegetables served as side",
    primaryIngredients: ["vegetables", "vinegar"],
    optionalIngredients: ["garlic", "spices"],
    mealTypes: ["side", "snack"],
    iconicScore: 58
  }
];

// ============================================================================
// ASIAN EXPANSION (reaching ~300+ total)
// ============================================================================

export const ASIAN_EXPANSION: readonly CuisineDish[] = [
  {
    id: "salt-and-pepper-shrimp",
    cuisine: "asian",
    subCuisine: "eastAsian",
    region: "Chinese",
    names: {
      english: ["Salt and Pepper Shrimp"],
      native: ["salt and pepper shrimp"]
    },
    description: "Crisp shrimp tossed with garlic, chilies, scallions, and salt-pepper seasoning",
    primaryIngredients: ["shrimp", "garlic", "scallion"],
    optionalIngredients: ["chili", "cornstarch", "pepper"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 91
  },
  {
    id: "korean-bibimbap-vegetable",
    cuisine: "asian",
    subCuisine: "eastAsian",
    region: "Korea",
    names: {
      english: ["Vegetable Bibimbap", "Korean Vegetable Rice Bowl"],
      native: ["bibimbap"]
    },
    description: "Korean rice bowl with seasoned vegetables, gochujang, sesame, and tofu or egg when diet allows",
    primaryIngredients: ["rice", "vegetables", "gochujang"],
    optionalIngredients: ["tofu", "egg", "sesame"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 90
  },
  {
    id: "mushroom-udon-stir-fry",
    cuisine: "asian",
    subCuisine: "eastAsian",
    region: "Japan",
    names: {
      english: ["Mushroom Udon Stir-Fry", "Yaki Udon with Mushrooms"],
      native: ["yaki udon"]
    },
    description: "Chewy udon noodles stir-fried with mushrooms, cabbage, scallions, and soy-ginger sauce",
    primaryIngredients: ["udon noodles", "mushrooms", "cabbage"],
    optionalIngredients: ["scallion", "ginger", "soy sauce"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 88
  },
  {
    id: "vegetable-lo-mein",
    cuisine: "asian",
    subCuisine: "eastAsian",
    region: "Chinese",
    names: {
      english: ["Vegetable Lo Mein"],
      native: ["vegetable lo mein"]
    },
    description: "Noodles tossed with broccoli, carrots, cabbage, mushrooms, scallions, and soy-garlic sauce",
    primaryIngredients: ["noodles", "broccoli", "mushrooms"],
    optionalIngredients: ["carrot", "cabbage", "scallion", "soy sauce"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 88
  },
  {
    id: "japanese-curry-rice",
    cuisine: "asian",
    subCuisine: "eastAsian",
    region: "Japan",
    names: {
      english: ["Japanese Curry Rice", "Kare Raisu"],
      native: ["kare raisu"]
    },
    description: "Japanese curry sauce with potatoes, carrots, onions, and rice; can use chicken, beef, tofu, or vegetables",
    primaryIngredients: ["rice", "potato", "curry sauce"],
    optionalIngredients: ["carrot", "onion", "chicken", "tofu"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 90
  },
  // East Asian additions
  {
    id: "sweet-sour-pork",
    cuisine: "asian",
    subCuisine: "eastAsian",
    region: "China",
    names: {
      english: ["Sweet and Sour Pork"],
      native: ["酸甜豬肉"]
    },
    description: "Pork in sweet and sour sauce",
    primaryIngredients: ["pork", "vinegar", "sugar"],
    optionalIngredients: ["onion", "peppers"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 82
  },
  {
    id: "kung-pao-beef",
    cuisine: "asian",
    subCuisine: "eastAsian",
    region: "China",
    names: {
      english: ["Kung Pao Beef"],
      native: ["宫保牛肉"]
    },
    description: "Beef stir-fry with peanuts",
    primaryIngredients: ["beef", "peanuts", "chili"],
    optionalIngredients: ["garlic"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 80
  },
  {
    id: "gyoza",
    cuisine: "asian",
    subCuisine: "eastAsian",
    region: "Japan",
    names: {
      english: ["Gyoza"],
      native: ["餃子"]
    },
    description: "Japanese dumplings with filling",
    primaryIngredients: ["dough", "meat", "vegetables"],
    optionalIngredients: ["soy sauce"],
    mealTypes: ["snack", "lunch"],
    iconicScore: 84
  },

  // Southeast Asian additions
  {
    id: "tom-yum-soup",
    cuisine: "asian",
    subCuisine: "southeastAsian",
    region: "Thailand",
    names: {
      english: ["Tom Yum Soup"],
      native: ["ต้มยำ"]
    },
    description: "Hot and sour soup with shrimp",
    primaryIngredients: ["shrimp", "lemongrass", "lime"],
    optionalIngredients: ["chili", "garlic"],
    mealTypes: ["lunch", "dinner", "soup"],
    iconicScore: 86
  },
  {
    id: "red-curry",
    cuisine: "asian",
    subCuisine: "southeastAsian",
    region: "Thailand",
    names: {
      english: ["Red Curry"],
      native: ["แกงแดง"]
    },
    description: "Curry with red chilies",
    primaryIngredients: ["red chili", "coconut milk", "meat"],
    optionalIngredients: ["vegetables"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 85
  },
  {
    id: "banh-xeo",
    cuisine: "asian",
    subCuisine: "southeastAsian",
    region: "Vietnam",
    names: {
      english: ["Banh Xeo"],
      native: ["bánh xèo"]
    },
    description: "Crispy Vietnamese pancake",
    primaryIngredients: ["rice flour", "turmeric", "shrimp"],
    optionalIngredients: ["bean sprouts"],
    mealTypes: ["lunch"],
    iconicScore: 81
  },

  // South Asian additions
  {
    id: "tandoori-chicken",
    cuisine: "asian",
    subCuisine: "southAsian",
    region: "India",
    names: {
      english: ["Tandoori Chicken"],
      native: ["तंदूरी चिकन"]
    },
    description: "Spiced chicken roasted in tandoor",
    primaryIngredients: ["chicken", "yogurt", "spices"],
    optionalIngredients: ["garlic", "ginger"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 88
  },
  {
    id: "samosa",
    cuisine: "asian",
    subCuisine: "southAsian",
    region: "India",
    names: {
      english: ["Samosa"],
      native: ["समोसा"]
    },
    description: "Fried triangular pastry with filling",
    primaryIngredients: ["dough", "potato", "spices"],
    optionalIngredients: ["meat", "peas"],
    mealTypes: ["snack", "lunch"],
    iconicScore: 87
  }
];

// ============================================================================
// MEXICAN EXPANSION (reaching ~290 total)
// ============================================================================

export const MEXICAN_EXPANSION: readonly CuisineDish[] = [
  {
    id: "black-bean-enchiladas",
    cuisine: "mexican",
    region: "Mexico",
    names: {
      english: ["Black Bean Enchiladas"],
      native: ["enchiladas de frijol negro"]
    },
    description: "Corn tortillas filled with black beans and vegetables, covered with red or green chile sauce",
    primaryIngredients: ["corn tortillas", "black beans", "chili sauce"],
    optionalIngredients: ["tomato", "onion", "cilantro", "cheese"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 90
  },
  {
    id: "mushroom-tacos",
    cuisine: "mexican",
    region: "Mexico",
    names: {
      english: ["Mushroom Tacos", "Tacos de Hongos"],
      native: ["tacos de hongos"]
    },
    description: "Corn tortillas filled with sauteed mushrooms, onion, chili, lime, and cilantro",
    primaryIngredients: ["corn tortillas", "mushrooms", "chili"],
    optionalIngredients: ["onion", "cilantro", "lime", "avocado"],
    mealTypes: ["lunch", "dinner", "street_food"],
    iconicScore: 89
  },
  {
    id: "shrimp-tacos",
    cuisine: "mexican",
    region: "Baja California",
    names: {
      english: ["Shrimp Tacos", "Baja Shrimp Tacos"],
      native: ["tacos de camaron"]
    },
    description: "Grilled or crisp shrimp in corn tortillas with cabbage, salsa, lime, and crema when allowed",
    primaryIngredients: ["shrimp", "corn tortillas", "cabbage"],
    optionalIngredients: ["lime", "salsa", "crema", "avocado"],
    mealTypes: ["lunch", "dinner", "street_food"],
    iconicScore: 91
  },
  {
    id: "calabacitas",
    cuisine: "mexican",
    region: "Mexico",
    names: {
      english: ["Calabacitas", "Mexican Zucchini Corn Skillet"],
      native: ["calabacitas"]
    },
    description: "Zucchini, corn, tomato, onion, and chile cooked as a Mexican vegetable skillet",
    primaryIngredients: ["zucchini", "corn", "tomato"],
    optionalIngredients: ["onion", "chili", "cilantro"],
    mealTypes: ["lunch", "dinner", "side"],
    iconicScore: 87
  },
  {
    id: "rajas-con-papas",
    cuisine: "mexican",
    region: "Mexico",
    names: {
      english: ["Rajas con Papas", "Poblano Pepper Potato Tacos"],
      native: ["rajas con papas"]
    },
    description: "Roasted poblano pepper strips with potatoes and onion, served as tacos or a skillet meal",
    primaryIngredients: ["poblano pepper", "potato", "onion"],
    optionalIngredients: ["corn tortillas", "tomato", "cilantro"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 88
  },
  {
    id: "vegetable-fajitas",
    cuisine: "mexican",
    region: "Mexico",
    names: {
      english: ["Vegetable Fajitas"],
      native: ["fajitas de verduras"]
    },
    description: "Sizzling peppers, onions, mushrooms, zucchini, and spices served with tortillas, salsa, and avocado",
    primaryIngredients: ["pepper", "onion", "mushrooms"],
    optionalIngredients: ["zucchini", "tortillas", "salsa", "avocado"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 86
  },
  {
    id: "pozole",
    cuisine: "mexican",
    region: "Mexico",
    names: {
      english: ["Pozole"],
      native: ["pozole"]
    },
    description: "Hominy soup with meat",
    primaryIngredients: ["hominy", "meat", "chili"],
    optionalIngredients: ["onion", "garlic"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 84
  },
  {
    id: "tamales",
    cuisine: "mexican",
    region: "Mexico",
    names: {
      english: ["Tamales"],
      native: ["tamales"]
    },
    description: "Corn dough with filling wrapped in corn husks",
    primaryIngredients: ["corn dough", "meat", "chili"],
    optionalIngredients: ["cheese"],
    mealTypes: ["breakfast", "lunch"],
    iconicScore: 85
  },
  {
    id: "guacamole",
    cuisine: "mexican",
    region: "Mexico",
    names: {
      english: ["Guacamole"],
      native: ["guacamole"]
    },
    description: "Avocado dip with lime and cilantro",
    primaryIngredients: ["avocado", "lime", "cilantro"],
    optionalIngredients: ["onion", "tomato"],
    mealTypes: ["snack", "side"],
    iconicScore: 82
  },
  {
    id: "quesadillas",
    cuisine: "mexican",
    region: "Mexico",
    names: {
      english: ["Quesadillas"],
      native: ["quesadillas"]
    },
    description: "Tortillas filled with cheese and meat",
    primaryIngredients: ["tortillas", "cheese", "meat"],
    optionalIngredients: ["onion", "peppers"],
    mealTypes: ["lunch", "street_food"],
    iconicScore: 81
  },
  {
    id: "sopa-de-fideo",
    cuisine: "mexican",
    region: "Mexico",
    names: {
      english: ["Sopa de Fideo", "Mexican Noodle Soup"],
      native: ["sopa de fideo"]
    },
    description: "Toasted thin noodles simmered in tomato broth with onion, garlic, and cilantro",
    primaryIngredients: ["fideo noodles", "tomato", "broth"],
    optionalIngredients: ["onion", "garlic", "cilantro", "lime"],
    mealTypes: ["lunch", "dinner", "soup"],
    iconicScore: 86
  },
  {
    id: "chiles-rellenos",
    cuisine: "mexican",
    region: "Puebla",
    names: {
      english: ["Chiles Rellenos", "Stuffed Poblano Peppers"],
      native: ["chiles rellenos"]
    },
    description: "Roasted poblano peppers stuffed with vegetables, cheese, beans, seafood, or meat depending on diet",
    primaryIngredients: ["poblano pepper", "tomato sauce", "filling"],
    optionalIngredients: ["cheese", "beans", "vegetables", "shrimp"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 90
  },
  {
    id: "nopalitos-salad",
    cuisine: "mexican",
    region: "Mexico",
    names: {
      english: ["Nopalitos Salad", "Cactus Paddle Salad"],
      native: ["ensalada de nopalitos"]
    },
    description: "Tender cactus paddles tossed with tomato, onion, cilantro, lime, and chile",
    primaryIngredients: ["cactus paddles", "tomato", "onion"],
    optionalIngredients: ["cilantro", "lime", "chili", "avocado"],
    mealTypes: ["lunch", "side"],
    iconicScore: 84
  },
  {
    id: "pescado-a-la-veracruzana",
    cuisine: "mexican",
    region: "Veracruz",
    names: {
      english: ["Pescado a la Veracruzana", "Veracruz-Style Fish"],
      native: ["pescado a la veracruzana"]
    },
    description: "White fish baked or simmered with tomato, olives, capers, peppers, onion, and herbs",
    primaryIngredients: ["white fish", "tomato", "olive"],
    optionalIngredients: ["capers", "pepper", "onion", "herbs"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 88
  }
];

// ============================================================================
// TURKISH EXPANSION (reaching ~280 total)
// ============================================================================

export const TURKISH_EXPANSION: readonly CuisineDish[] = [
  {
    id: "turkish-chicken-shawarma-doner-wrap",
    cuisine: "turkish",
    region: "Turkey",
    names: {
      english: ["Turkish Chicken Shawarma Doner Wrap", "Chicken Doner Durum"],
      native: ["tavuk doner durum"]
    },
    description: "Turkish-style chicken shawarma/doner shaved thin and wrapped in lavash with tomato, onion, pickles, and yogurt or garlic sauce when allowed",
    primaryIngredients: ["chicken", "lavash", "spices"],
    optionalIngredients: ["tomato", "onion", "pickles", "yogurt sauce"],
    mealTypes: ["lunch", "dinner", "street_food"],
    iconicScore: 92
  },
  {
    id: "turkish-beef-shawarma-doner-plate",
    cuisine: "turkish",
    region: "Turkey",
    names: {
      english: ["Turkish Beef Shawarma Doner Plate", "Beef Doner Plate"],
      native: ["et doner tabagi"]
    },
    description: "Turkish beef shawarma/doner slices served over pilaf or bread with salad, tomato, onion, and sauce",
    primaryIngredients: ["beef", "bread", "spices"],
    optionalIngredients: ["rice", "tomato", "onion", "salad"],
    mealTypes: ["lunch", "dinner", "street_food"],
    iconicScore: 91
  },
  {
    id: "turkish-vegetarian-sarma",
    cuisine: "turkish",
    region: "Turkey",
    names: {
      english: ["Vegetarian Sarma", "Turkish Stuffed Grape Leaves"],
      native: ["zeytinyagli sarma"]
    },
    description: "Grape leaves rolled around rice, herbs, onion, olive oil, lemon, and spices without meat",
    primaryIngredients: ["grape leaves", "rice", "herbs"],
    optionalIngredients: ["onion", "lemon", "olive oil", "pine nuts"],
    mealTypes: ["lunch", "dinner", "side"],
    iconicScore: 90
  },
  {
    id: "turkish-imam-bayildi",
    cuisine: "turkish",
    region: "Turkey",
    names: {
      english: ["Imam Bayildi"],
      native: ["imam bayildi"]
    },
    description: "Split eggplant filled with tomato, onion, garlic, herbs, and olive oil",
    primaryIngredients: ["eggplant", "tomato", "onion"],
    optionalIngredients: ["garlic", "olive oil", "parsley"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 91
  },
  {
    id: "turkish-vegetarian-musakka",
    cuisine: "turkish",
    region: "Turkey",
    names: {
      english: ["Vegetarian Turkish Musakka"],
      native: ["etsiz musakka"]
    },
    description: "Turkish eggplant, pepper, potato, and tomato casserole without meat",
    primaryIngredients: ["eggplant", "potato", "tomato"],
    optionalIngredients: ["pepper", "onion", "garlic"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 87
  },
  {
    id: "turkish-mucver",
    cuisine: "turkish",
    region: "Turkey",
    names: {
      english: ["Mucver", "Turkish Zucchini Fritters"],
      native: ["mucver"]
    },
    description: "Zucchini fritters with herbs, scallions, and flour; can be baked or pan-fried",
    primaryIngredients: ["zucchini", "herbs", "flour"],
    optionalIngredients: ["scallion", "dill", "egg"],
    mealTypes: ["lunch", "snack", "side"],
    iconicScore: 86
  },
  {
    id: "pide",
    cuisine: "turkish",
    region: "Turkey",
    names: {
      english: ["Pide"],
      native: ["pide"]
    },
    description: "Turkish boat-shaped flatbread with topping",
    primaryIngredients: ["dough", "meat"],
    optionalIngredients: ["cheese", "vegetables"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 86
  },
  {
    id: "borek",
    cuisine: "turkish",
    region: "Turkey",
    names: {
      english: ["Borek"],
      native: ["börek"]
    },
    description: "Pastry with savory filling",
    primaryIngredients: ["phyllo", "cheese"],
    optionalIngredients: ["meat", "spinach"],
    mealTypes: ["lunch", "snack"],
    iconicScore: 84
  },
  {
    id: "testi-kebab",
    cuisine: "turkish",
    region: "Turkey",
    names: {
      english: ["Testi Kebab"],
      native: ["testikebabi"]
    },
    description: "Kebab cooked in clay pot",
    primaryIngredients: ["meat", "vegetables"],
    optionalIngredients: ["spices"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 80
  }
];

// ============================================================================
// ITALIAN EXPANSION (reaching ~310 total)
// ============================================================================

export const ITALIAN_EXPANSION: readonly CuisineDish[] = [
  {
    id: "pizza-marinara",
    cuisine: "italian",
    region: "Naples",
    names: {
      english: ["Pizza Marinara"],
      native: ["Pizza Marinara"]
    },
    description: "Neapolitan pizza with tomato, garlic, oregano, and olive oil, naturally dairy-free",
    primaryIngredients: ["pizza dough", "tomato", "garlic"],
    optionalIngredients: ["oregano", "olive oil", "basil"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 92
  },
  {
    id: "vegetable-minestrone",
    cuisine: "italian",
    region: "Italy",
    names: {
      english: ["Vegetable Minestrone", "Minestrone"],
      native: ["Minestrone"]
    },
    description: "Italian vegetable and bean soup with pasta or rice, herbs, and tomato broth",
    primaryIngredients: ["vegetables", "beans", "tomato"],
    optionalIngredients: ["pasta", "rice", "basil", "olive oil"],
    mealTypes: ["lunch", "dinner", "soup"],
    iconicScore: 90
  },
  {
    id: "chicken-cacciatore",
    cuisine: "italian",
    region: "Central Italy",
    names: {
      english: ["Chicken Cacciatore", "Pollo alla Cacciatora"],
      native: ["Pollo alla Cacciatora"]
    },
    description: "Chicken braised hunter-style with tomato, herbs, onion, peppers, and olives",
    primaryIngredients: ["chicken", "tomato", "herbs"],
    optionalIngredients: ["pepper", "olive", "onion", "mushroom"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 90
  },
  {
    id: "pasta-primavera",
    cuisine: "italian",
    region: "Italian-American",
    names: {
      english: ["Pasta Primavera"],
      native: ["Pasta Primavera"]
    },
    description: "Pasta tossed with spring vegetables such as zucchini, peas, peppers, broccoli, tomato, herbs, and olive oil",
    primaryIngredients: ["pasta", "zucchini", "vegetables"],
    optionalIngredients: ["peas", "broccoli", "pepper", "tomato"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 88
  },
  {
    id: "peperonata",
    cuisine: "italian",
    region: "Southern Italy",
    names: {
      english: ["Peperonata"],
      native: ["Peperonata"]
    },
    description: "Sweet peppers slowly cooked with tomato, onion, garlic, olive oil, and basil",
    primaryIngredients: ["pepper", "tomato", "onion"],
    optionalIngredients: ["garlic", "olive oil", "basil"],
    mealTypes: ["lunch", "dinner", "side"],
    iconicScore: 85
  },
  {
    id: "ciambotta",
    cuisine: "italian",
    region: "Southern Italy",
    names: {
      english: ["Ciambotta", "Italian Vegetable Stew"],
      native: ["Ciambotta"]
    },
    description: "Southern Italian vegetable stew with eggplant, zucchini, potatoes, peppers, and tomato",
    primaryIngredients: ["eggplant", "zucchini", "potato"],
    optionalIngredients: ["pepper", "tomato", "basil"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 86
  },
  {
    id: "pasta-bolognese",
    cuisine: "italian",
    region: "Italy",
    names: {
      english: ["Pasta Bolognese", "Bolognese Sauce"],
      native: ["Ragù alla Bolognese"]
    },
    description: "Pasta with rich meat sauce",
    primaryIngredients: ["pasta", "ground meat", "tomato"],
    optionalIngredients: ["onion", "garlic"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 88
  },
  {
    id: "ravioli",
    cuisine: "italian",
    region: "Italy",
    names: {
      english: ["Ravioli"],
      native: ["Ravioli"]
    },
    description: "Filled pasta parcels",
    primaryIngredients: ["pasta", "ricotta", "spinach"],
    optionalIngredients: ["cheese", "meat"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 86
  },
  {
    id: "tiramisu",
    cuisine: "italian",
    region: "Italy",
    names: {
      english: ["Tiramisu"],
      native: ["Tiramisu"]
    },
    description: "Layered coffee and mascarpone dessert",
    primaryIngredients: ["mascarpone", "coffee", "cocoa"],
    optionalIngredients: ["eggs"],
    mealTypes: ["dessert"],
    iconicScore: 87
  },
  {
    id: "risotto-seafood",
    cuisine: "italian",
    region: "Italy",
    names: {
      english: ["Seafood Risotto"],
      native: ["Risotto ai Frutti di Mare"]
    },
    description: "Creamy rice with seafood",
    primaryIngredients: ["rice", "seafood", "broth"],
    optionalIngredients: ["white wine", "parmesan"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 84
  },
  {
    id: "pasta-e-fagioli",
    cuisine: "italian",
    region: "Italy",
    names: {
      english: ["Pasta e Fagioli", "Pasta and Bean Soup"],
      native: ["Pasta e Fagioli"]
    },
    description: "Rustic pasta and bean soup with tomato, garlic, herbs, and olive oil",
    primaryIngredients: ["pasta", "beans", "tomato"],
    optionalIngredients: ["garlic", "celery", "carrot", "herbs"],
    mealTypes: ["lunch", "dinner", "soup"],
    iconicScore: 88
  },
  {
    id: "ribollita",
    cuisine: "italian",
    region: "Tuscany",
    names: {
      english: ["Ribollita", "Tuscan Bread and Vegetable Soup"],
      native: ["Ribollita"]
    },
    description: "Tuscan soup with kale, cabbage, white beans, vegetables, tomato, and bread",
    primaryIngredients: ["kale", "white beans", "vegetables"],
    optionalIngredients: ["bread", "tomato", "carrot", "celery"],
    mealTypes: ["lunch", "dinner", "soup"],
    iconicScore: 87
  },
  {
    id: "eggplant-parmigiana",
    cuisine: "italian",
    region: "Southern Italy",
    names: {
      english: ["Eggplant Parmigiana", "Melanzane alla Parmigiana"],
      native: ["Melanzane alla Parmigiana"]
    },
    description: "Layered eggplant baked with tomato sauce, basil, and cheese when allowed",
    primaryIngredients: ["eggplant", "tomato sauce", "basil"],
    optionalIngredients: ["mozzarella", "parmesan", "olive oil"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 89
  },
  {
    id: "panzanella",
    cuisine: "italian",
    region: "Tuscany",
    names: {
      english: ["Panzanella", "Tuscan Tomato Bread Salad"],
      native: ["Panzanella"]
    },
    description: "Tomato and bread salad with cucumber, onion, basil, olive oil, and vinegar",
    primaryIngredients: ["tomato", "bread", "cucumber"],
    optionalIngredients: ["onion", "basil", "olive oil", "vinegar"],
    mealTypes: ["lunch", "side"],
    iconicScore: 85
  }
];

// ============================================================================
// EXPORT ALL EXPANSIONS
// ============================================================================

export const ALL_EXPANSIONS = {
  egyptian: EGYPTIAN_EXPANSION,
  middleEastern: MIDDLE_EASTERN_EXPANSION,
  asian: ASIAN_EXPANSION,
  mexican: MEXICAN_EXPANSION,
  turkish: TURKISH_EXPANSION,
  italian: ITALIAN_EXPANSION
};
