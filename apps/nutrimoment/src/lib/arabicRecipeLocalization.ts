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

export function localizeRecipeForArabic(recipe: Recipe): Recipe {
  return {
    ...recipe,
    name: translateRecipeTitle(recipe.name),
    cuisine: translateCuisine(recipe.cuisine),
    ingredients: recipe.ingredients.map(translateIngredient),
    missing_ingredients: recipe.missing_ingredients.map(translateIngredient),
    steps: recipe.steps.map(translateStep),
    preference_hits: recipe.preference_hits?.map(translatePreferenceHit)
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
  return RECIPE_TITLES[value] ?? value;
}

function translateCuisine(value: string) {
  return CUISINES[value] ?? value;
}

function translateIngredient(value: string) {
  const normalized = value.trim().toLowerCase();
  return INGREDIENTS[normalized] ?? value;
}

function translateStep(value: string) {
  return STEP_TRANSLATIONS[value] ?? value;
}

function translatePreferenceHit(value: string) {
  return value
    .replace("cuisine-aligned", "متوافق مع المطبخ المفضل")
    .replace("calorie-target", "مناسب لهدف السعرات")
    .replace("pantry", "مناسب للمكونات المتوفرة");
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
