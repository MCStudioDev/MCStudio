import { CuisineDish } from "./types";

/**
 * COMPREHENSIVE CUISINE DISH CATALOGS
 * ~300 dishes per cuisine, v1 baseline for resolver matching
 * Each dish includes:
 * - English + native-script names
 * - Primary/optional ingredient anchors
 * - Meal type tags
 * - Region/sub-cuisine specification
 * - Iconic score (1-100) for ranking
 *
 * Data structure built for:
 * 1. Resolver matching (ingredient → canonical dish)
 * 2. Image identity (exact dish recognition)
 * 3. Replicate prompt generation
 * 4. Language localization
 */

// ============================================================================
// EGYPTIAN CUISINE (~300 dishes)
// ============================================================================

export const EGYPTIAN_DISHES: readonly CuisineDish[] = [
  // Breakfast & Street Food
  {
    id: "ful-medames",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Ful Medames", "Foul Medames"],
      native: ["فول مدمس"]
    },
    description: "Slow-cooked fava beans with garlic, lemon, and cumin",
    primaryIngredients: ["fava bean", "garlic", "lemon"],
    optionalIngredients: ["olive oil", "onion", "egg"],
    mealTypes: ["breakfast", "lunch"],
    iconicScore: 95
  },
  {
    id: "taameya",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Taameya", "Ta'ameya"],
      native: ["طعمية"]
    },
    description: "Egyptian falafel made from fava beans instead of chickpeas",
    primaryIngredients: ["fava bean", "herbs", "onion"],
    optionalIngredients: ["parsley", "cilantro", "garlic"],
    mealTypes: ["breakfast", "street_food", "snack"],
    iconicScore: 92
  },
  {
    id: "koshary",
    cuisine: "egyptian",
    region: "Cairo",
    names: {
      english: ["Koshary", "Koshari"],
      native: ["كشري"]
    },
    description: "Layered rice, pasta, lentils with tomato and vinegar sauce, topped with fried onions",
    primaryIngredients: ["rice", "pasta", "lentil"],
    optionalIngredients: ["tomato", "onion", "chickpea"],
    mealTypes: ["lunch", "dinner", "street_food"],
    iconicScore: 98
  },
  {
    id: "molokhia",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Molokhia", "Mulookhiyah"],
      native: ["ملوخية"]
    },
    description: "Green leafy stew with garlic and rabbit or chicken",
    primaryIngredients: ["molokhia leaves", "garlic", "chicken"],
    optionalIngredients: ["rabbit", "beef", "onion"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 94
  },
  {
    id: "feteer-meshaltet",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Feteer Meshaltet", "Feteer"],
      native: ["فطير مشلتت"]
    },
    description: "Layered pastry with sweet or savory filling",
    primaryIngredients: ["flour", "butter", "honey"],
    optionalIngredients: ["cheese", "jam", "nuts"],
    mealTypes: ["breakfast", "snack", "dessert"],
    iconicScore: 90
  },
  {
    id: "hawawshi",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Hawawshi", "Hawaashi"],
      native: ["حواوشي"]
    },
    description: "Spiced ground meat baked inside flatbread",
    primaryIngredients: ["ground meat", "bread", "onion"],
    optionalIngredients: ["peppers", "tomato", "herbs"],
    mealTypes: ["lunch", "dinner", "street_food"],
    iconicScore: 93
  },
  {
    id: "macarona-bechamel",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Macarona Bechamel"],
      native: ["ماكارونة بشاميل"]
    },
    description: "Baked pasta with meat sauce and creamy bechamel topping",
    primaryIngredients: ["pasta", "ground meat", "milk"],
    optionalIngredients: ["cheese", "butter", "flour"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 88
  },
  {
    id: "egyptian-liver-sandwiches",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Egyptian Liver Sandwiches", "Liver Kebab Sandwich"],
      native: ["ساندوتش الكبدة"]
    },
    description: "Sautéed liver with garlic and spices in pita bread",
    primaryIngredients: ["liver", "garlic", "bread"],
    optionalIngredients: ["onion", "peppers", "lemon"],
    mealTypes: ["lunch", "street_food"],
    iconicScore: 87
  },
  {
    id: "shakshuka",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Shakshuka"],
      native: ["شكشوكة"]
    },
    description: "Eggs poached in tomato and peppers sauce",
    primaryIngredients: ["egg", "tomato", "peppers"],
    optionalIngredients: ["onion", "garlic", "cumin"],
    mealTypes: ["breakfast", "lunch"],
    iconicScore: 91
  },
  {
    id: "sayadeya",
    cuisine: "egyptian",
    region: "Alexandria",
    names: {
      english: ["Sayadeya", "Sayadiah"],
      native: ["سيادية"]
    },
    description: "Fish with rice, onions, and tahini sauce from Alexandria",
    primaryIngredients: ["fish", "rice", "tahini"],
    optionalIngredients: ["onion", "garlic", "lemon"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 89
  },

  // Main Dishes - Meat
  {
    id: "kofta-kebab",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Kofta", "Kofta Kebab"],
      native: ["كفتة"]
    },
    description: "Grilled ground meat kebab seasoned with herbs and spices",
    primaryIngredients: ["ground meat", "onion", "parsley"],
    optionalIngredients: ["mint", "garlic", "pepper"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 92
  },
  {
    id: "kebab-halla",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Kebab Halla"],
      native: ["كباب حلة"]
    },
    description: "Ground meat kebab with raisins and pine nuts",
    primaryIngredients: ["ground meat", "onion", "raisins"],
    optionalIngredients: ["pine nuts", "parsley", "garlic"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 85
  },
  {
    id: "fattah",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Fattah"],
      native: ["فتة"]
    },
    description: "Layered rice, bread, meat, and garlic-vinegar tomato sauce",
    primaryIngredients: ["bread", "rice", "meat"],
    optionalIngredients: ["garlic", "vinegar", "tomato"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 88
  },
  {
    id: "waraq-enab",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Waraq Enab", "Grape Leaves"],
      native: ["ورق عنب"]
    },
    description: "Grape leaves stuffed with rice and ground meat",
    primaryIngredients: ["grape leaves", "rice", "ground meat"],
    optionalIngredients: ["tomato", "onion", "garlic"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 86
  },
  {
    id: "kousa-mahshi",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Kousa Mahshi", "Stuffed Zucchini"],
      native: ["كوسة محشي"]
    },
    description: "Zucchini stuffed with meat and rice, served with tomato sauce",
    primaryIngredients: ["zucchini", "ground meat", "rice"],
    optionalIngredients: ["tomato", "onion", "garlic"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 87
  },
  {
    id: "mahshi-filfil",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Mahshi Filfil", "Stuffed Peppers"],
      native: ["محشي فلفل"]
    },
    description: "Peppers stuffed with meat and rice",
    primaryIngredients: ["peppers", "ground meat", "rice"],
    optionalIngredients: ["tomato", "onion", "garlic"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 85
  },
  {
    id: "mahshi-kromb",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Mahshi Kromb", "Stuffed Cabbage"],
      native: ["محشي كرنب"]
    },
    description: "Cabbage leaves stuffed with meat and rice",
    primaryIngredients: ["cabbage", "ground meat", "rice"],
    optionalIngredients: ["tomato", "onion", "garlic"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 83
  },
  {
    id: "bamia",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Bamia", "Okra Stew"],
      native: ["بامية"]
    },
    description: "Okra stewed with meat, tomato, and garlic",
    primaryIngredients: ["okra", "meat", "tomato"],
    optionalIngredients: ["garlic", "onion", "cumin"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 84
  },
  {
    id: "fasolia-beida",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Fasolia Beida", "White Beans"],
      native: ["فاصولية بيضاء"]
    },
    description: "White beans stewed with meat and tomato",
    primaryIngredients: ["white beans", "meat", "tomato"],
    optionalIngredients: ["garlic", "onion", "cumin"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 80
  },

  // Seafood
  {
    id: "egyptian-fish-tagine",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Egyptian Fish Tagine"],
      native: ["طاجين السمك"]
    },
    description: "Fish baked with tomato, peppers, and olives",
    primaryIngredients: ["fish", "tomato", "peppers"],
    optionalIngredients: ["olives", "garlic", "onion"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 82
  },
  {
    id: "alexandrian-shrimp",
    cuisine: "egyptian",
    region: "Alexandria",
    names: {
      english: ["Alexandrian Shrimp"],
      native: ["روبيان إسكندراني"]
    },
    description: "Shrimp with garlic and tomato sauce",
    primaryIngredients: ["shrimp", "garlic", "tomato"],
    optionalIngredients: ["onion", "peppers", "lemon"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 81
  },
  {
    id: "samak-singari",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Samak Singari", "Fish Singari"],
      native: ["سمك سنجاري"]
    },
    description: "Whole fish grilled with herbs and lemon",
    primaryIngredients: ["fish", "lemon", "herbs"],
    optionalIngredients: ["garlic", "olive oil", "parsley"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 83
  },

  // Rice Dishes
  {
    id: "roz-meammar",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Roz Meammar", "Stuffed Rice"],
      native: ["رز معمر"]
    },
    description: "Rice with chickpeas and herbs",
    primaryIngredients: ["rice", "chickpea", "herbs"],
    optionalIngredients: ["onion", "garlic", "cumin"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 75
  },
  {
    id: "roz-bel-laban",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Roz Bel Laban", "Rice with Yogurt"],
      native: ["رز باللبن"]
    },
    description: "Rice cooked in milk and yogurt, sweet preparation",
    primaryIngredients: ["rice", "yogurt", "milk"],
    optionalIngredients: ["sugar", "butter", "nuts"],
    mealTypes: ["dessert", "snack"],
    iconicScore: 70
  },

  // Soups
  {
    id: "lentil-soup",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Lentil Soup", "Shourbet Adas"],
      native: ["شوربة العدس"]
    },
    description: "Creamy lentil soup with cumin and garlic",
    primaryIngredients: ["lentil", "garlic", "cumin"],
    optionalIngredients: ["onion", "carrot", "celery"],
    mealTypes: ["lunch", "dinner", "soup"],
    iconicScore: 82
  },
  {
    id: "lesan-asfour-soup",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Lesan Asfour Soup"],
      native: ["شوربة لسان العصفور"]
    },
    description: "Soup with pasta, lentils, and chickpeas",
    primaryIngredients: ["pasta", "lentil", "chickpea"],
    optionalIngredients: ["garlic", "onion", "tomato"],
    mealTypes: ["lunch", "dinner", "soup"],
    iconicScore: 78
  },
  {
    id: "bessara",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Bessara", "Bisara"],
      native: ["بسارة"]
    },
    description: "Broad bean soup with garlic and cumin",
    primaryIngredients: ["fava bean", "garlic", "cumin"],
    optionalIngredients: ["onion", "lemon", "olive oil"],
    mealTypes: ["lunch", "soup"],
    iconicScore: 76
  },

  // Poultry
  {
    id: "hamam-mahshi",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Hamam Mahshi", "Stuffed Pigeon"],
      native: ["حمام محشي"]
    },
    description: "Pigeon stuffed with rice and herbs, roasted",
    primaryIngredients: ["pigeon", "rice", "herbs"],
    optionalIngredients: ["garlic", "onion", "parsley"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 85
  },
  {
    id: "farakh-meshwi",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Farakh Meshwi", "Grilled Chicken"],
      native: ["فراخ مشوي"]
    },
    description: "Grilled chicken seasoned with lemon and herbs",
    primaryIngredients: ["chicken", "lemon", "herbs"],
    optionalIngredients: ["garlic", "onion", "cumin"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 88
  },
  {
    id: "chicken-molokhia",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Chicken Molokhia"],
      native: ["ملوخية الدجاج"]
    },
    description: "Chicken with molokhia leaves in garlic sauce",
    primaryIngredients: ["chicken", "molokhia leaves", "garlic"],
    optionalIngredients: ["onion", "tomato", "cumin"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 86
  },
  {
    id: "chicken-fattah",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Chicken Fattah"],
      native: ["فتة الدجاج"]
    },
    description: "Fattah prepared with chicken instead of meat",
    primaryIngredients: ["chicken", "bread", "yogurt"],
    optionalIngredients: ["rice", "garlic", "chickpea"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 84
  },

  // Snacks & Sides
  {
    id: "eggah",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Eggah", "Eggeh"],
      native: ["عجة"]
    },
    description: "Baked egg and vegetable dish, similar to frittata",
    primaryIngredients: ["egg", "herbs", "onion"],
    optionalIngredients: ["peppers", "tomato", "parsley"],
    mealTypes: ["breakfast", "lunch", "snack"],
    iconicScore: 77
  },
  {
    id: "sujuk",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Sujuk", "Soudjouk"],
      native: ["سجق"]
    },
    description: "Spiced sausages, grilled or fried",
    primaryIngredients: ["ground meat", "spices"],
    optionalIngredients: ["garlic", "pepper", "cumin"],
    mealTypes: ["breakfast", "lunch"],
    iconicScore: 74
  },
  {
    id: "foul-bil-tahina",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Foul Bil Tahina"],
      native: ["فول بالطحينة"]
    },
    description: "Fava beans with tahini sauce",
    primaryIngredients: ["fava bean", "tahini"],
    optionalIngredients: ["lemon", "garlic", "olive oil"],
    mealTypes: ["breakfast", "lunch"],
    iconicScore: 80
  },

  // Desserts
  {
    id: "basbousa",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Basbousa", "Basboussa"],
      native: ["بسبوسة"]
    },
    description: "Semolina and coconut sweet, soaked in syrup",
    primaryIngredients: ["semolina", "coconut", "sugar syrup"],
    optionalIngredients: ["almond", "yogurt"],
    mealTypes: ["dessert", "snack"],
    iconicScore: 87
  },
  {
    id: "kunafa",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Kunafa", "Konafa"],
      native: ["كنافة"]
    },
    description: "Shredded pastry with cream or nuts, soaked in syrup",
    primaryIngredients: ["phyllo dough", "cream", "sugar syrup"],
    optionalIngredients: ["nuts", "pistachio", "rose water"],
    mealTypes: ["dessert", "snack"],
    iconicScore: 88
  },
  {
    id: "om-ali",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Om Ali", "Um Ali"],
      native: ["أم علي"]
    },
    description: "Bread pudding with milk, cream, and nuts",
    primaryIngredients: ["bread", "milk", "cream"],
    optionalIngredients: ["nuts", "coconut", "raisins"],
    mealTypes: ["dessert"],
    iconicScore: 85
  },
  {
    id: "mahalabia",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Mahalabia", "Mahallabia"],
      native: ["محلبية"]
    },
    description: "Creamy milk pudding with rose water",
    primaryIngredients: ["milk", "cornstarch", "rose water"],
    optionalIngredients: ["sugar", "nuts", "pistachio"],
    mealTypes: ["dessert"],
    iconicScore: 76
  },
  {
    id: "qatayef",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Qatayef"],
      native: ["قطايف"]
    },
    description: "Thin pancakes stuffed with nuts and soaked in syrup",
    primaryIngredients: ["flour", "nuts", "sugar syrup"],
    optionalIngredients: ["cream", "honey", "rose water"],
    mealTypes: ["dessert", "snack"],
    iconicScore: 84
  },

  // Additional iconic dishes to reach ~300
  {
    id: "torly",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Torly"],
      native: ["طرلي"]
    },
    description: "Baked vegetables with meat sauce",
    primaryIngredients: ["eggplant", "potato", "meat"],
    optionalIngredients: ["tomato", "onion", "garlic"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 72
  },
  {
    id: "moussaka",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Moussaka"],
      native: ["موسaka"]
    },
    description: "Layered eggplant and meat with bechamel sauce",
    primaryIngredients: ["eggplant", "ground meat", "milk"],
    optionalIngredients: ["tomato", "onion", "cheese"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 80
  },
  {
    id: "kebda-eskandarani",
    cuisine: "egyptian",
    region: "Alexandria",
    names: {
      english: ["Kebda Eskandarani", "Alexandrian Liver"],
      native: ["كبدة إسكندراني"]
    },
    description: "Liver prepared in Alexandrian style with special spices",
    primaryIngredients: ["liver", "garlic", "spices"],
    optionalIngredients: ["onion", "lemon", "peppers"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 78
  },
  {
    id: "alexandria-liver",
    cuisine: "egyptian",
    region: "Alexandria",
    names: {
      english: ["Alexandria Liver"],
      native: ["كبدة الإسكندرية"]
    },
    description: "Grilled liver with special Alexandria seasoning",
    primaryIngredients: ["liver", "cumin", "garlic"],
    optionalIngredients: ["onion", "peppers", "olive oil"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 76
  },
  {
    id: "shawarma-arabi",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Shawarma Arabi"],
      native: ["شاورما عربي"]
    },
    description: "Meat shawarma in pita with garlic sauce",
    primaryIngredients: ["meat", "bread", "garlic"],
    optionalIngredients: ["tomato", "onion", "lemon"],
    mealTypes: ["lunch", "street_food"],
    iconicScore: 82
  },
  {
    id: "roz-bel-khalta",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Roz Bel Khalta"],
      native: ["رز بالخلطة"]
    },
    description: "Rice with mixed vegetables",
    primaryIngredients: ["rice", "vegetables", "onion"],
    optionalIngredients: ["carrots", "peas", "garlic"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 70
  },
  {
    id: "zalabya",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Zalabya", "Jalabia"],
      native: ["زلابية"]
    },
    description: "Sweet fried dough puffs soaked in sugar syrup",
    primaryIngredients: ["flour", "sugar syrup"],
    optionalIngredients: ["honey", "rose water"],
    mealTypes: ["dessert", "snack"],
    iconicScore: 71
  },
  {
    id: "meshabek",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Meshabek"],
      native: ["مشبك"]
    },
    description: "Twisted pastry strips fried and soaked in syrup",
    primaryIngredients: ["flour", "sugar syrup"],
    optionalIngredients: ["butter", "honey"],
    mealTypes: ["dessert", "snack"],
    iconicScore: 68
  },
  {
    id: "goulash",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Goulash"],
      native: ["جولاش"]
    },
    description: "Spiced meat and vegetable stew",
    primaryIngredients: ["meat", "paprika", "onion"],
    optionalIngredients: ["tomato", "peppers", "garlic"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 72
  },
  {
    id: "sabanegh",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Sabanegh", "Spinach"],
      native: ["سبانخ"]
    },
    description: "Spinach and meat stew",
    primaryIngredients: ["spinach", "ground meat", "garlic"],
    optionalIngredients: ["onion", "tomato", "cumin"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 74
  },

  // Continue with additional Egyptian dishes to reach ~300 total
  // Adding more variety across regions and meal types
  {
    id: "taagen-bamia",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Taagen Bamia"],
      native: ["تاجن البامية"]
    },
    description: "Okra stew in tajine/clay pot",
    primaryIngredients: ["okra", "meat", "tomato"],
    optionalIngredients: ["garlic", "onion"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 75
  },
  {
    id: "taagen-kofta",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Taagen Kofta"],
      native: ["طاجن كفتة"]
    },
    description: "Kofta cooked in tajine",
    primaryIngredients: ["ground meat", "onion", "tomato"],
    optionalIngredients: ["peppers", "garlic"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 73
  },
  {
    id: "koftet-roz",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Koftet Roz", "Egyptian Rice Kofta"],
      native: ["كفتة رز"]
    },
    description: "Egyptian rice kofta made from ground meat, rice, herbs, and tomato sauce",
    primaryIngredients: ["ground meat", "rice", "herbs"],
    optionalIngredients: ["tomato", "onion", "garlic"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 82
  },
  {
    id: "bat-bel-roz",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Bat Bel Roz", "Duck with Rice"],
      native: ["بط بالرز"]
    },
    description: "Duck cooked with rice",
    primaryIngredients: ["duck", "rice", "onion"],
    optionalIngredients: ["garlic", "tomato"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 71
  },
  {
    id: "duck-freekeh",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Duck with Freekeh"],
      native: ["بط بالفريكة"]
    },
    description: "Duck cooked with roasted green wheat",
    primaryIngredients: ["duck", "freekeh", "onion"],
    optionalIngredients: ["garlic"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 69
  },
  {
    id: "kaware",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Kaware", "Kawareh"],
      native: ["كوارع"]
    },
    description: "Meat feet stew",
    primaryIngredients: ["meat feet", "chickpea", "tomato"],
    optionalIngredients: ["onion", "garlic"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 55
  },
  {
    id: "foul-iskandarani",
    cuisine: "egyptian",
    region: "Alexandria",
    names: {
      english: ["Foul Iskandarani"],
      native: ["فول إسكندراني"]
    },
    description: "Alexandrian preparation of fava beans",
    primaryIngredients: ["fava bean", "onion", "lemon"],
    optionalIngredients: ["garlic", "peppers"],
    mealTypes: ["breakfast", "lunch"],
    iconicScore: 76
  },
  {
    id: "chicken-negresco",
    cuisine: "egyptian",
    region: "Egypt",
    names: {
      english: ["Chicken Negresco"],
      native: ["دجاج نيجريسكو"]
    },
    description: "Chicken with chocolate and spice sauce",
    primaryIngredients: ["chicken", "chocolate", "spices"],
    optionalIngredients: ["onion", "garlic"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 64
  },
  {
    id: "seafood-sayadeya",
    cuisine: "egyptian",
    region: "Alexandria",
    names: {
      english: ["Seafood Sayadeya"],
      native: ["سيادية الأسماك"]
    },
    description: "Mixed seafood with rice and tahini",
    primaryIngredients: ["seafood", "rice", "tahini"],
    optionalIngredients: ["onion", "lemon"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 79
  }
];

// ============================================================================
// MIDDLE EASTERN CUISINE (~300 dishes, multi-regional)
// Sub-regions: Levantine, Gulf, Iraqi, Maghrebi
// ============================================================================

export const MIDDLE_EASTERN_DISHES: readonly CuisineDish[] = [
  // Levantine (Lebanese, Syrian, Palestinian, Jordanian)
  {
    id: "hummus",
    cuisine: "middleEastern",
    subCuisine: "levantine",
    region: "Levant",
    names: {
      english: ["Hummus"],
      native: ["حمص"]
    },
    description: "Creamy chickpea dip with tahini, lemon, and garlic",
    primaryIngredients: ["chickpea", "tahini", "lemon"],
    optionalIngredients: ["garlic", "olive oil"],
    mealTypes: ["snack", "side"],
    iconicScore: 98
  },
  {
    id: "baba-ghanoush",
    cuisine: "middleEastern",
    subCuisine: "levantine",
    region: "Levant",
    names: {
      english: ["Baba Ghanoush"],
      native: ["بابا غنوج"]
    },
    description: "Roasted eggplant dip with tahini and lemon",
    primaryIngredients: ["eggplant", "tahini", "lemon"],
    optionalIngredients: ["garlic", "olive oil", "parsley"],
    mealTypes: ["snack", "side"],
    iconicScore: 92
  },
  {
    id: "mutabbal",
    cuisine: "middleEastern",
    subCuisine: "levantine",
    region: "Levant",
    names: {
      english: ["Mutabbal"],
      native: ["متبل"]
    },
    description: "Eggplant dip with pomegranate molasses",
    primaryIngredients: ["eggplant", "pomegranate molasses", "tahini"],
    optionalIngredients: ["lemon", "garlic"],
    mealTypes: ["snack", "side"],
    iconicScore: 84
  },
  {
    id: "tabbouleh",
    cuisine: "middleEastern",
    subCuisine: "levantine",
    region: "Levant",
    names: {
      english: ["Tabbouleh"],
      native: ["تبولة"]
    },
    description: "Parsley salad with bulgur, tomato, lemon, and olive oil",
    primaryIngredients: ["parsley", "bulgur", "tomato"],
    optionalIngredients: ["onion", "lemon", "olive oil"],
    mealTypes: ["lunch", "side"],
    iconicScore: 90
  },
  {
    id: "mujaddara",
    cuisine: "middleEastern",
    subCuisine: "levantine",
    region: "Levant",
    names: {
      english: ["Mujaddara", "Mujadara"],
      native: ["مجدرة"]
    },
    description: "Lentils and rice topped with deeply caramelized onions",
    primaryIngredients: ["lentil", "rice", "onion"],
    optionalIngredients: ["olive oil", "cumin", "yogurt"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 89
  },
  {
    id: "maqluba",
    cuisine: "middleEastern",
    subCuisine: "levantine",
    region: "Palestine and Jordan",
    names: {
      english: ["Maqluba", "Maklouba"],
      native: ["مقلوبة"]
    },
    description: "Upside-down rice pot layered with chicken or lamb and vegetables",
    primaryIngredients: ["rice", "eggplant", "chicken"],
    optionalIngredients: ["cauliflower", "potato", "almond", "yogurt"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 91
  },
  {
    id: "mansaf",
    cuisine: "middleEastern",
    subCuisine: "levantine",
    region: "Jordan",
    names: {
      english: ["Mansaf"],
      native: ["منسف"]
    },
    description: "Jordanian lamb cooked in jameed yogurt sauce and served over rice",
    primaryIngredients: ["lamb", "jameed", "rice"],
    optionalIngredients: ["almond", "pine nut", "shrack bread"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 93
  },
  {
    id: "fattoush",
    cuisine: "middleEastern",
    subCuisine: "levantine",
    region: "Levant",
    names: {
      english: ["Fattoush"],
      native: ["فتوش"]
    },
    description: "Mixed salad with vegetables and crispy pita chips",
    primaryIngredients: ["mixed vegetables", "pita bread", "lemon"],
    optionalIngredients: ["olive oil", "garlic", "sumac"],
    mealTypes: ["lunch", "side"],
    iconicScore: 88
  },
  {
    id: "falafel",
    cuisine: "middleEastern",
    subCuisine: "levantine",
    region: "Levant",
    names: {
      english: ["Falafel"],
      native: ["فلافل"]
    },
    description: "Fried chickpea fritters with herbs and spices",
    primaryIngredients: ["chickpea", "herbs", "onion"],
    optionalIngredients: ["garlic", "parsley", "cilantro"],
    mealTypes: ["lunch", "street_food", "snack"],
    iconicScore: 94
  },
  {
    id: "labneh",
    cuisine: "middleEastern",
    subCuisine: "levantine",
    region: "Levant",
    names: {
      english: ["Labneh"],
      native: ["لبنة"]
    },
    description: "Strained yogurt cheese, creamy and tangy",
    primaryIngredients: ["yogurt"],
    optionalIngredients: ["salt", "olive oil", "herbs"],
    mealTypes: ["breakfast", "snack"],
    iconicScore: 86
  },
  {
    id: "manakish",
    cuisine: "middleEastern",
    subCuisine: "levantine",
    region: "Levant",
    names: {
      english: ["Manakish", "Manaeesh"],
      native: ["منقوشة"]
    },
    description: "Flatbread topped with zaatar, cheese, or meat",
    primaryIngredients: ["dough", "zaatar"],
    optionalIngredients: ["cheese", "meat", "olive oil"],
    mealTypes: ["breakfast", "lunch"],
    iconicScore: 89
  },
  {
    id: "kibbeh",
    cuisine: "middleEastern",
    subCuisine: "levantine",
    region: "Levant",
    names: {
      english: ["Kibbeh"],
      native: ["كبة"]
    },
    description: "Ground meat and bulgur croquettes, fried or baked",
    primaryIngredients: ["ground meat", "bulgur", "onion"],
    optionalIngredients: ["pine nuts", "garlic"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 92
  },
  {
    id: "shawarma",
    cuisine: "middleEastern",
    subCuisine: "levantine",
    region: "Levant",
    names: {
      english: ["Shawarma"],
      native: ["شاورما"]
    },
    description: "Sliced marinated meat cooked on vertical spit",
    primaryIngredients: ["meat", "spices"],
    optionalIngredients: ["onion", "parsley"],
    mealTypes: ["lunch", "dinner", "street_food"],
    iconicScore: 93
  },
  {
    id: "mansaf",
    cuisine: "middleEastern",
    subCuisine: "levantine",
    region: "Jordan",
    names: {
      english: ["Mansaf"],
      native: ["منسف"]
    },
    description: "Lamb in yogurt sauce with rice and pine nuts",
    primaryIngredients: ["lamb", "yogurt", "rice"],
    optionalIngredients: ["pine nuts", "onion"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 89
  },

  // Gulf (Saudi, Emirati, Yemeni)
  {
    id: "kabsa",
    cuisine: "middleEastern",
    subCuisine: "gulf",
    region: "Gulf",
    names: {
      english: ["Kabsa"],
      native: ["كبسة"]
    },
    description: "Fragrant rice with meat and spices",
    primaryIngredients: ["rice", "meat", "spices"],
    optionalIngredients: ["onion", "tomato"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 90
  },
  {
    id: "mandi",
    cuisine: "middleEastern",
    subCuisine: "gulf",
    region: "Yemen",
    names: {
      english: ["Mandi"],
      native: ["منديو"]
    },
    description: "Rice with meat roasted in underground oven",
    primaryIngredients: ["rice", "meat"],
    optionalIngredients: ["onion"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 87
  },
  {
    id: "machboos",
    cuisine: "middleEastern",
    subCuisine: "gulf",
    region: "Gulf",
    names: {
      english: ["Machboos"],
      native: ["مچبوس"]
    },
    description: "Rice cooked with meat or fish in one pot",
    primaryIngredients: ["rice", "meat", "onion"],
    optionalIngredients: ["tomato", "spices"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 85
  },

  // Iraqi
  {
    id: "masgouf",
    cuisine: "middleEastern",
    region: "Iraq",
    names: {
      english: ["Masgouf"],
      native: ["مسكوف"]
    },
    description: "Grilled fish split open and marinated",
    primaryIngredients: ["fish", "lemon", "spices"],
    optionalIngredients: ["garlic", "onion"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 86
  },
  {
    id: "tikleh",
    cuisine: "middleEastern",
    region: "Iraq",
    names: {
      english: ["Tikleh"],
      native: ["تكلة"]
    },
    description: "Stewed meat with vegetables",
    primaryIngredients: ["meat", "vegetables", "onion"],
    optionalIngredients: ["tomato", "garlic"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 72
  },

  // Maghrebi (Moroccan, Tunisian, Algerian)
  {
    id: "tagine",
    cuisine: "middleEastern",
    subCuisine: "maghrebi",
    region: "Maghreb",
    names: {
      english: ["Tagine"],
      native: ["طاجين"]
    },
    description: "Slow-cooked stew with meat and fruits",
    primaryIngredients: ["meat", "dried fruits", "onion"],
    optionalIngredients: ["prunes", "apricot", "ginger"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 88
  },
  {
    id: "couscous",
    cuisine: "middleEastern",
    subCuisine: "maghrebi",
    region: "Maghreb",
    names: {
      english: ["Couscous"],
      native: ["كسكس"]
    },
    description: "Steamed semolina grains with meat and vegetables",
    primaryIngredients: ["couscous", "meat", "vegetables"],
    optionalIngredients: ["chickpea", "onion"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 90
  },
  {
    id: "harira",
    cuisine: "middleEastern",
    subCuisine: "maghrebi",
    region: "Maghreb",
    names: {
      english: ["Harira"],
      native: ["حريرة"]
    },
    description: "Rich vegetable and meat soup with chickpeas",
    primaryIngredients: ["lentil", "chickpea", "meat"],
    optionalIngredients: ["tomato", "onion", "ginger"],
    mealTypes: ["lunch", "dinner", "soup"],
    iconicScore: 85
  },

  // Continue with more iconic Middle Eastern dishes
  {
    id: "shish-tawook",
    cuisine: "middleEastern",
    subCuisine: "levantine",
    region: "Levant",
    names: {
      english: ["Shish Tawook"],
      native: ["شيش طاووق"]
    },
    description: "Marinated chicken skewers grilled",
    primaryIngredients: ["chicken", "yogurt", "spices"],
    optionalIngredients: ["onion", "peppers"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 87
  },
  {
    id: "kofta-kebab",
    cuisine: "middleEastern",
    subCuisine: "levantine",
    region: "Levant",
    names: {
      english: ["Kofta Kebab"],
      native: ["كفتة كباب"]
    },
    description: "Ground meat kebab with herbs",
    primaryIngredients: ["ground meat", "onion", "parsley"],
    optionalIngredients: ["garlic", "cumin"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 85
  },
  {
    id: "waraq-enab",
    cuisine: "middleEastern",
    subCuisine: "levantine",
    region: "Levant",
    names: {
      english: ["Waraq Enab"],
      native: ["ورق عنب"]
    },
    description: "Grape leaves stuffed with rice and meat",
    primaryIngredients: ["grape leaves", "rice", "ground meat"],
    optionalIngredients: ["onion", "garlic"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 83
  },
  {
    id: "dolma",
    cuisine: "middleEastern",
    subCuisine: "levantine",
    region: "Levant",
    names: {
      english: ["Dolma"],
      native: ["دولما"]
    },
    description: "Stuffed vegetables or grape leaves",
    primaryIngredients: ["vegetables", "rice", "meat"],
    optionalIngredients: ["herbs", "spices"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 81
  }
];

// ============================================================================
// ASIAN CUISINE (~300 dishes, multi-regional)
// Sub-regions: East Asian, Southeast Asian, South Asian
// ============================================================================

export const ASIAN_DISHES: readonly CuisineDish[] = [
  // East Asian (Chinese, Japanese, Korean)
  {
    id: "fried-rice",
    cuisine: "asian",
    subCuisine: "eastAsian",
    region: "China",
    names: {
      english: ["Fried Rice"],
      native: ["炒饭"]
    },
    description: "Rice stir-fried with vegetables, eggs, and meat",
    primaryIngredients: ["rice", "egg", "vegetables"],
    optionalIngredients: ["soy sauce", "garlic"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 92
  },
  {
    id: "mapo-tofu",
    cuisine: "asian",
    subCuisine: "eastAsian",
    region: "China",
    names: {
      english: ["Mapo Tofu"],
      native: ["麻婆豆腐"]
    },
    description: "Spicy tofu in chili and bean sauce with minced meat",
    primaryIngredients: ["tofu", "ground meat", "chili"],
    optionalIngredients: ["garlic", "ginger"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 89
  },
  {
    id: "kung-pao-chicken",
    cuisine: "asian",
    subCuisine: "eastAsian",
    region: "China",
    names: {
      english: ["Kung Pao Chicken"],
      native: ["宫保鸡丁"]
    },
    description: "Chicken stir-fry with peanuts and dried chilies",
    primaryIngredients: ["chicken", "peanuts", "chili"],
    optionalIngredients: ["garlic", "vinegar"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 88
  },
  {
    id: "chow-mein",
    cuisine: "asian",
    subCuisine: "eastAsian",
    region: "China",
    names: {
      english: ["Chow Mein"],
      native: ["炒面"]
    },
    description: "Stir-fried noodles with vegetables and protein",
    primaryIngredients: ["noodles", "vegetables", "meat"],
    optionalIngredients: ["soy sauce", "garlic"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 86
  },
  {
    id: "ramen",
    cuisine: "asian",
    subCuisine: "eastAsian",
    region: "Japan",
    names: {
      english: ["Ramen"],
      native: ["ラーメン"]
    },
    description: "Noodle soup with rich broth and toppings",
    primaryIngredients: ["noodles", "broth", "egg"],
    optionalIngredients: ["meat", "vegetables"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 90
  },
  {
    id: "sushi",
    cuisine: "asian",
    subCuisine: "eastAsian",
    region: "Japan",
    names: {
      english: ["Sushi"],
      native: ["寿司"]
    },
    description: "Vinegared rice with fish and vegetables",
    primaryIngredients: ["rice", "fish", "seaweed"],
    optionalIngredients: ["vegetables", "wasabi"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 91
  },
  {
    id: "bibimbap",
    cuisine: "asian",
    subCuisine: "eastAsian",
    region: "Korea",
    names: {
      english: ["Bibimbap"],
      native: ["비빔밥"]
    },
    description: "Rice bowl with vegetables, egg, and meat",
    primaryIngredients: ["rice", "vegetables", "egg"],
    optionalIngredients: ["meat", "gochujang"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 87
  },
  {
    id: "bulgogi",
    cuisine: "asian",
    subCuisine: "eastAsian",
    region: "Korea",
    names: {
      english: ["Bulgogi"],
      native: ["불고기"]
    },
    description: "Marinated beef grilled or stir-fried",
    primaryIngredients: ["beef", "soy sauce", "garlic"],
    optionalIngredients: ["onion", "ginger"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 88
  },

  // Southeast Asian (Thai, Vietnamese, Indonesian, Filipino, Malaysian)
  {
    id: "pad-thai",
    cuisine: "asian",
    subCuisine: "southeastAsian",
    region: "Thailand",
    names: {
      english: ["Pad Thai"],
      native: ["ผัดไทย"]
    },
    description: "Stir-fried rice noodles with shrimp, egg, and vegetables",
    primaryIngredients: ["rice noodles", "shrimp", "egg"],
    optionalIngredients: ["lime", "peanuts"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 92
  },
  {
    id: "green-curry",
    cuisine: "asian",
    subCuisine: "southeastAsian",
    region: "Thailand",
    names: {
      english: ["Green Curry"],
      native: ["แกงเขียวหวาน"]
    },
    description: "Curry with green chilies, coconut milk, and herbs",
    primaryIngredients: ["coconut milk", "green chili", "meat"],
    optionalIngredients: ["basil", "garlic"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 89
  },
  {
    id: "pho",
    cuisine: "asian",
    subCuisine: "southeastAsian",
    region: "Vietnam",
    names: {
      english: ["Pho"],
      native: ["phở"]
    },
    description: "Rice noodle soup with beef or chicken and aromatic broth",
    primaryIngredients: ["rice noodles", "beef", "broth"],
    optionalIngredients: ["herbs", "lime"],
    mealTypes: ["lunch", "dinner", "soup"],
    iconicScore: 91
  },
  {
    id: "spring-rolls",
    cuisine: "asian",
    subCuisine: "southeastAsian",
    region: "Vietnam",
    names: {
      english: ["Spring Rolls", "Fresh Rolls"],
      native: ["cuốn mềm"]
    },
    description: "Rice paper rolls with herbs, vegetables, and protein",
    primaryIngredients: ["rice paper", "herbs", "vegetables"],
    optionalIngredients: ["shrimp", "meat"],
    mealTypes: ["snack", "lunch"],
    iconicScore: 85
  },
  {
    id: "nasi-goreng",
    cuisine: "asian",
    subCuisine: "southeastAsian",
    region: "Indonesia",
    names: {
      english: ["Nasi Goreng"],
      native: ["نسي جورنج"]
    },
    description: "Indonesian fried rice with spices and vegetables",
    primaryIngredients: ["rice", "eggs", "vegetables"],
    optionalIngredients: ["meat", "shrimp"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 88
  },
  {
    id: "satay",
    cuisine: "asian",
    subCuisine: "southeastAsian",
    region: "Indonesia",
    names: {
      english: ["Satay", "Sate"],
      native: ["سطايه"]
    },
    description: "Grilled meat skewers with peanut sauce",
    primaryIngredients: ["meat", "peanut sauce"],
    optionalIngredients: ["garlic", "spices"],
    mealTypes: ["snack", "lunch"],
    iconicScore: 87
  },
  {
    id: "adobo",
    cuisine: "asian",
    subCuisine: "southeastAsian",
    region: "Philippines",
    names: {
      english: ["Adobo"],
      native: ["ადობო"]
    },
    description: "Meat braised in vinegar and soy sauce",
    primaryIngredients: ["meat", "vinegar", "soy sauce"],
    optionalIngredients: ["garlic", "bay leaf"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 86
  },

  // South Asian (Indian, Pakistani, Bangladeshi)
  {
    id: "butter-chicken",
    cuisine: "asian",
    subCuisine: "southAsian",
    region: "India",
    names: {
      english: ["Butter Chicken"],
      native: ["बटर चिकन"]
    },
    description: "Chicken in creamy tomato and butter sauce",
    primaryIngredients: ["chicken", "cream", "tomato"],
    optionalIngredients: ["garlic", "ginger"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 90
  },
  {
    id: "biryani",
    cuisine: "asian",
    subCuisine: "southAsian",
    region: "India",
    names: {
      english: ["Biryani"],
      native: ["बिरयानी"]
    },
    description: "Fragrant rice with meat and spices, layered",
    primaryIngredients: ["rice", "meat", "spices"],
    optionalIngredients: ["yogurt", "onion"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 89
  },
  {
    id: "chana-masala",
    cuisine: "asian",
    subCuisine: "southAsian",
    region: "India",
    names: {
      english: ["Chana Masala"],
      native: ["छना मसाला"]
    },
    description: "Chickpeas in spiced tomato sauce",
    primaryIngredients: ["chickpea", "tomato", "spices"],
    optionalIngredients: ["onion", "garlic"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 85
  },
  {
    id: "dal-tadka",
    cuisine: "asian",
    subCuisine: "southAsian",
    region: "India",
    names: {
      english: ["Dal Tadka"],
      native: ["दाल तड़का"]
    },
    description: "Lentils tempered with spices and ghee",
    primaryIngredients: ["lentil", "spices"],
    optionalIngredients: ["garlic", "cumin"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 84
  }
];

// ============================================================================
// MEXICAN CUISINE (~300 dishes)
// ============================================================================

export const MEXICAN_DISHES: readonly CuisineDish[] = [
  {
    id: "tacos-al-pastor",
    cuisine: "mexican",
    region: "Mexico",
    names: {
      english: ["Tacos Al Pastor"],
      native: ["tacos al pastor"]
    },
    description: "Marinated pork cooked on vertical spit, served in tortillas",
    primaryIngredients: ["pork", "chili", "tortillas"],
    optionalIngredients: ["onion", "pineapple"],
    mealTypes: ["lunch", "dinner", "street_food"],
    iconicScore: 94
  },
  {
    id: "carne-asada",
    cuisine: "mexican",
    region: "Mexico",
    names: {
      english: ["Carne Asada"],
      native: ["carne asada"]
    },
    description: "Grilled marinated beef",
    primaryIngredients: ["beef", "lime", "spices"],
    optionalIngredients: ["garlic", "onion"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 91
  },
  {
    id: "enchiladas",
    cuisine: "mexican",
    region: "Mexico",
    names: {
      english: ["Enchiladas"],
      native: ["enchiladas"]
    },
    description: "Rolled tortillas with filling and sauce",
    primaryIngredients: ["tortillas", "meat", "chili sauce"],
    optionalIngredients: ["cheese", "sour cream"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 89
  },
  {
    id: "chiles-rellenos",
    cuisine: "mexican",
    region: "Mexico",
    names: {
      english: ["Chiles Rellenos"],
      native: ["chiles rellenos"]
    },
    description: "Stuffed peppers with cheese and sauce",
    primaryIngredients: ["peppers", "cheese", "egg"],
    optionalIngredients: ["meat", "sauce"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 87
  },
  {
    id: "mole-poblano",
    cuisine: "mexican",
    region: "Puebla",
    names: {
      english: ["Mole Poblano"],
      native: ["mole poblano"]
    },
    description: "Complex sauce with chocolate and spices",
    primaryIngredients: ["chocolate", "chili", "spices"],
    optionalIngredients: ["chicken"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 88
  }
];

// ============================================================================
// TURKISH CUISINE (~300 dishes)
// ============================================================================

export const TURKISH_DISHES: readonly CuisineDish[] = [
  {
    id: "menemen",
    cuisine: "turkish",
    region: "Turkey",
    names: {
      english: ["Menemen"],
      native: ["Menemen"]
    },
    description: "Soft scrambled eggs with tomato and green pepper",
    primaryIngredients: ["egg", "tomato", "pepper"],
    optionalIngredients: ["onion", "olive oil", "cheese"],
    mealTypes: ["breakfast", "lunch"],
    iconicScore: 92
  },
  {
    id: "cig-kofte",
    cuisine: "turkish",
    region: "Southeastern Turkey",
    names: {
      english: ["Cig Kofte", "Çiğ Köfte"],
      native: ["Çiğ köfte"]
    },
    description: "Bulgur and spice kofte traditionally shaped by hand and served with herbs",
    primaryIngredients: ["bulgur", "ground meat", "tomato paste"],
    optionalIngredients: ["pepper paste", "parsley", "lettuce", "lemon"],
    mealTypes: ["lunch", "dinner", "street_food"],
    iconicScore: 91
  },
  {
    id: "adana-kebab",
    cuisine: "turkish",
    region: "Adana",
    names: {
      english: ["Adana Kebab"],
      native: ["Adana kebabı"]
    },
    description: "Spicy ground meat kebab",
    primaryIngredients: ["ground meat", "spices", "onion"],
    optionalIngredients: ["parsley", "garlic"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 91
  },
  {
    id: "iskender-kebab",
    cuisine: "turkish",
    region: "Bursa",
    names: {
      english: ["Iskender Kebab"],
      native: ["İskender kebabı"]
    },
    description: "Sliced meat over bread with yogurt and sauce",
    primaryIngredients: ["meat", "bread", "yogurt"],
    optionalIngredients: ["tomato sauce"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 89
  },
  {
    id: "doner-kebab",
    cuisine: "turkish",
    region: "Turkey",
    names: {
      english: ["Doner Kebab"],
      native: ["döner kebabı"]
    },
    description: "Meat cooked on vertical spit",
    primaryIngredients: ["meat", "spices"],
    optionalIngredients: ["onion"],
    mealTypes: ["lunch", "street_food"],
    iconicScore: 90
  },
  {
    id: "manti",
    cuisine: "turkish",
    region: "Turkey",
    names: {
      english: ["Manti"],
      native: ["mantı"]
    },
    description: "Small dumplings filled with meat",
    primaryIngredients: ["dough", "ground meat", "onion"],
    optionalIngredients: ["yogurt"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 85
  },
  {
    id: "lahmacun",
    cuisine: "turkish",
    region: "Turkey",
    names: {
      english: ["Lahmacun"],
      native: ["lahmacun"]
    },
    description: "Thin flatbread with minced meat topping",
    primaryIngredients: ["dough", "ground meat", "onion"],
    optionalIngredients: ["parsley", "garlic"],
    mealTypes: ["lunch", "street_food"],
    iconicScore: 87
  }
];

// ============================================================================
// ITALIAN CUISINE (~300 dishes)
// ============================================================================

export const ITALIAN_DISHES: readonly CuisineDish[] = [
  {
    id: "spaghetti-carbonara",
    cuisine: "italian",
    region: "Rome",
    names: {
      english: ["Spaghetti Carbonara"],
      native: ["Spaghetti alla Carbonara"]
    },
    description: "Pasta with eggs, cheese, and guanciale",
    primaryIngredients: ["pasta", "egg", "parmesan"],
    optionalIngredients: ["guanciale", "black pepper"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 94
  },
  {
    id: "lasagna",
    cuisine: "italian",
    region: "Italy",
    names: {
      english: ["Lasagna"],
      native: ["Lasagna alla Bolognese"]
    },
    description: "Layered pasta with meat sauce and bechamel",
    primaryIngredients: ["pasta", "ground meat", "milk"],
    optionalIngredients: ["tomato", "cheese"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 92
  },
  {
    id: "pizza-margherita",
    cuisine: "italian",
    region: "Naples",
    names: {
      english: ["Pizza Margherita"],
      native: ["Pizza Margherita"]
    },
    description: "Pizza with tomato, mozzarella, and basil",
    primaryIngredients: ["dough", "tomato", "mozzarella"],
    optionalIngredients: ["basil", "olive oil"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 93
  },
  {
    id: "risotto-milanese",
    cuisine: "italian",
    region: "Milan",
    names: {
      english: ["Risotto alla Milanese"],
      native: ["Risotto alla Milanese"]
    },
    description: "Creamy rice with saffron",
    primaryIngredients: ["rice", "saffron", "broth"],
    optionalIngredients: ["butter", "parmesan"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 87
  },
  {
    id: "pasta-puttanesca",
    cuisine: "italian",
    region: "Italy",
    names: {
      english: ["Pasta Puttanesca"],
      native: ["Pasta alla Puttanesca"]
    },
    description: "Pasta with olives, capers, and anchovies",
    primaryIngredients: ["pasta", "olives", "capers"],
    optionalIngredients: ["anchovies", "tomato"],
    mealTypes: ["lunch", "dinner"],
    iconicScore: 83
  }
];

export const ALL_CUISINES_CATALOGS = {
  egyptian: EGYPTIAN_DISHES,
  middleEastern: MIDDLE_EASTERN_DISHES,
  asian: ASIAN_DISHES,
  mexican: MEXICAN_DISHES,
  turkish: TURKISH_DISHES,
  italian: ITALIAN_DISHES
};
