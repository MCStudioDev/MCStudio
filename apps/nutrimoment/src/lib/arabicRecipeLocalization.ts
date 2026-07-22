import type { MealPlanData, MealPlanMeal, Recipe } from "@/lib/types";
import { OFFLINE_INGREDIENT_TAXONOMY } from "@/data/offline/ingredientTaxonomy";
import { ARABIC_CULINARY_DICTIONARY } from "@/data/culinary/arabicCulinaryDictionary";
import { buildFoodDictionaryLocalizationLookups } from "@/food/FoodDictionary";

const RECIPE_TITLES: Record<string, string> = {
  ...ARABIC_CULINARY_DICTIONARY.dishTitles,
  "Kofta": "كفتة",
  "Egyptian Kofta": "كفتة مصرية",
  "Kofta Kebab": "كفتة مشوية",
  "Taagen Kofta": "طاجن كفتة",
  "Hawawshi": "حواوشي",
  "Macarona Bechamel": "مكرونة بشاميل",
  "Pasta Puttanesca": "مكرونة بوتانيسكا",
  "Macaroni and Cheese": "مكرونة بالجبنة",
  "Spaghetti Carbonara": "سباجيتي كاربونارا",
  "Koshary": "كشري",
  "Ful Medames": "فول مدمس",
  "Taameya": "طعمية",
  "Shakshuka": "شكشوكة",
  "Farakh Meshwi": "فراخ مشوية",
  "Chicken Molokhia": "ملوخية بالدجاج",
  "Chicken Fattah": "فتة دجاج",
  "Chicken Negresco": "نجرسكو دجاج",
  "Chicken Macarona Bechamel": "مكرونة بشاميل بالدجاج",
  "Creamy Tuscan Chicken": "دجاج توسكاني بصوص كريمي",
  "Tuscan Chicken": "دجاج على الطريقة التوسكانية",
  "Creamy Spinach Chicken": "دجاج بالسبانخ وصوص كريمي",
  "Chicken Florentine": "دجاج بالسبانخ وصوص كريمي",
  "Chicken Alfredo": "دجاج ألفريدو",
  "Chicken Parmesan": "دجاج بصلصة الطماطم والبارميزان",
  "Sayadeya": "صيادية سمك",
  "Samak Singari": "سمك سنجاري",
  "Egyptian Fish Tagine": "طاجن سمك مصري",
  "Alexandrian Shrimp": "جمبري إسكندراني",
  "Seafood Sayadeya": "صيادية بالمأكولات البحرية",
  "Shish Tawook": "شيش طاووق",
  "Shawarma Plate": "طبق شاورما",
  "Kibbeh": "كبة",
  "Samak Harra": "سمك حار",
  "Shrimp Sayadieh": "صيادية جمبري",
  "Pollo Cacciatore": "دجاج كاتشاتوري",
  "Chicken Piccata": "دجاج بيكاتا",
  "Tagliatelle al Ragu": "تالياتيلي بالراجو",
  "Shrimp Scampi": "جمبري سكامبي",
  "Shrimp Ceviche": "سيفيتشي جمبري",
  "Garlic Honey Shrimp": "جمبري بالعسل والثوم",
  "Shrimp Saganaki": "جمبري ساجاناكي",
  "Camarones al Ajo": "جمبري بالثوم",
  "Karides Guvec": "طاجن جمبري تركي",
  "Alexandrian Liver": "كبدة إسكندراني",
  "Fried Liver": "كبدة مقلية",
  "Liver Shawarma": "شاورما كبدة",
  "Spiced Liver": "كبدة متبلة",
  "Liver": "كبدة",
  "Lime Skewers & Shrimp": "أسياخ جمبري بالليمون",
  "Lime Skewers & Shrimp Marinade": "تتبيلة جمبري بالليمون",
  "Simple & Lime Skewers & Shrimp Marinade": "تتبيلة جمبري بسيطة بالليمون",
  "Butter Chicken": "دجاج بالزبدة",
  "Chicken Tikka Masala": "دجاج تيكا ماسالا",
  "Palak Paneer": "بالاك بانير بالسبانخ",
  "Hyderabadi Biryani": "برياني حيدر آبادي",
  "Paella Valenciana": "باييلا فالنسيانا",
  "Mole Poblano": "مولي بوبلانو",
  "Tandoori Chicken": "دجاج تندوري",
  "Gai Pad Krapow": "دجاج بالريحان التايلندي",
  "Pad Krapow Gai": "دجاج بالريحان التايلندي",
  "Pad Krapow Goong": "جمبري بالريحان التايلندي",
  "Cashew Chicken": "دجاج بالكاجو",
  "Chicken Cashew": "دجاج بالكاجو",
  "Chicken Cacciatore": "دجاج كاتشاتوري بصوص الطماطم",
  "Chicken and Dumplings": "دجاج بصوص كريمي مع زلابية آسيوية",
  "Creamy Chicken and Dumplings": "دجاج بصوص كريمي مع زلابية آسيوية",
  "Keema Matar": "كيما بالبازلاء",
  "Fish Curry": "كاري سمك",
  "Prawn Masala": "جمبري ماسالا",
  "Tinga de Pollo": "تينجا دجاج",
  "Picadillo": "بيكاديو",
  "Pescado a la Veracruzana": "سمك فيراكروز",
  "Aguachile": "أجوا تشيلي",
  "Fried Chicken": "دجاج مقلي",
  "Chicken Pot Pie": "فطيرة دجاج",
  "Sloppy Joe": "سلوبي جو",
  "Blackened Fish": "سمك متبل محمر",
  "Shrimp and Grits": "جمبري مع جريتس",
  "Kung Pao Chicken": "دجاج كونغ باو",
  "Mapo Tofu": "مابو توفو",
  "Miso Salmon": "سلمون ميسو",
  "Gai Yang": "دجاج تايلندي مشوي",
  "Larb Gai": "لارب دجاج",
  "Pla Rad Prik": "سمك تايلندي بصلصة الفلفل",
  "Goong Ob Woon Sen": "جمبري تايلندي بالنودلز الزجاجية",
  "Tavuk Sis": "شيش دجاج تركي",
  "Turkish Kofte": "كفتة تركية",
  "Adana Kebab": "كباب أضنة",
  "Manti": "مانتي تركي",
  "Levrek Bugulama": "سمك تركي مطهو بالبخار",
  "Greek Yogurt Berry Bowl": "وعاء زبادي يوناني بالتوت",
  "Cinnamon Banana Oatmeal": "شوفان بالموز والقرفة",
  "Avocado Egg Toast": "توست الأفوكادو والبيض",
  "Tofu Veggie Scramble": "توفو بالخضار",
  "Garlic Chicken Rice Bowl": "وعاء أرز بالدجاج والثوم",
  "Tomato Basil Chicken Skillet": "دجاج بالطماطم والريحان",
  "Spinach Garlic Pasta": "مكرونة بالسبانخ والثوم",
  "Rice and Bean Pantry Bowl": "وعاء أرز وفاصوليا",
  "Chicken Broccoli Power Bowl": "وعاء دجاج وبروكلي",
  "Mediterranean Chickpea Salad": "سلطة حمص متوسطية",
  "Turkey Quinoa Salad": "سلطة كينوا بالديك الرومي",
  "Lentil Vegetable Soup": "شوربة عدس بالخضار",
  "Salmon Asparagus Tray Bake": "سلمون مشوي مع الهليون",
  "Tofu Broccoli Stir Fry": "توفو وبروكلي سوتيه",
  "Cauliflower Chickpea Curry": "كاري قرنبيط وحمص",
  "Egyptian Tomato Egg Skillet": "شكشوكة مصرية بالطماطم",
  "Koshari Inspired Lentil Rice Bowl": "وعاء أرز وعدس مستوحى من الكشري",
  "Egyptian Chicken Rice Plate": "طبق دجاج وأرز مصري",
  "Middle Eastern Chickpea Cucumber Salad": "سلطة حمص وخيار شرقية",
  "Middle Eastern Chicken Chickpea Bowl": "وعاء دجاج وحمص شرقي",
  "Mediterranean Tomato Egg Toast": "توست بيض وطماطم متوسطي",
  "Mediterranean Salmon Rice Plate": "طبق سلمون وأرز متوسطي",
  "Egyptian Breakfast Beans with Tomato": "فول إفطار مصري بالطماطم",
  "Egyptian Lentil Tomato Soup": "شوربة عدس وطماطم مصرية",
  "Mediterranean Chickpea Rice Plate": "طبق أرز وحمص متوسطي",
  "Mediterranean Yogurt Cucumber Toast": "توست زبادي وخيار متوسطي",
  "Middle Eastern Lentil Rice Pilaf": "أرز بعدس على الطريقة الشرقية",
  "Egyptian Chickpea Tomato Stew": "طاجن حمص وطماطم مصري",
  "Huevos rancheros with black beans": "بيض رانشيروس مع فاصوليا سوداء",
  "Black bean breakfast tacos": "تاكوس إفطار بالفاصوليا السوداء",
  "Black bean avocado breakfast tacos": "تاكوس إفطار بالفاصوليا السوداء والأفوكادو",
  "Avocado corn tostada with scrambled eggs": "توستادا ذرة بالأفوكادو والبيض المخفوق",
  "Avocado corn tostada with tomato salsa": "توستادا ذرة بالأفوكادو وسالسا الطماطم",
  "Mexican quinoa breakfast bowl": "وعاء كينوا مكسيكي للإفطار",
  "Egg and nopales breakfast tacos": "تاكوس إفطار بالبيض والنوبال",
  "Nopales black bean breakfast tacos": "تاكوس إفطار بالنوبال والفاصوليا السوداء",
  "Sweet potato black bean hash": "هاش بطاطا حلوة وفاصوليا سوداء",
  "Chilaquiles verdes with eggs no crema": "تشيلاكويليس أخضر بالبيض بدون كريمة",
  "Chilaquiles verdes with black beans": "تشيلاكويليس أخضر بالفاصوليا السوداء",
  "Breakfast rice and black bean bowl": "وعاء إفطار بالأرز والفاصوليا السوداء",
  "Grilled fish tacos with cabbage salsa": "تاكوس سمك مشوي مع سالسا الكرنب",
  "Shrimp fajita bowl": "وعاء فاهيتا جمبري",
  "Tuna tostadas with avocado salsa": "توستادا تونة مع سالسا أفوكادو",
  "Ceviche tostadas with black beans": "توستادا سيفيتشي مع فاصوليا سوداء",
  "Grilled tilapia taco salad": "سلطة تاكو بلطي مشوي",
  "Shrimp black bean tacos": "تاكوس جمبري وفاصوليا سوداء",
  "Salmon rice bowl with corn salsa": "وعاء أرز بالسلمون وسالسا الذرة",
  "Baked tilapia Veracruz": "بلطي فيراكروز مخبوز",
  "Shrimp caldo with vegetables": "حساء جمبري مكسيكي بالخضار",
  "Salmon with roasted corn salsa": "سلمون مع سالسا ذرة مشوية",
  "Fish burrito bowl no dairy": "وعاء بوريتو سمك بدون ألبان",
  "Shrimp enchilada skillet with salsa roja": "مقلاة إنشيلادا جمبري بصلصة روجا",
  "Seafood pozole verde": "بوزولي أخضر بالمأكولات البحرية",
  "Tuna stuffed poblano peppers": "فلفل بوبلانو محشي بالتونة",
  "Flexible meal slot": "وجبة مرنة"
};

