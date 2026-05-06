import type { MealPlanData, MealPlanMeal, Recipe } from "@/lib/types";
import { OFFLINE_INGREDIENT_TAXONOMY } from "@/data/offline/ingredientTaxonomy";
import { normalizeSpecificIngredientName } from "@/lib/ingredientSpecificity";

const RECIPE_TITLES: Record<string, string> = {
  "Kofta": "كفتة",
  "Egyptian Kofta": "كفتة مصرية",
  "Kofta Kebab": "كفتة مشوية",
  "Taagen Kofta": "طاجن كفتة",
  "Hawawshi": "حواوشي",
  "Macarona Bechamel": "مكرونة بشاميل",
  "Koshary": "كشري",
  "Ful Medames": "فول مدمس",
  "Taameya": "طعمية",
  "Shakshuka": "شكشوكة",
  "Farakh Meshwi": "فراخ مشوية",
  "Chicken Molokhia": "ملوخية بالدجاج",
  "Chicken Fattah": "فتة دجاج",
  "Chicken Negresco": "نجرسكو دجاج",
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
  "Tandoori Chicken": "دجاج تندوري",
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
  rice: "أرز",
  broccoli: "بروكلي",
  garlic: "ثوم",
  honey: "عسل",
  basil: "ريحان",
  pasta: "مكرونة",
  spaghetti: "سباجيتي",
  penne: "بيني",
  fettuccine: "فيتوتشيني",
  macaroni: "مكرونة أقلام",
  linguine: "لينجويني",
  "canned beans": "فول",
  chickpeas: "حمص",
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
  "minced meat": "لحم مفروم",
  "minced beef": "لحم مفروم",
  liver: "كبدة",
  "beef liver": "كبدة",
  "chicken liver": "كبدة دجاج",
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
  linguine: "لينجويني"
};

const ARABIC_TO_ENGLISH_INGREDIENT_OVERRIDES: Record<string, string> = {
  "عيش": "baladi bread",
  "خبز": "bread",
  "خبز بلدي": "baladi bread",
  "عيش بلدي": "baladi bread",
  "لحم مفروم": "ground meat",
  "اللحم المفروم": "ground meat",
  "فول": "canned beans",
  "فول مدمس": "fava beans",
  "فاصوليا عريضة": "fava beans",
  "فلفل أسود": "black pepper",
  "فلفل رومي": "bell pepper",
  "كبدة": "liver",
  "كبده": "liver",
  "كبدة دجاج": "chicken liver",
  "ملح": "salt",
  "بشاميل": "bechamel",
  "سباجيتي": "spaghetti",
  "بيني": "penne",
  "فيتوتشيني": "fettuccine",
  "مكرونة أقلام": "macaroni",
  "لينجويني": "linguine"
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
const REVERSE_CUISINES = reverseLookup(CUISINES);
const REVERSE_INGREDIENTS = reverseLookup(INGREDIENTS);
const REVERSE_STEP_TRANSLATIONS = reverseLookup(STEP_TRANSLATIONS);

const {
  englishToArabic: TAXONOMY_ENGLISH_TO_ARABIC,
  arabicToEnglish: TAXONOMY_ARABIC_TO_ENGLISH
} = buildIngredientTranslationLookups();

const ENGLISH_TO_ARABIC_INGREDIENT_LOOKUP: Record<string, string> = {
  ...TAXONOMY_ENGLISH_TO_ARABIC,
  ...INGREDIENTS,
  ...ENGLISH_TO_ARABIC_INGREDIENT_OVERRIDES
};

const ARABIC_TO_ENGLISH_INGREDIENT_LOOKUP: Record<string, string> = {
  ...TAXONOMY_ARABIC_TO_ENGLISH,
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
    steps: buildArabicOnlySteps(localized.steps, baseRecipe)
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
    name: translateRecipeTitle(meal.name),
    ingredients: meal.ingredients?.map(translateIngredient),
    steps: meal.steps?.map(translateStep)
  };
}

export function localizeMealForEnglish(meal: MealPlanMeal): MealPlanMeal {
  return {
    ...meal,
    name: translateRecipeTitleToEnglish(meal.name, meal.image_search_index),
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
    shoppingList: mealPlan.shoppingList.map(translateShoppingItem),
    recommendedRecipes: mealPlan.recommendedRecipes?.map(localizeRecipeForArabic)
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
  const exact = RECIPE_TITLES[value];
  if (exact) return exact;
  if (!/[A-Za-z]/.test(value)) return value;
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
  if (/كبدة\s+إسكندراني|كبدة\s+اسكندراني|كبده\s+إسكندراني|كبده\s+اسكندراني/.test(normalized)) {
    return "Alexandrian Liver";
  }
  if (/كبدة|كبده/.test(normalized)) {
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

  return REVERSE_RECIPE_TITLES[value] ?? toTitleCase(fallbackQuery ?? value);
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

    if (hasHoney && hasGarlic) return "Garlic Honey Shrimp";
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
  return CUISINES[value] ?? value;
}

function ensureArabicCuisineText(value: string) {
  const translated = translateCuisine(value);
  if (!hasLatinText(translated) && translated.trim()) {
    return translated.trim();
  }

  return "عالمي";
}

export function translateCuisineToEnglish(value: string) {
  return REVERSE_CUISINES[value] ?? value;
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
  const specific = normalizeSpecificIngredientName(trimmed);
  if (specific && specific !== normalizeTranslationKey(trimmed)) {
    return specific;
  }
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

function buildArabicOnlySteps(steps: string[], recipe: Recipe) {
  const translatedSteps = steps.map(translateStep).map((step) => step.trim()).filter(Boolean);
  if (translatedSteps.length >= 7 && translatedSteps.every((step) => !hasLatinText(step))) {
    return translatedSteps;
  }

  const primary = recipe.ingredients[0] ?? recipe.missing_ingredients[0] ?? "المكون الرئيسي";
  const secondary = recipe.ingredients[1] ?? recipe.missing_ingredients[1] ?? "المكون الثاني";
  const finishing = [...recipe.ingredients, ...recipe.missing_ingredients].slice(2, 5).join("، ") || "باقي المكونات";

  return [
    `حضّر ${recipe.name}: جهز ${primary} و${secondary} وضع ${finishing} بجانبك قبل بدء الطبخ.`,
    "سخّن المقلاة على نار متوسطة لمدة دقيقتين، ثم أضف ملعقة صغيرة من الزيت أو الدهن المناسب.",
    `أضف ${primary} أولا واطهه لمدة 4 إلى 6 دقائق مع التقليب حتى يبدأ في النضج.`,
    `أضف ${secondary} مع ملعقتين كبيرتين من الماء أو سائل الطبخ، واتركه 3 إلى 5 دقائق حتى تتجانس النكهات.`,
    `أضف ${finishing} على دفعات صغيرة واطهه 2 إلى 4 دقائق حتى يبقى القوام متماسكا.`,
    "تذوق واضبط الملح والفلفل أو التوابل حسب الحاجة، ثم اترك الخليط دقيقة أخيرة على النار.",
    "ارفع الوجبة عن النار لمدة دقيقتين، ثم قدمها ساخنة في طبق مناسب."
  ];
}

function translateStepToEnglish(value: string) {
  return REVERSE_STEP_TRANSLATIONS[value] ?? value;
}

function translatePreferenceHit(value: string) {
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

function translateShoppingItem(value: string) {
  const [name, rest] = value.split(/\s+-\s+/, 2);
  const translatedName = translateIngredient(name);
  return rest ? `${translatedName} - ${translateUnitText(rest)}` : translatedName;
}

function translateUnitText(value: string) {
  return value
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
