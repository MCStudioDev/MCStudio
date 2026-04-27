import type { MealPlanData, MealPlanMeal, Recipe } from "@/lib/types";

const RECIPE_TITLES: Record<string, string> = {
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
  Mexican: "مكسيكي",
  Indian: "هندي",
  Mediterranean: "متوسطي",
  "Middle Eastern": "شرق أوسطي",
  Egyptian: "مصري",
  Asian: "آسيوي",
  Thai: "تايلندي",
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
  basil: "ريحان",
  pasta: "مكرونة",
  "canned beans": "فاصوليا معلبة",
  chickpeas: "حمص",
  cucumber: "خيار",
  "turkey breast": "صدر ديك رومي",
  quinoa: "كينوا",
  lentils: "عدس",
  onion: "بصل",
  salmon: "سلمون",
  asparagus: "هليون",
  cauliflower: "قرنبيط",
  "grilled chicken": "دجاج مشوي",
  greens: "خضار ورقية",
  "salmon fillets": "شرائح سلمون",
  "sweet potato": "بطاطا حلوة",
  lemon: "ليمون"
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
  "Warm the beans.": "سخن الفاصوليا.",
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
    preference_hits: recipe.preference_hits?.map(translatePreferenceHit)
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
    preference_hits: recipe.preference_hits?.map(translatePreferenceHitToEnglish)
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

export function isArabicRecipeLanguage(language?: string) {
  return language?.toLowerCase() === "arabic" || language === "العربية";
}

function translateRecipeTitle(value: string) {
  const exact = RECIPE_TITLES[value];
  if (exact) return exact;
  if (!/[A-Za-z]/.test(value)) return value;
  return translateEnglishRecipeTitle(value);
}

function translateRecipeTitleToEnglish(value: string, fallbackQuery?: string) {
  return REVERSE_RECIPE_TITLES[value] ?? toTitleCase(fallbackQuery ?? value);
}

function translateCuisine(value: string) {
  return CUISINES[value] ?? value;
}

function translateCuisineToEnglish(value: string) {
  return REVERSE_CUISINES[value] ?? value;
}

function translateIngredient(value: string) {
  const normalized = value.trim().toLowerCase();
  return INGREDIENTS[normalized] ?? value;
}

export function translateIngredientToArabic(value: string) {
  return translateIngredient(value);
}

export function translateIngredientToEnglish(value: string) {
  return REVERSE_INGREDIENTS[value] ?? value;
}

function translateStep(value: string) {
  const exact = STEP_TRANSLATIONS[value];
  if (exact) return exact;

  if (!/[A-Za-z]/.test(value)) {
    return value;
  }

  return translateEnglishCookingStep(value);
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
    .replace(/\bmins\b/gi, "Ø¯Ù‚Ø§Ø¦Ù‚")
    .replace(/\bmin\b/gi, "Ø¯Ù‚ÙŠÙ‚Ø©")
    .replace(/\bhours\b/gi, "Ø³Ø§Ø¹Ø§Øª")
    .replace(/\bhour\b/gi, "Ø³Ø§Ø¹Ø©");
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
    .replace(/\beasy\b/gi, "Ø³Ù‡Ù„")
    .replace(/\bmedium\b/gi, "Ù…ØªÙˆØ³Ø·")
    .replace(/\bhard\b/gi, "ØµØ¹Ø¨");
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
    [/\baccording to package directions\b/gi, "وفق تعليمات العبوة"],
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
  return Object.entries(INGREDIENTS)
    .sort((left, right) => right[0].length - left[0].length)
    .reduce((current, [english, arabic]) => {
      const escaped = escapeRegExp(english);
      return current.replace(new RegExp(`\\b${escaped}\\b`, "gi"), arabic);
    }, value);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