const CUISINES: Record<string, string> = {
  American: "أمريكي",
  Italian: "إيطالي",
  "Italian-American": "إيطالي أمريكي",
  "Latin American": "لاتيني",
  Mexican: "مكسيكي",
  Indian: "هندي",
  Mediterranean: "متوسطي",
  "Middle Eastern": "شرق أوسطي",
  Egyptian: "مصري",
  Asian: "آسيوي",
  Thai: "تايلندي",
  Turkish: "تركي",
  Unknown: "غير محدد"
};

const INGREDIENTS: Record<string, string> = {
  ...ARABIC_CULINARY_DICTIONARY.ingredients,
  "greek yogurt": "زبادي يوناني",
  "mixed berries": "توت مشكل",
  granola: "جرانولا",
  oats: "شوفان",
  banana: "موز",
  cinnamon: "قرفة",
  egg: "بيض",
  avocado: "أفوكادو",
  bread: "خبز",
  tofu: "توفو",
  spinach: "سبانخ",
  tomato: "طماطم",
  "olive oil": "زيت زيتون",
  "chicken breast": "صدر دجاج",
  chicken: "دجاج",
  "cooking cream": "كريمة طبخ",
  "heavy cream": "كريمة طبخ",
  cream: "كريمة طبخ",
  "cream sauce": "صوص كريمي",
  "creamy sauce": "صوص كريمي",
  parmesan: "بارميزان",
  rice: "أرز",
  broccoli: "بروكلي",
  garlic: "ثوم",
  honey: "عسل",
  basil: "ريحان",
  cumin: "كمون",
  coriander: "كزبرة",
  paprika: "بابريكا",
  turmeric: "كركم",
  oregano: "أوريجانو",
  thyme: "زعتر",
  rosemary: "روزماري",
  "black pepper": "فلفل أسود",
  salt: "ملح",
  "chili powder": "شطة مطحونة",
  "curry powder": "مسحوق كاري",
  "garlic powder": "ثوم بودرة",
  "onion powder": "بصل بودرة",
  pasta: "مكرونة",
  spaghetti: "سباجيتي",
  penne: "بيني",
  fettuccine: "فيتوتشيني",
  macaroni: "مكرونة أقلام",
  linguine: "لينجويني",
  "canned beans": "فول",
  chickpeas: "حمص",
  chickpea: "حمص",
  paneer: "جبنة بانير",
  olives: "زيتون",
  capers: "كبر",
  anchovies: "أنشوجة",
  guanciale: "لحم مقدد",
  breadcrumbs: "بقسماط",
  mustard: "خردل",
  tahini: "طحينة",
  pickles: "مخلل",
  salad: "سلطة",
  bulgur: "برغل",
  "tomato paste": "معجون طماطم",
  "pepper paste": "معجون فلفل",
  cucumber: "خيار",
  "turkey breast": "صدر ديك رومي",
  quinoa: "كينوا",
  lentils: "عدس",
  onion: "بصل",
  salmon: "سلمون",
  shrimp: "جمبري",
  shrimps: "جمبري",
  prawn: "جمبري",
  prawns: "جمبري",
  seafood: "مأكولات بحرية",
  asparagus: "هليون",
  cauliflower: "قرنبيط",
  "grilled chicken": "دجاج مشوي",
  greens: "خضار ورقية",
  "salmon fillets": "شرائح سلمون",
  "sweet potato": "بطاطا حلوة",
  eggs: "بيض",
  "black beans": "فاصوليا سوداء",
  "corn tortilla": "تورتيلا ذرة",
  "corn tortillas": "تورتيلا ذرة",
  salsa: "سالسا",
  "tomato salsa": "سالسا طماطم",
  "salsa verde": "سالسا خضراء",
  "pico de gallo": "بيكو دي جايو",
  cabbage: "كرنب",
  "white fish": "سمك أبيض",
  tilapia: "بلطي",
  tuna: "تونة",
  "corn tostadas": "توستادا ذرة",
  "corn tostada": "توستادا ذرة",
  "brown rice": "أرز بني",
  "egyptian rice": "أرز",
  "white rice": "أرز",
  "coconut milk": "حليب جوز الهند",
  "oat milk": "حليب الشوفان",
  "almond milk": "حليب اللوز",
  corn: "ذرة",
  "corn salsa": "سالسا ذرة",
  hominy: "ذرة هوميني",
  tomatillo: "توماتيو",
  "tomatillo salsa": "سالسا توماتيو",
  "poblano peppers": "فلفل بوبلانو",
  nopales: "نوبال",
  "baked tortilla chips": "رقائق تورتيلا مخبوزة",
  "tomato enchilada sauce": "صلصة إنشيلادا بالطماطم",
  "bell pepper": "فلفل رومي",
  "bell peppers": "فلفل رومي",
  carrot: "جزر",
  zucchini: "كوسا",
  lemon: "ليمون"
};

const ENGLISH_TO_ARABIC_INGREDIENT_OVERRIDES: Record<string, string> = {
  bean: "فول",
  beans: "فول",
  "broad beans": "فول",
  "canned beans": "فول",
  "fava beans": "فول",
  "bell peppers": "فلفل رومي",
  "bell pepper": "فلفل رومي",
  "black pepper": "فلفل أسود",
  pepper: "فلفل",
  shrimp: "جمبري",
  shrimps: "جمبري",
  prawn: "جمبري",
  prawns: "جمبري",
  seafood: "مأكولات بحرية",
  "ground beef": "لحم مفروم",
  "ground meat": "لحم مفروم",
  beef: "لحم",
  "minced meat": "لحم مفروم",
  "minced beef": "لحم مفروم",
  liver: "كبدة",
  "beef liver": "كبدة",
  "chicken liver": "كبدة دجاج",
  chicken: "دجاج",
  molokhia: "ملوخية",
  "molokhia leaves": "ملوخية",
  saffron: "زعفران",
  rabbit: "أرنب",
  "green beans": "فاصوليا خضراء",
  herbs: "أعشاب",
  herb: "عشب",
  chocolate: "شوكولاتة",
  chili: "فلفل حار",
  spices: "بهارات",
  spice: "بهارات",
  yogurt: "زبادي",
  mint: "نعناع",
  "fried onion": "بصل محمر",
  chickpea: "حمص",
  paneer: "جبنة بانير",
  olives: "زيتون",
  capers: "كبر",
  anchovies: "أنشوجة",
  guanciale: "لحم مقدد",
  breadcrumbs: "بقسماط",
  mustard: "خردل",
  tahini: "طحينة",
  pickles: "مخلل",
  salad: "سلطة",
  bulgur: "برغل",
  "tomato paste": "معجون طماطم",
  "pepper paste": "معجون فلفل",
  flour: "دقيق",
  butter: "زبدة",
  cheese: "جبنة",
  fenugreek: "حلبة",
  "garam masala": "جارام ماسالا",
  ginger: "زنجبيل",
  "cooking cream": "كريمة طبخ",
  "heavy cream": "كريمة طبخ",
  cream: "كريمة طبخ",
  "cream sauce": "صوص كريمي",
  "creamy sauce": "صوص كريمي",
  parmesan: "بارميزان",
  "parmesan cheese": "جبنة بارميزان",
  lime: "ليمون أخضر",
  limes: "ليمون أخضر",
  "lime juice": "عصير ليمون أخضر",
  honey: "عسل",
  "tortilla chips": "رقائق تورتيلا",
  tortilla: "تورتيلا",
  chips: "رقائق",
  cilantro: "كزبرة",
  coriander: "كزبرة",
  "red onion": "بصل أحمر",
  jalapeno: "فلفل حار",
  "jalapeño": "فلفل حار",
  ceviche: "سيفيتشي",
  skewer: "سيخ",
  skewers: "أسياخ",
  marinade: "تتبيلة",
  "finely chopped": "مفروم ناعما",
  chopped: "مفروم",
  diced: "مقطع مكعبات",
  sliced: "مقطع شرائح",
  fresh: "طازج",
  raw: "نيء",
  cooked: "مطبوخ",
  juice: "عصير",
  zest: "بشر",
  salt: "ملح",
  bechamel: "بشاميل",
  spaghetti: "سباجيتي",
  penne: "بيني",
  fettuccine: "فيتوتشيني",
  macaroni: "مكرونة أقلام",
  linguine: "لينجويني",
  nori: "\u0637\u062d\u0627\u0644\u0628 \u0646\u0648\u0631\u064a",
  edamame: "\u0641\u0648\u0644 \u0635\u0648\u064a\u0627 \u0623\u062e\u0636\u0631",
  "sushi rice": "\u0623\u0631\u0632 \u0633\u0648\u0634\u064a",
  "egyptian rice": "أرز",
  "white rice": "أرز",
  "coconut milk": "حليب جوز الهند",
  "oat milk": "حليب الشوفان",
  "almond milk": "حليب اللوز",
  seaweed: "\u0637\u062d\u0627\u0644\u0628 \u0628\u062d\u0631\u064a\u0629"
};

const ARABIC_TO_ENGLISH_INGREDIENT_OVERRIDES: Record<string, string> = {
  "عيش": "baladi bread",
  "خبز": "bread",
  "خبز بلدي": "baladi bread",
  "عيش بلدي": "baladi bread",
  "لحم مفروم": "ground meat",
  "لحمه مفرومه": "ground meat",
  "لحمة مفرومة": "ground meat",
  "لحمة مفرومةو": "ground meat",
  "اللحم المفروم": "ground meat",
  "فول": "canned beans",
  "فول مدمس": "fava beans",
  "فاصوليا عريضة": "fava beans",
  "فلفل أسود": "black pepper",
  "فلفل رومي": "bell pepper",
  "كبدة": "liver",
  "كبده": "liver",
  "كبدة دجاج": "chicken liver",
  "سمك": "fish",
  "سمكة": "fish",
  "أسماك": "fish",
  "اسماك": "fish",
  "سي فود": "seafood",
  "مأكولات بحرية": "seafood",
  "مأكولات بحريه": "seafood",
  "المأكولات البحرية": "seafood",
  "روبيان": "shrimp",
  "ملح": "salt",
  "بشاميل": "bechamel",
  "سباجيتي": "spaghetti",
  "بيني": "penne",
  "فيتوتشيني": "fettuccine",
  "مكرونة أقلام": "macaroni",
  "لينجويني": "linguine",
  "\u0646\u0648\u0631\u064a": "nori",
  "\u0637\u062d\u0627\u0644\u0628 \u0646\u0648\u0631\u064a": "nori",
  "\u064a\u062f\u0627\u0645\u0627\u0645\u064a": "edamame",
  "\u0625\u062f\u0627\u0645\u0627\u0645\u064a": "edamame",
  "\u0641\u0648\u0644 \u0635\u0648\u064a\u0627 \u0623\u062e\u0636\u0631": "edamame",
  "\u0623\u0631\u0632 \u0633\u0648\u0634\u064a": "sushi rice",
  "أرز": "rice",
  "ارز": "rice",
  "رز": "rice",
  "أرز مصري": "rice",
  "ارز مصري": "rice",
  "رز مصري": "rice",
  "أرز أبيض": "rice",
  "ارز ابيض": "rice",
  "حليب جوز الهند": "coconut milk",
  "حليب جوزالهند": "coconut milk",
  "كوكو نت ميلك": "coconut milk",
  "حليب الشوفان": "oat milk",
  "حليب اللوز": "almond milk",
  "\u0637\u062d\u0627\u0644\u0628 \u0628\u062d\u0631\u064a\u0629": "seaweed"
};

const STEP_TRANSLATIONS: Record<string, string> = {
  "Spoon yogurt into a bowl.": "ضع الزبادي في وعاء.",
  "Top with berries.": "أضف التوت فوقه.",
  "Finish with granola.": "أنه الطبق بالجرانولا.",
  "Cook oats.": "اطه الشوفان حتى يطرى.",
  "Slice banana into the pot.": "أضف شرائح الموز إلى القدر.",
  "Finish with cinnamon.": "أنه الطبق بالقرفة.",
  "Toast the bread.": "حمص الخبز.",
  "Cook the eggs.": "اطه البيض.",
  "Mash avocado and assemble.": "اهرس الأفوكادو ورتب المكونات.",
  "Crumble tofu.": "فتت التوفو.",
  "Saute spinach and tomato.": "شوح السبانخ والطماطم.",
  "Add tofu and cook until warm.": "أضف التوفو واطهه حتى يسخن.",
  "Cook the rice.": "اطه الأرز.",
  "Season and sear the chicken.": "تبل الدجاج وحمره في المقلاة.",
  "Steam the broccoli.": "اطه البروكلي على البخار.",
  "Saute garlic and combine before serving.": "شوح الثوم واخلطه مع المكونات قبل التقديم.",
  "Brown the chicken.": "حمر الدجاج.",
  "Add garlic and tomatoes.": "أضف الثوم والطماطم.",
  "Simmer until glossy.": "اترك الخليط يغلي بهدوء حتى يصبح لامعا.",
  "Finish with basil and olive oil.": "أنه الطبق بالريحان وزيت الزيتون.",
  "Cook the pasta.": "اسلق المكرونة.",
  "Saute garlic in olive oil.": "شوح الثوم في زيت الزيتون.",
  "Wilt the spinach.": "أضف السبانخ حتى تذبل.",
  "Toss together and finish with basil.": "اخلط المكونات وأنه الطبق بالريحان.",
  "Warm the beans.": "سخّن الفول.",
  "Fold in tomato and olive oil.": "أضف الطماطم وزيت الزيتون برفق.",
  "Serve as bowls.": "قدمها في أوعية.",
  "Cook the chicken.": "اطه الدجاج.",
  "Serve over rice with olive oil.": "قدمها فوق الأرز مع زيت الزيتون.",
  "Drain chickpeas.": "صف الحمص.",
  "Chop the vegetables.": "قطع الخضار.",
  "Toss everything with olive oil.": "اخلط كل شيء بزيت الزيتون.",
  "Cook quinoa.": "اطه الكينوا.",
  "Roast or sear turkey.": "اشو أو حمر الديك الرومي.",
  "Slice and toss together.": "قطعه واخلطه مع باقي المكونات.",
  "Saute onion and garlic.": "شوح البصل والثوم.",
  "Add lentils and tomato.": "أضف العدس والطماطم.",
  "Simmer until tender.": "اتركه يغلي بهدوء حتى ينضج.",
  "Arrange salmon and asparagus on a tray.": "رتب السلمون والهليون في صينية.",
  "Drizzle with oil.": "أضف قليلا من الزيت.",
  "Bake until salmon flakes.": "اخبزه حتى ينضج السلمون ويتفتت بسهولة.",
  "Brown tofu.": "حمر التوفو.",
  "Stir fry broccoli and garlic.": "شوح البروكلي والثوم بسرعة.",
  "Serve over rice.": "قدمه فوق الأرز.",
  "Saute onion.": "شوح البصل.",
  "Add cauliflower and chickpeas.": "أضف القرنبيط والحمص.",
  "Simmer with tomato until tender.": "اطهه مع الطماطم حتى يطرى.",
  "Crack in eggs and cook to your liking.": "أضف البيض واطهه حسب الرغبة.",
  "Serve hot with bread.": "قدمه ساخنا مع الخبز."
};

const REVERSE_RECIPE_TITLES = reverseLookup(RECIPE_TITLES);
const FOOD_DICTIONARY_TRANSLATIONS = buildFoodDictionaryLocalizationLookups();
const NORMALIZED_RECIPE_TITLE_LOOKUP: Record<string, string> = Object.fromEntries(
  Object.entries(RECIPE_TITLES).map(([title, localizedTitle]) => [normalizeTranslationKey(title), localizedTitle])
);
const REVERSE_CUISINES = reverseLookup(CUISINES);
const REVERSE_INGREDIENTS = reverseLookup(INGREDIENTS);
const REVERSE_STEP_TRANSLATIONS = reverseLookup(STEP_TRANSLATIONS);

const {
  englishToArabic: TAXONOMY_ENGLISH_TO_ARABIC,
  arabicToEnglish: TAXONOMY_ARABIC_TO_ENGLISH
} = buildIngredientTranslationLookups();

const ENGLISH_TO_ARABIC_INGREDIENT_LOOKUP: Record<string, string> = {
  ...TAXONOMY_ENGLISH_TO_ARABIC,
  ...FOOD_DICTIONARY_TRANSLATIONS.englishToArabic,
  ...INGREDIENTS,
  ...ENGLISH_TO_ARABIC_INGREDIENT_OVERRIDES
};

const ARABIC_TO_ENGLISH_INGREDIENT_LOOKUP: Record<string, string> = {
  ...TAXONOMY_ARABIC_TO_ENGLISH,
  ...FOOD_DICTIONARY_TRANSLATIONS.arabicToEnglish,
  ...REVERSE_INGREDIENTS,
  ...ARABIC_TO_ENGLISH_INGREDIENT_OVERRIDES
};

export function localizeRecipeForArabic(recipe: Recipe): Recipe {
  return {
    ...recipe,
    name: translateRecipeTitle(recipe.name),
    cuisine: translateCuisine(recipe.cuisine),
    ingredients: recipe.ingredients.map(translateIngredient),
    missing_ingredients: recipe.missing_ingredients.map(translateIngredient),
    steps: recipe.steps.map(translateStep),
    cook_time: translateCookTimeToArabic(recipe.cook_time),
    difficulty: translateDifficultyToArabic(recipe.difficulty),
    preference_hits: normalizeStringArray(recipe.preference_hits).map(translatePreferenceHit)
  };
}

export function ensureArabicRecipeLanguage(recipe: Recipe): Recipe {
  const localized = localizeRecipeForArabic(recipe);
  const ingredients = localized.ingredients.map((ingredient) =>
    ensureArabicIngredientText(ingredient)
  ).filter(Boolean);
  const missingIngredients = localized.missing_ingredients.map((ingredient) =>
    ensureArabicIngredientText(ingredient)
  ).filter(Boolean);
  const baseRecipe: Recipe = {
    ...localized,
    name: ensureArabicTitleText(localized, ingredients, missingIngredients),
    cuisine: ensureArabicCuisineText(localized.cuisine),
    ingredients,
    missing_ingredients: missingIngredients,
    cook_time: hasLatinText(localized.cook_time) ? "30 دقيقة" : localized.cook_time,
    difficulty: hasLatinText(localized.difficulty) ? "متوسط" : localized.difficulty,
    preference_hits: normalizeStringArray(localized.preference_hits)
      .map(translatePreferenceHit)
      .filter((hit) => !hasLatinText(hit))
  };

  return {
    ...baseRecipe,
    // Do not transliterate an untranslated source instruction into fake Arabic.
    // A complete Arabic rule-based translation is useful; otherwise preserve
    // the original authored English step until a real translation is available.
    steps: buildArabicOnlySteps(recipe.steps)
  };
}

export function localizeRecipeForEnglish(recipe: Recipe): Recipe {
  return {
    ...recipe,
    name: translateRecipeTitleToEnglish(recipe.name, recipe.image_search_index),
    cuisine: translateCuisineToEnglish(recipe.cuisine),
    ingredients: recipe.ingredients.map(translateIngredientToEnglish),
    missing_ingredients: recipe.missing_ingredients.map(translateIngredientToEnglish),
    steps: recipe.steps.map(translateStepToEnglish),
    cook_time: translateCookTimeToEnglish(recipe.cook_time),
    difficulty: translateDifficultyToEnglish(recipe.difficulty),
    preference_hits: normalizeStringArray(recipe.preference_hits).map(translatePreferenceHitToEnglish)
  };
}

export function localizeMealForArabic(meal: MealPlanMeal): MealPlanMeal {
  return {
    ...meal,
    name: ensureArabicDisplayText(translateRecipeTitle(meal.name)),
    cuisine: meal.cuisine ? ensureArabicDisplayText(translateCuisine(meal.cuisine)) : meal.cuisine,
    protein: translateMacroTextToArabic(meal.protein),
    carbs: translateMacroTextToArabic(meal.carbs),
    fat: translateMacroTextToArabic(meal.fat),
    ingredients: meal.ingredients?.map((ingredient) => ensureArabicDisplayText(translateIngredient(ingredient))),
    steps: meal.steps?.map((step) => ensureArabicDisplayText(translateStep(step)))
  };
}

export function localizeMealForEnglish(meal: MealPlanMeal): MealPlanMeal {
  return {
    ...meal,
    name: translateRecipeTitleToEnglish(meal.name, meal.image_search_index),
    cuisine: meal.cuisine ? translateCuisineToEnglish(meal.cuisine) : meal.cuisine,
    ingredients: meal.ingredients?.map(translateIngredientToEnglish),
    steps: meal.steps?.map(translateStepToEnglish)
  };
}

export function localizeMealPlanForArabic(mealPlan: MealPlanData): MealPlanData {
  return {
    ...mealPlan,
    plan: mealPlan.plan.map((day) => ({
      ...day,
      day: translateDay(day.day),
      breakfast: localizeMealForArabic(day.breakfast),
      lunch: localizeMealForArabic(day.lunch),
      dinner: localizeMealForArabic(day.dinner)
    })),
    shoppingList: mealPlan.shoppingList.map((item) => ensureArabicDisplayText(translateShoppingItem(item))),
    recommendedRecipes: mealPlan.recommendedRecipes?.map(ensureArabicRecipeLanguage)
  };
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function isArabicRecipeLanguage(language?: string) {
  return language?.toLowerCase() === "arabic" || language?.toLowerCase() === "ar" || language === "العربية";
}

function translateRecipeTitle(value: string) {
  const normalized = normalizeTranslationKey(value);
  const exact =
    RECIPE_TITLES[value] ??
    NORMALIZED_RECIPE_TITLE_LOOKUP[normalized] ??
    FOOD_DICTIONARY_TRANSLATIONS.englishToArabic[normalized];
  if (exact) return exact;
  if (!/[A-Za-z]/.test(value)) return value;
  // Recipe titles must be localized by meaning. Do not turn an unknown Latin
  // dish name into Arabic-looking phonetics; ensureArabicTitleText will build
  // a clean ingredient/cuisine title when no authored equivalent exists.
  return translateEnglishRecipeTitle(value);
}

function ensureArabicTitleText(recipe: Pick<Recipe, "name" | "image_search_index" | "image_search_indices">, ingredients: string[], missingIngredients: string[]) {
  const translated = translateRecipeTitle(recipe.name);
  if (!hasLatinText(translated) && translated.trim() && !isWeakArabicGeneratedTitle(translated)) {
    return translated.trim();
  }

  for (const candidate of [recipe.image_search_index, ...(recipe.image_search_indices ?? [])]) {
    if (!candidate) continue;
    const translatedCandidate = translateRecipeTitle(candidate);
    if (!hasLatinText(translatedCandidate) && translatedCandidate.trim() && !isWeakArabicGeneratedTitle(translatedCandidate)) {
      return translatedCandidate.trim();
    }
  }

  const stripped = stripLatinText(translated);
  if (stripped && !isWeakArabicGeneratedTitle(stripped)) {
    return stripped;
  }

  const leadIngredients = [...ingredients, ...missingIngredients]
    .filter((ingredient) => ingredient && !hasLatinText(ingredient))
    .slice(0, 2);

  return ["وصفة", ...leadIngredients].join(" ").replace(/\s+/g, " ").trim() || "وصفة مقترحة";
}

function isWeakArabicGeneratedTitle(value: string) {
  return (
    /مكون إضافي/u.test(value) ||
    /^مع\s+\S+/u.test(value.trim()) ||
    /^(طبق|وعاء|وجبة)\s+(عشاء|غداء|فطور|خفيفة)\b/u.test(value) ||
    /\b(عشاء|غداء|فطور)\s+(جمبري|دجاج|لحم|سمك|أرز|طماطم|ثوم|ليمون)/u.test(value)
  );
}

export function translateRecipeTitleToEnglish(value: string, fallbackQuery?: string) {
  const normalized = normalizeTranslationKey(value);
  const weakIngredientTitle = translateWeakArabicIngredientTitleToEnglish(normalized);
  if (weakIngredientTitle) {
    return weakIngredientTitle;
  }

  if (/حواوشي|خبز\s+محشو|عيش\s+محشو|محشو\s+باللحم\s+المفروم/.test(normalized)) {
    return "Hawawshi";
  }
  if (/mahshi.*فلفل|محشي.*فلفل|فلفل.*محشي|bell.*فلفل/.test(normalized)) return "Mahshi Bell Peppers";
  if (/مكرونة\s+بشاميل|مكرونه\s+بشاميل|بشاميل/.test(normalized)) return "Macarona Bechamel";
  if (/كشري/.test(normalized)) return "Koshary";
  if (/كفتة|كفته|kofta/.test(normalized)) return "Kofta";
  if (/طاجن\s+كفتة|طاجن\s+كفته/.test(normalized)) return "Taagen Kofta";
  if (/فراخ\s+مشوية|دجاج\s+مشوي|farakh/.test(normalized)) return "Farakh Meshwi";
  if (/ملوخية.*دجاج|دجاج.*ملوخية/.test(normalized)) return "Chicken Molokhia";
  if (/فتة.*دجاج|دجاج.*فتة/.test(normalized)) return "Chicken Fattah";
  if (/نجرسكو|negresco/.test(normalized)) return "Chicken Negresco";
  if (/صيادية|صياديه/.test(normalized)) return /جمبري|seafood|مأكولات/.test(normalized) ? "Seafood Sayadeya" : "Sayadeya";
  if (/سمك\s+سنجاري|سنجاري/.test(normalized)) return "Samak Singari";
  if (/طاجن\s+سمك/.test(normalized)) return "Egyptian Fish Tagine";
  if (/جمبري\s+إسكندراني|جمبري\s+اسكندراني|اسكندراني/.test(normalized)) return "Alexandrian Shrimp";
  if (/سي\s*فود|مأكولات\s+بحري(?:ة|ه)|بحري(?:ة|ه)|seafood/.test(normalized)) {
    if (/باستا|مكرونة|مكرونه|سباجيتي|لينجويني/.test(normalized)) {
      if (/طماطم|صلصة/.test(normalized)) return "Seafood Pasta with Tomato Sauce";
      return "Seafood Pasta";
    }
    if (/شوربة|حساء/.test(normalized)) {
      if (/خضار|خضروات/.test(normalized)) return "Seafood Vegetable Soup";
      if (/ليمون|أعشاب|اعشاب/.test(normalized)) return "Lemon Herb Seafood Soup";
      return "Seafood Soup";
    }
    if (/سلطة/.test(normalized)) {
      if (/ليمون|كزبرة/.test(normalized)) return "Lemon Cilantro Seafood Salad";
      return "Seafood Salad";
    }
    if (/كينوا/.test(normalized)) return "Seafood Quinoa Bowl";
    if (/مشوي|مشوية/.test(normalized)) return "Grilled Seafood Plate";
    return "Seafood Plate";
  }
  if (/جمبري|روبيان/.test(normalized)) {
    if (/(?:ال)?كاري\s+(?:ال)?(?:أخضر|اخضر)/.test(normalized)) return "Green Curry Shrimp";
    if (/مشوي|مشوية/.test(normalized)) {
      if (/أعشاب|اعشاب/.test(normalized)) return "Grilled Herb Shrimp";
      return "Grilled Shrimp";
    }
    if (/بقسماط|مقرمش|مقرمشة|مقلي|مقلية/.test(normalized)) return "Fried Shrimp Plate";
    if (/ثوم.*زيت\s+زيتون|زيت\s+زيتون.*ثوم/.test(normalized)) return "Garlic Olive Oil Shrimp";
    if (/ليمون.*كزبرة|كزبرة.*ليمون/.test(normalized)) return "Lemon Cilantro Shrimp";
    if (/ثوم.*ليمون|ليمون.*ثوم/.test(normalized)) return "Lemon Garlic Shrimp";
  }
  if (/كبدة\s+إسكندراني|كبدة\s+اسكندراني|كبده\s+إسكندراني|كبده\s+اسكندراني/.test(normalized)) {
    return "Alexandrian Liver";
  }
  if (/كبدة|كبده/.test(normalized)) {
    if (/ساندويتش|سندويتش/.test(normalized)) return "Egyptian Kebda Sandwiches";
    if (/بقدونس.*ثوم|ثوم.*بقدونس/.test(normalized)) return "Liver with Parsley and Garlic";
    if (/ليمون.*ثوم|ثوم.*ليمون/.test(normalized)) return "Garlic Lemon Liver";
    if (/مشروم|فطر/.test(normalized)) return "Liver with Mushrooms";
    if (/بصل\s+مكرمل|المكرمل/.test(normalized)) return "Liver with Caramelized Onions";
    if (/فلفل\s+حار|شطة|حار/.test(normalized)) return "Spicy Garlic Liver";
    if (/كمون/.test(normalized)) return "Cumin Fried Liver";
    if (/مطهوة|مطبوخة|ا?عشاب|أعشاب/.test(normalized)) return "Herb Stewed Liver";
    if (/مقرمشة|مقرمش|مقلية|مقلي|تحمير/.test(normalized)) return "Fried Liver";
    if (/شاورما/.test(normalized)) return "Liver Shawarma";
    if (/بهارات|متبلة|متبل/.test(normalized)) return "Spiced Liver";
    return "Liver";
  }
  if (/شيش\s+طاووق/.test(normalized)) return "Shish Tawook";
  if (/شاورما/.test(normalized)) return "Shawarma Plate";
  if (/كبة|كبه/.test(normalized)) return "Kibbeh";
  if (/طعمية|طعميه/.test(normalized)) return "Taameya";
  if (/فول\s+مدمس|فول/.test(normalized)) return "Ful Medames";
  if (/شكشوكة|شكشوكه/.test(normalized)) return "Shakshuka";
  if (/(?:أفوكادو|افوكادو).*(?:طماطم|بندور(?:ة|ه)).*(?:ساوردوغ|توست|خبز|عيش)|(?:ساوردوغ|توست|خبز|عيش).*(?:أفوكادو|افوكادو).*(?:طماطم|بندور(?:ة|ه))/.test(normalized)) {
    return "Avocado Tomato Sourdough Toast";
  }
  if (/(?:باذنجان|بتنجان|باذنجانة|بانجان).*(?:طماطم|صلصة).*(?:مكرونة|مكرونه|باستا|سباجيتي|بيني)|(?:مكرونة|مكرونه|باستا|سباجيتي|بيني).*(?:باذنجان|بتنجان|باذنجانة|بانجان).*(?:طماطم|صلصة)/.test(normalized)) {
    return "Eggplant Tomato Pasta";
  }
  if (/شوربة.*عدس|عدس.*شوربة/.test(normalized)) {
    if (/طماطم|مصري|مصرية/.test(normalized)) return "Egyptian Lentil Tomato Soup";
    return "Lentil Soup";
  }
  if (/(أرز|ارز|رز).*عدس|عدس.*(أرز|ارز|رز)/.test(normalized)) {
    return /كشري/.test(normalized) ? "Koshary" : "Mujadara";
  }
  if (/عدس.*مقلاة|مقلاة.*عدس/.test(normalized)) return "Lentil Skillet";
  if (/حمص.*طماطم|طماطم.*حمص/.test(normalized)) return "Chickpea Tomato Stew";
  if (/دجاج\s+بالزبدة|دجاج\s+بالزبده/.test(normalized)) return "Butter Chicken";
  if (/دجاج\s+تندوري/.test(normalized)) return "Tandoori Chicken";
  if (/كاري\s+سمك/.test(normalized)) return "Fish Curry";
  if (/جمبري\s+ماسالا/.test(normalized)) return "Prawn Masala";
  if (/دجاج\s+مقلي/.test(normalized)) return "Fried Chicken";
  if (/سمك\s+متبل\s+محمر/.test(normalized)) return "Blackened Fish";
  if (/دجاج\s+كونغ\s+باو/.test(normalized)) return "Kung Pao Chicken";
  if (/سلمون\s+ميسو/.test(normalized)) return "Miso Salmon";
  if (/كباب\s+أضنة|كباب\s+اضنة/.test(normalized)) return "Adana Kebab";
  if (/مانتي/.test(normalized)) return "Manti";
  if (/كفتة\s+تركية|كفته\s+تركيه/.test(normalized)) return "Turkish Kofte";

  const composedArabicTitle = translateComposedArabicRecipeTitleToEnglish(normalized);
  if (composedArabicTitle) return composedArabicTitle;

  return REVERSE_RECIPE_TITLES[value] ?? toTitleCase(fallbackQuery ?? value);
}

function translateComposedArabicRecipeTitleToEnglish(normalized: string) {
  if (!/[\u0600-\u06FF]/.test(normalized)) return null;

  const protein = detectArabicRecipeProtein(normalized);
  const egg = /بيض/.test(normalized);
  const starch = detectArabicRecipeStarch(normalized);
  const sauce = detectArabicRecipeSauce(normalized);
  const vegetables = detectArabicRecipeVegetables(normalized);
  const method = detectArabicRecipeMethod(normalized);
  const startsWithEgg = /^بيض\b/u.test(normalized);
  const modifiers: string[] = [];

  if (egg) {
    if (/مخفوق/.test(normalized)) modifiers.push("Scrambled Eggs");
    else if (/عيون/.test(normalized)) modifiers.push("Sunny-Side Up Eggs");
    else if (/مسلوق/.test(normalized)) modifiers.push("Boiled Eggs");
    else if (/^بيض\b.*(?:مقلي|مقلية)|(?:مقلي|مقلية)\s+بيض/u.test(normalized)) modifiers.push("Fried Eggs");
    else modifiers.push("Eggs");
  }

  if (!protein && !starch && !sauce && !vegetables.length && !modifiers.length) return null;

  const leadBase = startsWithEgg && modifiers.length ? modifiers.shift() : protein ?? starch ?? modifiers.shift() ?? "Dish";
  const methodAppliesToLead = Boolean(method && protein && !startsWithEgg);
  const lead = methodAppliesToLead ? `${method} ${leadBase}` : leadBase;
  const details = [...modifiers];
  if (startsWithEgg && protein) details.push(protein);
  if (sauce) details.push(sauce);
  if (starch && starch !== leadBase) details.push(starch);
  details.push(...vegetables);

  return [lead, details.length ? `with ${details.join(" and ")}` : ""]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectArabicRecipeProtein(normalized: string) {
  if (/لحم\s+مفروم|لحمة\s+مفرومة|اللحم\s+المفروم/.test(normalized)) return "Ground Meat";
  if (/لحم|لحمة|لحمه/.test(normalized)) return "Meat";
  if (/دجاج|فراخ/.test(normalized)) return "Chicken";
  if (/سي\s*فود|مأكولات\s+بحري(?:ة|ه)|بحري(?:ة|ه)/.test(normalized)) return "Seafood";
  if (/سمك|سمكة|اسماك|أسماك/.test(normalized)) return "Fish";
  if (/جمبري|روبيان/.test(normalized)) return "Shrimp";
  if (/كبدة|كبده/.test(normalized)) return "Liver";
  if (/عدس/.test(normalized)) return "Lentils";
  if (/حمص/.test(normalized)) return "Chickpeas";
  if (/فول|فاصوليا|لوبياء|لوبيا/.test(normalized)) return "Beans";
  return null;
}

function detectArabicRecipeStarch(normalized: string) {
  if (/مكرونة|مكرونه|باستا|بيني|سباجيتي/.test(normalized)) return "Pasta";
  if (/أرز|ارز|رز/.test(normalized)) return "Rice";
  if (/بطاطس|بطاطا/.test(normalized)) return "Potatoes";
  if (/خبز|عيش|توست|ساوردوغ|سوردو/.test(normalized)) return "Bread";
  return null;
}

function detectArabicRecipeSauce(normalized: string) {
  if (/طماطم|صلصة\s+حمراء/.test(normalized)) return "Tomato Sauce";
  if (/بشاميل/.test(normalized)) return "Bechamel";
  if (/كاري/.test(normalized)) return "Curry";
  if (/ثوم/.test(normalized)) return "Garlic";
  if (/ليمون/.test(normalized)) return "Lemon";
  return null;
}

function detectArabicRecipeVegetables(normalized: string) {
  const vegetables: string[] = [];
  if (/باذنجان|بتنجان|بانجان/.test(normalized)) vegetables.push("Eggplant");
  if (/أفوكادو|افوكادو/.test(normalized)) vegetables.push("Avocado");
  if (/طماطم|بندور(?:ة|ه)/.test(normalized)) vegetables.push("Tomato");
  if (/بصل/.test(normalized)) vegetables.push("Onions");
  if (/فلفل/.test(normalized)) vegetables.push("Peppers");
  if (/خضار|خضروات/.test(normalized)) vegetables.push("Vegetables");
  return vegetables;
}

function detectArabicRecipeMethod(normalized: string) {
  if (/مشوي|مشوية/.test(normalized)) return "Grilled";
  if (/مقلي|مقلية/.test(normalized)) return "Fried";
  if (/مسلوق|مسلوقة/.test(normalized)) return "Boiled";
  if (/مطهو|مطبوخ/.test(normalized)) return "Cooked";
  if (/مقلاة/.test(normalized)) return "Skillet";
  return null;
}

function translateWeakArabicIngredientTitleToEnglish(normalized: string) {
  if (!isWeakArabicGeneratedTitle(normalized) && !/جمبري/.test(normalized)) {
    return null;
  }

  if (/جمبري/.test(normalized)) {
    const hasHoney = /عسل/.test(normalized);
    const hasGarlic = /ثوم|بالثوم/.test(normalized);
    const hasLime = /ليمون\s+أخضر|ليمون\s+اخضر|لايم|عصير\s+ليمون/.test(normalized);
    const hasLemon = /ليمون/.test(normalized);
    const hasTomato = /طماطم|بالطماطم/.test(normalized);
    const hasBellPepper = /فلفل\s+رومي/.test(normalized);
    const hasRice = /أرز|ارز|رز/.test(normalized);
    const hasOliveOil = /زيت\s+زيتون/.test(normalized);
    const hasFried = /مقلي|مقلية|تحمير/.test(normalized);
    const hasGreenCurry = /(?:ال)?كاري\s+(?:ال)?(?:أخضر|اخضر)/.test(normalized);
    const hasGrilled = /مشوي|مشوية/.test(normalized);
    const hasHerbs = /أعشاب|اعشاب/.test(normalized);

    if (hasHoney && hasGarlic) return "Garlic Honey Shrimp";
    if (hasGreenCurry) return "Green Curry Shrimp";
    if (hasGrilled && hasHerbs) return "Grilled Herb Shrimp";
    if (hasGrilled) return "Grilled Shrimp";
    if (hasRice) return "Shrimp Rice Plate";
    if (hasFried) return "Fried Shrimp Plate";
    if (hasLime) return "Lime Shrimp Plate";
    if (hasGarlic) return "Garlic Shrimp Plate";
    if (hasTomato) return "Shrimp Tomato Plate";
    if (hasBellPepper) return "Shrimp Bell Pepper Plate";
    if (hasOliveOil) return "Shrimp Olive Oil Plate";
    if (hasLemon) return "Lemon Shrimp Plate";
    return "Shrimp Plate";
  }

  if (/دجاج|صدر\s+دجاج/.test(normalized)) {
    const hasRice = /أرز|ارز|رز/.test(normalized);
    const hasGarlic = /ثوم|بالثوم/.test(normalized);
    const hasTomato = /طماطم|بالطماطم/.test(normalized);

    if (hasRice && hasGarlic) return "Garlic Chicken Rice Plate";
    if (hasRice) return "Chicken Rice Plate";
    if (hasTomato) return "Tomato Chicken Plate";
    return "Chicken Plate";
  }

  return null;
}

function translateCuisine(value: string) {
  return CUISINES[value] ?? FOOD_DICTIONARY_TRANSLATIONS.englishToArabic[normalizeTranslationKey(value)] ?? value;
}

function ensureArabicCuisineText(value: string) {
  const translated = translateCuisine(value);
  if (!hasLatinText(translated) && translated.trim()) {
    return translated.trim();
  }

  return "عالمي";
}

export function translateCuisineToEnglish(value: string) {
  return REVERSE_CUISINES[value] ?? FOOD_DICTIONARY_TRANSLATIONS.arabicToEnglish[normalizeTranslationKey(value)] ?? value;
}

function translateIngredient(value: string) {
  const normalized = normalizeTranslationKey(value);
  const exact = ENGLISH_TO_ARABIC_INGREDIENT_LOOKUP[normalized];
  if (exact) return exact;
  if (!/[A-Za-z]/.test(value)) return value;

  const translated = replaceIngredientPhrases(value, ENGLISH_TO_ARABIC_INGREDIENT_LOOKUP)
    .replace(/\band\b/gi, " و ")
    .replace(/\bwith\b/gi, " مع ")
    .replace(/\s+/g, " ")
    .trim();

  return translated || value;
}

function ensureArabicIngredientText(value: string) {
  const translated = translateIngredient(value);
  if (!hasLatinText(translated) && translated.trim()) {
    return normalizeArabicPunctuation(translated.trim());
  }

  const stripped = stripLatinText(translated);
  if (stripped) {
    return normalizeArabicPunctuation(stripped);
  }

  return "";
}

export function translateIngredientToArabic(value: string) {
  return translateIngredient(value);
}

export function translateIngredientToEnglish(value: string) {
  const trimmed = value.trim();
  const normalized = normalizeTranslationKey(trimmed);
  const exact = ARABIC_TO_ENGLISH_INGREDIENT_LOOKUP[trimmed] ?? ARABIC_TO_ENGLISH_INGREDIENT_LOOKUP[normalized];
  if (exact) return exact;
  if (!/[\u0600-\u06FF]/.test(value)) return value;

  const translated = replaceIngredientPhrases(trimmed, ARABIC_TO_ENGLISH_INGREDIENT_LOOKUP)
    .replace(/\s+/g, " ")
    .trim();

  return translated || value;
}

function translateStep(value: string) {
  const exact = STEP_TRANSLATIONS[value];
  if (exact) return exact;

  if (!/[A-Za-z]/.test(value)) {
    return value;
  }

  return translateEnglishCookingStep(value);
}

function buildArabicOnlySteps(steps: string[]) {
  const translatedSteps = steps.map(translateStep).map((step) => step.trim()).filter(Boolean);
  if (translatedSteps.length > 0 && translatedSteps.every((step) => !hasLatinText(step))) {
    return translatedSteps;
  }

  // The source remains readable and accurate. Never replace it with a
  // transliteration or a generic cooking paragraph.
  return steps.map((step) => step.trim()).filter(Boolean);
}

function translateStepToEnglish(value: string) {
  return REVERSE_STEP_TRANSLATIONS[value] ?? value;
}

function translatePreferenceHit(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "catalog-dish-match") return "وصفة مناسبة";
  if (normalized === "catalog-ingredient-match") return "تطابق مع المكونات";
  if (normalized.startsWith("anchor-match")) return "يعتمد على مكوناتك";
  if (normalized.startsWith("support-match")) return "اقتراحات مكملة";
  if (normalized.includes("sparse pantry")) return "مناسب للمكونات المحدودة";
  if (normalized.includes("low-carb") || normalized.includes("blood-sugar")) return "مناسب لهدفك الصحي";
  if (normalized.includes("gluten-free")) return "مراعي للحساسية";
  if (normalized.includes("dairy")) return "مراعي لتفضيلاتك";
  if (normalized.includes("lower-sodium")) return "أخف في الملح";
  if (normalized.includes("entered protein")) return "يركز على البروتين المتوفر";

  return value
    .replace("cuisine-aligned", "متوافق مع المطبخ المفضل")
    .replace("calorie-target", "مناسب لهدف السعرات")
    .replace("pantry", "مناسب للمكونات المتوفرة");
}

function translatePreferenceHitToEnglish(value: string) {
  return value
    .replace(translatePreferenceHit("cuisine-aligned"), "cuisine-aligned")
    .replace(translatePreferenceHit("calorie-target"), "calorie-target")
    .replace(translatePreferenceHit("pantry"), "pantry");
}

function hasLatinText(value: string) {
  return /[A-Za-z]/.test(value);
}

function hasArabicText(value: string) {
  return /[\u0600-\u06FF]/.test(value);
}

function stripLatinText(value: string) {
  const stripped = value
    .replace(/[A-Za-z][A-Za-z0-9'’&().,/-]*/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([،؛.])/g, "$1")
    .trim();

  return hasArabicText(stripped) ? stripped : "";
}

function normalizeArabicPunctuation(value: string) {
  return value.replace(/,/g, "،").replace(/\s+/g, " ").trim();
}

function ensureArabicDisplayText(value: string) {
  const normalized = normalizeArabicPunctuation(value);
  if (!hasLatinText(normalized)) return normalized;

  return normalizeArabicPunctuation(
    normalized.replace(/[A-Za-z]+/g, (word) => transliterateLatinWordToArabic(word))
  );
}

function transliterateLatinWordToArabic(value: string) {
  let word = value.toLowerCase();
  const phraseReplacements: Array<[RegExp, string]> = [
    [/sh/g, "ش"],
    [/ch/g, "تش"],
    [/th/g, "ث"],
    [/kh/g, "خ"],
    [/gh/g, "غ"],
    [/ph/g, "ف"],
    [/oo/g, "و"],
    [/ee/g, "ي"],
    [/ea/g, "ي"],
    [/ai/g, "اي"],
    [/ay/g, "اي"],
    [/ou/g, "او"],
    [/ow/g, "او"]
  ];

  for (const [pattern, replacement] of phraseReplacements) {
    word = word.replace(pattern, replacement);
  }

  const letters: Record<string, string> = {
    a: "ا",
    b: "ب",
    c: "ك",
    d: "د",
    e: "ي",
    f: "ف",
    g: "ج",
    h: "ه",
    i: "ي",
    j: "ج",
    k: "ك",
    l: "ل",
    m: "م",
    n: "ن",
    o: "و",
    p: "ب",
    q: "ك",
    r: "ر",
    s: "س",
    t: "ت",
    u: "و",
    v: "ف",
    w: "و",
    x: "كس",
    y: "ي",
    z: "ز"
  };

  return word
    .split("")
    .map((char) => letters[char] ?? char)
    .join("")
    .replace(/ا+/g, "ا")
    .replace(/ي+/g, "ي")
    .replace(/و+/g, "و");
}

function translateShoppingItem(value: string) {
  const [name, rest] = value.split(/\s+-\s+/, 2);
  const translatedName = translateIngredient(name);
  return rest ? `${translatedName} - ${translateUnitText(rest)}` : translatedName;
}

function translateUnitText(value: string) {
  return replaceIngredientPhrases(value, FOOD_DICTIONARY_TRANSLATIONS.englishToArabic)
    .replace(/\bcup\b/g, "كوب")
    .replace(/\bcups\b/g, "أكواب")
    .replace(/\bwhole\b/g, "حبة")
    .replace(/\bitem\b/g, "عنصر")
    .replace(/\bitems\b/g, "عناصر")
    .replace(/\bclove\b/g, "فص")
    .replace(/\bcloves\b/g, "فصوص")
    .replace(/\btbsp\b/g, "ملعقة كبيرة")
    .replace(/\btsp\b/g, "ملعقة صغيرة")
    .replace(/\blb\b/g, "رطل")
    .replace(/\boz\b/g, "أونصة")
    .replace(/\bcan\b/g, "علبة")
    .replace(/\bfillet\b/g, "شريحة");
}

function translateMacroTextToArabic(value: string) {
  return coerceTextValue(value)
    .replace(/(\d)\s*g\b/gi, "$1غ")
    .replace(/\bgrams?\b/gi, "غ")
    .replace(/\bg\b/gi, "غ");
}

function coerceTextValue(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value == null) return "";
  return String(value);
}

function translateCookTimeToArabic(value: string) {
  return coerceTextValue(value)
    .replace(/\bmins\b/gi, "دقائق")
    .replace(/\bmin\b/gi, "دقيقة")
    .replace(/\bhours\b/gi, "ساعات")
    .replace(/\bhour\b/gi, "ساعة");
}

function translateCookTimeToEnglish(value: string) {
  return coerceTextValue(value)
    .replace(new RegExp(escapeRegExp(translateCookTimeToArabic("mins")), "g"), "mins")
    .replace(new RegExp(escapeRegExp(translateCookTimeToArabic("min")), "g"), "min")
    .replace(new RegExp(escapeRegExp(translateCookTimeToArabic("hours")), "g"), "hours")
    .replace(new RegExp(escapeRegExp(translateCookTimeToArabic("hour")), "g"), "hour");
}

function translateDifficultyToArabic(value: string) {
  return coerceTextValue(value)
    .replace(/\beasy\b/gi, "سهل")
    .replace(/\bmedium\b/gi, "متوسط")
    .replace(/\bhard\b/gi, "صعب");
}

function translateDifficultyToEnglish(value: string) {
  return coerceTextValue(value)
    .replace(new RegExp(escapeRegExp(translateDifficultyToArabic("Easy")), "g"), "Easy")
    .replace(new RegExp(escapeRegExp(translateDifficultyToArabic("Medium")), "g"), "Medium")
    .replace(new RegExp(escapeRegExp(translateDifficultyToArabic("Hard")), "g"), "Hard");
}

function translateDay(value: string) {
  const days: Record<string, string> = {
    Monday: "الاثنين",
    Tuesday: "الثلاثاء",
    Wednesday: "الأربعاء",
    Thursday: "الخميس",
    Friday: "الجمعة",
    Saturday: "السبت",
    Sunday: "الأحد"
  };
  return days[value] ?? value;
}

function translateEnglishCookingStep(value: string) {
  let translated = ` ${value.trim()} `;

  const phraseReplacements: Array<[RegExp, string]> = [
    [/\bprepare the main ingredients for\b/gi, "جهز المكونات الرئيسية ل"],
    [/\badd supporting flavors such as\b/gi, "أضف نكهات داعمة مثل"],
    [/\badjusting to taste\b/gi, "واضبط حسب الرغبة"],
    [/\bcook until the ingredients are tender and the flavors match the traditional\b/gi, "اطه حتى تطرى المكونات وتظهر نكهة"],
    [/\bserve warm with a balanced portion size\b/gi, "قدمه دافئا بحصة متوازنة"],
    [/\bseason the dish to taste\b/gi, "تبل الطبق حسب الرغبة"],
    [/\bprofile\b/gi, "التقليدية"],
    [/\bstuffed bell peppers\b/gi, " محشي فلفل رومي "],
    [/\bmahshi bell peppers\b/gi, " محشي فلفل رومي "],
    [/\bmahshi bell pepper\b/gi, " محشي فلفل رومي "],
    [/\bbell peppers\b/gi, " فلفل رومي "],
    [/\bbell pepper\b/gi, " فلفل رومي "],
    [/\bstuffed\b/gi, " محشي "],
    [/\bmahshi\b/gi, " محشي "],    [/\baccording to package directions\b/gi, "وفق تعليمات العبوة"],
    [/\bto your liking\b/gi, "حسب الرغبة"],
    [/\buntil tender\b/gi, "حتى يطرى"],
    [/\buntil soft\b/gi, "حتى يلين"],
    [/\buntil warm\b/gi, "حتى يسخن"],
    [/\buntil hot\b/gi, "حتى يصبح ساخنا"],
    [/\buntil thickened\b/gi, "حتى يتماسك القوام"],
    [/\buntil golden\b/gi, "حتى يكتسب لونا ذهبيا"],
    [/\buntil glossy\b/gi, "حتى يصبح لامعا"],
    [/\buntil fluffy\b/gi, "حتى يصبح هشا"],
    [/\buntil almost tender\b/gi, "حتى يقترب من النضج"],
    [/\buntil it flakes easily\b/gi, "حتى يتفتت بسهولة"],
    [/\bfor serving\b/gi, "للتقديم"],
    [/\bbefore serving\b/gi, "قبل التقديم"],
    [/\band serve chilled\b/gi, "وقدمها باردة"],
    [/\band serve\b/gi, "وقدمه"],
    [/\bserve hot with\b/gi, "قدمها ساخنة مع"],
    [/\bserve over\b/gi, "قدمه فوق"],
    [/\bserve with\b/gi, "قدمه مع"],
    [/\bserve in bowls with\b/gi, "قدمه في أوعية مع"],
    [/\bserve in bowls\b/gi, "قدمه في أوعية"],
    [/\btoss together and finish with\b/gi, "اخلط المكونات معا وأنه الطبق ب"],
    [/\btoss everything with\b/gi, "اخلط كل المكونات مع"],
    [/\btoss with\b/gi, "اخلطه مع"],
    [/\btop with\b/gi, "أضف على الوجه"],
    [/\bfinish with\b/gi, "أنهِ الطبق ب"],
    [/\bfold in\b/gi, "أضف برفق"],
    [/\bdrizzle with\b/gi, "أضف رشة من"],
    [/\barrange\b/gi, "رتب"],
    [/\bslice into\b/gi, "قطع إلى"],
    [/\bslice and toss together\b/gi, "قطعه واخلطه مع بقية المكونات"],
    [/\bslice\b/gi, "قطع"],
    [/\bdice\b/gi, "قطع مكعبات"],
    [/\bchop\b/gi, "قطع"],
    [/\bmash\b/gi, "اهرِس"],
    [/\bcrack in\b/gi, "أضف"],
    [/\bcrumble\b/gi, "فتت"],
    [/\btoast\b/gi, "حمص"],
    [/\bcook\b/gi, "اطه"],
    [/\bboil\b/gi, "اسلق"],
    [/\bbake\b/gi, "اخبز"],
    [/\broast\b/gi, "اشو"],
    [/\bgrill\b/gi, "اشو"],
    [/\bbrown\b/gi, "حمّر"],
    [/\bsear\b/gi, "حمّر"],
    [/\bsaute\b/gi, "شوّح"],
    [/\bstir fry\b/gi, "شوّح بسرعة"],
    [/\bsimmer\b/gi, "اتركه يطهى على نار هادئة"],
    [/\bdrain\b/gi, "صفِّ"],
    [/\bwarm\b/gi, "سخّن"],
    [/\badd\b/gi, "أضف"],
    [/\bmix\b/gi, "اخلط"],
    [/\bcombine\b/gi, "اخلط"],
    [/\bseason\b/gi, "تبّل"],
    [/\busing\b/gi, "باستخدام"],
    [/\bif desired\b/gi, "إذا رغبت"],
    [/\bif using\b/gi, "إذا كنت تستخدمه"],
    [/\blightly\b/gi, "بخفّة"],
    [/\bbriefly\b/gi, "سريعا"],
    [/\bseparately\b/gi, "على حدة"],
    [/\btogether\b/gi, "معا"]
  ];

  for (const [pattern, replacement] of phraseReplacements) {
    translated = translated.replace(pattern, replacement);
  }

  translated = replaceRecipeTitlesInSentence(translated);
  translated = replaceIngredientsInSentence(translated);
  translated = translateUnitText(translated);
  translated = translated
    .replace(/\bminutes\b/gi, "دقائق")
    .replace(/\bminute\b/gi, "دقيقة")
    .replace(/\bhours\b/gi, "ساعات")
    .replace(/\bhour\b/gi, "ساعة")
    .replace(/\band\b/gi, "و")
    .replace(/\bwith\b/gi, "مع")
    .replace(/\bin\b/gi, "في")
    .replace(/\bon\b/gi, "على")
    .replace(/\binto\b/gi, "إلى")
    .replace(/\buntil\b/gi, "حتى")
    .replace(/\bthe\b/gi, "")
    .replace(/\ba\b/gi, "")
    .replace(/\ban\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,])/g, "$1")
    .trim();

  return translated || value;
}

function replaceRecipeTitlesInSentence(value: string) {
  return replaceIngredientPhrases(value, RECIPE_TITLES);
}

function replaceIngredientsInSentence(value: string) {
  return replaceIngredientPhrases(value, ENGLISH_TO_ARABIC_INGREDIENT_LOOKUP);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceIngredientPhrases(value: string, lookup: Record<string, string>) {
  return Object.entries(lookup)
    .sort((left, right) => right[0].length - left[0].length)
    .reduce((current, [source, target]) => {
      const escaped = escapeRegExp(source);
      return current.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu"), target);
    }, value);
}

function normalizeTranslationKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ");
}

function buildIngredientTranslationLookups() {
  const englishToArabic: Record<string, string> = {};
  const arabicToEnglish: Record<string, string> = {};

  for (const ingredient of OFFLINE_INGREDIENT_TAXONOMY) {
    const englishValues = ingredient.variants
      .filter((variant) => variant.locale === "en")
      .flatMap((variant) => variant.values)
      .map(normalizeTranslationKey)
      .filter(Boolean);
    const arabicValues = ingredient.variants
      .filter((variant) => variant.locale === "ar")
      .flatMap((variant) => variant.values)
      .map((value) => value.trim())
      .filter(Boolean);

    if (!englishValues.length || !arabicValues.length) {
      continue;
    }

    const preferredArabic = arabicValues[0];
    for (const english of englishValues) {
      if (!englishToArabic[english]) {
        englishToArabic[english] = preferredArabic;
      }
    }

    const preferredEnglish = englishValues[0];
    for (const arabic of arabicValues) {
      if (!arabicToEnglish[arabic]) {
        arabicToEnglish[arabic] = preferredEnglish;
      }
      const normalizedArabic = normalizeTranslationKey(arabic);
      if (!arabicToEnglish[normalizedArabic]) {
        arabicToEnglish[normalizedArabic] = preferredEnglish;
      }
    }
  }

  return { englishToArabic, arabicToEnglish };
}

function reverseLookup(source: Record<string, string>) {
  return Object.fromEntries(Object.entries(source).map(([key, value]) => [value, key]));
}

function toTitleCase(value: string) {
  return value
    .trim()
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function translateEnglishRecipeTitle(value: string) {
  let translated = ` ${value.trim()} `;

  const phraseReplacements: Array<[RegExp, string]> = [
    [/\bmacarona bechamel\b/gi, " مكرونة بشاميل "],
    [/\bmacaroni bechamel\b/gi, " مكرونة بشاميل "],
    [/\bbechamel pasta\b/gi, " مكرونة بشاميل "],
    [/\begyptian kofta\b/gi, " كفتة مصرية "],
    [/\btaagen kofta\b/gi, " طاجن كفتة "],
    [/\bkofta kebab\b/gi, " كفتة مشوية "],
    [/\bkofta\b/gi, " كفتة "],
    [/\bhawawshi\b/gi, " حواوشي "],
    [/\bkoshary\b/gi, " كشري "],
    [/\bful medames\b/gi, " فول مدمس "],
    [/\btaameya\b/gi, " طعمية "],
    [/\bshakshuka\b/gi, " شكشوكة "],
    [/\bfarakh meshwi\b/gi, " فراخ مشوية "],
    [/\bchicken molokhia\b/gi, " ملوخية بالدجاج "],
    [/\bchicken fattah\b/gi, " فتة دجاج "],
    [/\bchicken negresco\b/gi, " نجرسكو دجاج "],
    [/\bcreamy tuscan chicken\b/gi, " دجاج توسكاني بصوص كريمي "],
    [/\btuscan creamy chicken\b/gi, " دجاج توسكاني بصوص كريمي "],
    [/\btuscan chicken\b/gi, " دجاج على الطريقة التوسكانية "],
    [/\bcreamy spinach chicken\b/gi, " دجاج بالسبانخ وصوص كريمي "],
    [/\bchicken florentine\b/gi, " دجاج بالسبانخ وصوص كريمي "],
    [/\bcreamy chicken soup\b/gi, " شوربة دجاج كريمية "],
    [/\bcreamy chicken\b/gi, " دجاج بصوص كريمي "],
    [/\bchicken alfredo\b/gi, " دجاج ألفريدو "],
    [/\bchicken parmesan\b/gi, " دجاج بصلصة الطماطم والبارميزان "],
    [/\bparmesan chicken\b/gi, " دجاج بصلصة الطماطم والبارميزان "],
    [/\bchicken piccata\b/gi, " دجاج بيكاتا "],
    [/\bchicken cacciatore\b/gi, " دجاج كاتشاتوري "],
    [/\bgai pad krapow\b/gi, " دجاج بالريحان التايلندي "],
    [/\bpad krapow gai\b/gi, " دجاج بالريحان التايلندي "],
    [/\bcashew chicken\b/gi, " دجاج بالكاجو "],
    [/\bchicken and dumplings\b/gi, " دجاج بصوص كريمي مع زلابية آسيوية "],
    [/\bcreamy chicken and dumplings\b/gi, " دجاج بصوص كريمي مع زلابية آسيوية "],
    [/\bsayadeya\b/gi, " صيادية سمك "],
    [/\bsamak singari\b/gi, " سمك سنجاري "],
    [/\begyptian fish tagine\b/gi, " طاجن سمك مصري "],
    [/\balexandrian shrimp\b/gi, " جمبري إسكندراني "],
    [/\bseafood sayadeya\b/gi, " صيادية بالمأكولات البحرية "],
    [/\bshrimp ceviche\b/gi, " سيفيتشي جمبري "],
    [/\bgarlic honey shrimp\b/gi, " جمبري بالعسل والثوم "],
    [/\bshrimp saganaki\b/gi, " جمبري ساجاناكي "],
    [/\bcamarones al ajo\b/gi, " جمبري بالثوم "],
    [/\bkarides guvec\b/gi, " طاجن جمبري تركي "],
    [/\balexandrian liver\b/gi, " كبدة إسكندراني "],
    [/\biskandarani liver\b/gi, " كبدة إسكندراني "],
    [/\beskandarani liver\b/gi, " كبدة إسكندراني "],
    [/\bkibda iskandarani\b/gi, " كبدة إسكندراني "],
    [/\bkebda iskandarani\b/gi, " كبدة إسكندراني "],
    [/\bfried liver\b/gi, " كبدة مقلية "],
    [/\bliver shawarma\b/gi, " شاورما كبدة "],
    [/\bspiced liver\b/gi, " كبدة متبلة "],
    [/\bbeef liver\b/gi, " كبدة "],
    [/\bchicken liver\b/gi, " كبدة دجاج "],
    [/\bliver\b/gi, " كبدة "],
    [/\bkibda\b/gi, " كبدة "],
    [/\bkebda\b/gi, " كبدة "],
    [/\blime skewers? (?:and|&) shrimp\b/gi, " أسياخ جمبري بالليمون "],
    [/\bshrimp\b/gi, " جمبري "],
    [/\bshrimps\b/gi, " جمبري "],
    [/\bprawn\b/gi, " جمبري "],
    [/\bprawns\b/gi, " جمبري "],
    [/\bceviche\b/gi, " سيفيتشي "],
    [/\blime\b/gi, " ليمون أخضر "],
    [/\bskewers\b/gi, " أسياخ "],
    [/\bskewer\b/gi, " سيخ "],
    [/\bmarinade\b/gi, " تتبيلة "],
    [/\bsimple\b/gi, " بسيط "],
    [/\bshish tawook\b/gi, " شيش طاووق "],
    [/\bshawarma plate\b/gi, " طبق شاورما "],
    [/\bkibbeh\b/gi, " كبة "],
    [/\bbutter chicken\b/gi, " دجاج بالزبدة "],
    [/\btandoori chicken\b/gi, " دجاج تندوري "],
    [/\bfish curry\b/gi, " كاري سمك "],
    [/\bprawn masala\b/gi, " جمبري ماسالا "],
    [/\bfried chicken\b/gi, " دجاج مقلي "],
    [/\bblackened fish\b/gi, " سمك متبل محمر "],
    [/\bkung pao chicken\b/gi, " دجاج كونغ باو "],
    [/\bmiso salmon\b/gi, " سلمون ميسو "],
    [/\bturkish kofte\b/gi, " كفتة تركية "],
    [/\badana kebab\b/gi, " كباب أضنة "],
    [/\bmanti\b/gi, " مانتي تركي "],
    [/\bmahshi bell peppers\b/gi, " محشي فلفل رومي "],
    [/\bstuffed bell peppers\b/gi, " محشي فلفل رومي "],
    [/\bmahshi bell\b/gi, " محشي فلفل رومي "],
    [/\bmahshi bell pepper\b/gi, " محشي فلفل رومي "],
    [/\bbell peppers\b/gi, " فلفل رومي "],
    [/\bbell pepper\b/gi, " فلفل رومي "],
    [/\bstuffed\b/gi, " محشي "],
    [/\bmahshi\b/gi, " محشي "],
    [/\bbreakfast\b/gi, " إفطار "],
    [/\bbowl\b/gi, " وعاء "],
    [/\bsalad\b/gi, " سلطة "],
    [/\bsoup\b/gi, " شوربة "],
    [/\bstew\b/gi, " طاجن "],
    [/\bskillet\b/gi, " مقلاة "],
    [/\bplate\b/gi, " طبق "],
    [/\btoast\b/gi, " توست "],
    [/\bpasta\b/gi, " مكرونة "],
    [/\bheavy cream\b/gi, " كريمة طبخ "],
    [/\bcooking cream\b/gi, " كريمة طبخ "],
    [/\bcream sauce\b/gi, " صوص كريمي "],
    [/\bcreamy sauce\b/gi, " صوص كريمي "],
    [/\bcreamy\b/gi, " بصوص كريمي "],
    [/\bcream\b/gi, " كريمة طبخ "],
    [/\bchicken\b/gi, " دجاج "],
    [/\btuscan\b/gi, " توسكاني "],
    [/\bparmesan\b/gi, " بارميزان "],
    [/\bflorentine\b/gi, " بالسبانخ وصوص كريمي "],
    [/\bcurry\b/gi, " كاري "],
    [/\bpilaf\b/gi, " بيلاف "],
    [/\btray bake\b/gi, " صينية مخبوزة "],
    [/\bbake\b/gi, " صينية "],
    [/\bpower\b/gi, " مشبع "],
    [/\bpantry\b/gi, " مخزن "],
    [/\binspired\b/gi, " مستوحى "],
    [/\bmiddle eastern\b/gi, " شرق أوسطي "],
    [/\bmediterranean\b/gi, " متوسطي "],
    [/\begyptian\b/gi, " مصري "],
    [/\bitalian\b/gi, " إيطالي "],
    [/\band\b/gi, " و "],
    [/\bwith\b/gi, " مع "]
  ];

  for (const [pattern, replacement] of phraseReplacements) {
    translated = translated.replace(pattern, replacement);
  }

  translated = replaceIngredientsInSentence(translated)
    .replace(/\s+/g, " ")
    .trim();

  return translated || value;
}
