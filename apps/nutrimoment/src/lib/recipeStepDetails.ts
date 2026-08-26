import type { MealPlanData, MealPlanMeal, Recipe } from "@/lib/types";

type StepLanguage = "English" | "Arabic";
type CookingMethod = "stew" | "roast" | "grill" | "fry" | "skillet";
type PrimaryFood = "beef" | "groundMeat" | "chicken" | "shrimp" | "fish" | "egg" | "vegetable" | "grain" | "general";

interface StepSource {
  ingredients?: unknown[];
  missing_ingredients?: unknown[];
  name: string;
  steps?: string[];
}

type CookingProfile = {
  englishHeatStep: string;
  englishPrimaryStep: (item: string) => string;
  englishSecondaryStep: (item: string) => string;
  englishFinishStep: (item: string) => string;
  englishPlateStep: string;
  arabicHeatStep: string;
  arabicPrimaryStep: (item: string) => string;
  arabicSecondaryStep: (item: string) => string;
  arabicFinishStep: (item: string) => string;
  arabicPlateStep: string;
};

export function ensureDetailedRecipeSteps(recipe: Recipe, language: StepLanguage = "English"): Recipe {
  return {
    ...recipe,
    steps: buildDetailedSteps(recipe, language, 1)
  };
}

export function ensureDetailedMealSteps(meal: MealPlanMeal, language: StepLanguage = "English"): MealPlanMeal {
  return {
    ...meal,
    steps: buildDetailedSteps(meal, language, 7)
  };
}

export function ensureDetailedMealPlanSteps(mealPlan: MealPlanData, language: StepLanguage = "English"): MealPlanData {
  return {
    ...mealPlan,
    plan: mealPlan.plan.map((day) => ({
      ...day,
      breakfast: ensureDetailedMealSteps(day.breakfast, language),
      lunch: ensureDetailedMealSteps(day.lunch, language),
      dinner: ensureDetailedMealSteps(day.dinner, language)
    })),
    recommendedRecipes: mealPlan.recommendedRecipes?.map((recipe) => ensureDetailedRecipeSteps(recipe, language))
  };
}

function buildDetailedSteps(source: StepSource, language: StepLanguage, minimumSteps: number) {
  const rawExisting = Array.isArray(source.steps)
    ? source.steps.map((step) => step.trim()).filter(Boolean)
    : [];
  const existing =
    language === "Arabic" && rawExisting.some((step) => /[A-Za-z]/.test(step))
      ? []
      : rawExisting;

  if (existing.length >= minimumSteps) {
    return existing;
  }

  const ingredients = source.ingredients?.map(readIngredientLabel).filter(Boolean) ?? [];
  const missing = source.missing_ingredients?.map(readIngredientLabel).filter(Boolean) ?? [];
  const primary = ingredients[0] ?? missing[0] ?? (language === "Arabic" ? "المكون الرئيسي" : "main ingredient");
  const secondary = ingredients[1] ?? missing[1] ?? (language === "Arabic" ? "المكون الثاني" : "second ingredient");
  const finishing = [...ingredients, ...missing].slice(2, 5).join(", ");
  const allIngredients = [...ingredients, ...missing];
  const finalSteps = language === "Arabic"
    ? buildArabicFallbackSteps(source.name, primary, secondary, finishing, allIngredients)
    : buildEnglishFallbackSteps(source.name, primary, secondary, finishing, allIngredients);

  return [...existing, ...finalSteps].slice(0, Math.max(7, minimumSteps, existing.length));
}

function buildEnglishFallbackSteps(name: string, primary: string, secondary: string, finishing: string, ingredients: string[]) {
  const finishText = finishing || "the remaining ingredients";
  const profile = buildCookingProfile(name, primary, ingredients);

  return [
    `Prepare ${name}: cut ${primary} into the shape the dish needs, prepare ${secondary}, and keep ${finishText} ready before heating the pan.`,
    profile.englishHeatStep,
    profile.englishPrimaryStep(primary),
    profile.englishSecondaryStep(secondary),
    profile.englishFinishStep(finishText),
    `Taste and adjust with 1 pinch salt, 1 pinch pepper, or the listed seasoning; cook 1 final minute so the seasoning clings to the food.`,
    profile.englishPlateStep
  ];
}

function buildArabicFallbackSteps(name: string, primary: string, secondary: string, finishing: string, ingredients: string[]) {
  const finishText = finishing || "باقي المكونات";
  const profile = buildCookingProfile(name, primary, ingredients);

  return [
    `حضر ${name}: قطع ${primary} بالشكل المناسب للطبق، جهز ${secondary}، واجعل ${finishText} جاهزة قبل تسخين المقلاة.`,
    profile.arabicHeatStep,
    profile.arabicPrimaryStep(primary),
    profile.arabicSecondaryStep(secondary),
    profile.arabicFinishStep(finishText),
    "تذوق واضبط بقرصة ملح وقرصة فلفل أو التوابل المذكورة، ثم اطهِ دقيقة أخيرة حتى تلتصق النكهة بالمكونات.",
    profile.arabicPlateStep
  ];
}

function buildCookingProfile(name: string, primary: string, ingredients: string[]): CookingProfile {
  const text = [name, primary, ...ingredients].join(" ").toLowerCase();
  const method = detectCookingMethod(text);
  const food = detectPrimaryFood(text);

  if (method === "stew") {
    if (food === "beef") return beefStewProfile();
    if (food === "shrimp" || food === "fish") return seafoodStewProfile();
    return generalStewProfile();
  }

  if (food === "shrimp") {
    return defaultProfile({
      englishPrimary: (item) => `Add ${item} and cook 2 to 3 minutes, turning once, until pink and just opaque; remove it briefly if the rest of the dish needs more time.`,
      arabicPrimary: (item) => `أضف ${item} واطهه 2 إلى 3 دقائق مع التقليب مرة واحدة حتى يصبح ورديا ومعتم اللون، وارفعه مؤقتا إذا كان باقي الطبق يحتاج وقتا أطول.`
    });
  }

  if (food === "fish") {
    return defaultProfile({
      englishPrimary: (item) => `Add ${item} and cook 3 to 5 minutes per side, depending on thickness, until it flakes but still looks moist in the center.`,
      arabicPrimary: (item) => `أضف ${item} واطهه 3 إلى 5 دقائق لكل جانب حسب السمك حتى يتفتت بسهولة مع بقاء الوسط طريا.`
    });
  }

  if (food === "beef") {
    return defaultProfile({
      englishPrimary: (item) => method === "grill"
        ? `Add ${item} and cook 3 to 5 minutes per side for steak pieces or 8 to 12 minutes total for skewers, until browned outside and cooked to the desired doneness.`
        : `Add ${item} and cook 6 to 10 minutes for slices or cubes, turning every 2 minutes, until browned outside and cooked to the intended doneness.`,
      arabicPrimary: (item) => method === "grill"
        ? `أضف ${item} واطهه 3 إلى 5 دقائق لكل جانب لقطع الستيك أو 8 إلى 12 دقيقة للأسياخ حتى يتحمر الخارج ويصل اللحم لدرجة النضج المناسبة.`
        : `أضف ${item} واطهه 6 إلى 10 دقائق للشرائح أو المكعبات مع التقليب كل دقيقتين حتى يتحمر الخارج وينضج بالدرجة المناسبة.`
    });
  }

  if (food === "chicken") {
    return defaultProfile({
      englishPrimary: (item) => `Add ${item} and cook 8 to 12 minutes for bite-size pieces or 18 to 25 minutes for whole thighs/breasts, turning until no pink remains and juices run clear.`,
      arabicPrimary: (item) => `أضف ${item} واطهه 8 إلى 12 دقيقة للقطع الصغيرة أو 18 إلى 25 دقيقة للصدور أو الأفخاذ الكاملة حتى يختفي اللون الوردي وتصفو العصارة.`
    });
  }

  return defaultProfile();
}

function beefStewProfile(): CookingProfile {
  return {
    englishHeatStep: "Use a heavy pot over medium-high heat for 3 minutes, then add 1 tsp oil so the meat can brown before liquid is added.",
    englishPrimaryStep: (item) => `Add ${item} and sear 3 to 4 minutes per side, just until browned; do not count this as full cooking because stew meat needs a long simmer to become tender.`,
    englishSecondaryStep: (item) => `Add ${item} with 1/2 cup water, broth, tomato sauce, or the listed cooking liquid, scraping the browned bits from the pot for 2 minutes.`,
    englishFinishStep: (item) => `Stir in ${item}, lower the heat to a gentle simmer, cover, and cook 60 to 90 minutes until the meat is fork-tender and the sauce is thick enough to coat a spoon.`,
    englishPlateStep: "Rest the stew off heat for 5 minutes, then serve one portion with tender meat pieces and sauce spooned evenly over the top.",
    arabicHeatStep: "استخدم قدرا ثقيلا على نار متوسطة إلى عالية لمدة 3 دقائق، ثم أضف ملعقة صغيرة زيت حتى يتحمر اللحم قبل إضافة السائل.",
    arabicPrimaryStep: (item) => `أضف ${item} وحمره 3 إلى 4 دقائق لكل جانب حتى يأخذ لونا بنيا، ولا تعتبر هذه مدة الطهي الكاملة لأن لحم اليخنة يحتاج غليانا طويلا ليطرى.`,
    arabicSecondaryStep: (item) => `أضف ${item} مع نصف كوب ماء أو مرق أو صلصة طماطم، واكشط القاعدة المتحمرة لمدة دقيقتين.`,
    arabicFinishStep: (item) => `أضف ${item}، ثم خفف النار إلى غليان هادئ، غط القدر واطهِ 60 إلى 90 دقيقة حتى يصبح اللحم طريا والصلصة متماسكة.`,
    arabicPlateStep: "اترك اليخنة بعيدا عن النار 5 دقائق، ثم قدمها مع قطع لحم طرية وصلصة موزعة بالتساوي."
  };
}

function seafoodStewProfile(): CookingProfile {
  return {
    englishHeatStep: "Start the stew base in a wide pot over medium heat for 2 minutes with 1 tsp oil; seafood should go in near the end, not at the beginning.",
    englishPrimaryStep: (item) => `Keep ${item} aside while the sauce starts so it does not overcook; pat it dry and season lightly for 1 minute.`,
    englishSecondaryStep: (item) => `Cook ${item} with 1/3 cup water, broth, tomato sauce, or the listed cooking liquid for 8 to 12 minutes until the base tastes rounded.`,
    englishFinishStep: (item) => `Add ${item} during the final 4 to 7 minutes only, simmering gently until shrimp turn pink or fish flakes while staying moist.`,
    englishPlateStep: "Rest the stew off heat for 2 minutes, then serve carefully so the seafood stays whole and the sauce remains glossy.",
    arabicHeatStep: "ابدأ قاعدة اليخنة في قدر واسع على نار متوسطة مع ملعقة صغيرة زيت لمدة دقيقتين؛ يضاف السي فود قرب النهاية وليس في البداية.",
    arabicPrimaryStep: (item) => `اترك ${item} جانبا حتى تبدأ الصلصة كي لا يفرط في الطهي، جففه وتبله خفيفا لمدة دقيقة.`,
    arabicSecondaryStep: (item) => `اطهِ ${item} مع ثلث كوب ماء أو مرق أو صلصة طماطم 8 إلى 12 دقيقة حتى تتكون قاعدة النكهة.`,
    arabicFinishStep: (item) => `أضف ${item} في آخر 4 إلى 7 دقائق فقط، واتركه على غليان هادئ حتى يصبح الجمبري ورديا أو يتفتت السمك بسهولة مع بقائه طريا.`,
    arabicPlateStep: "اترك اليخنة بعيدا عن النار دقيقتين، ثم قدمها بهدوء حتى يبقى السي فود متماسكا والصلصة لامعة."
  };
}

function generalStewProfile(): CookingProfile {
  return {
    englishHeatStep: "Use a pot over medium heat for 2 minutes, then add 1 tsp oil or the listed cooking fat for the stew base.",
    englishPrimaryStep: (item) => `Add ${item} and cook 6 to 10 minutes, stirring every 2 minutes, until lightly browned or softened before the simmer starts.`,
    englishSecondaryStep: (item) => `Add ${item} with 1/2 cup water, broth, tomato sauce, or the listed cooking liquid and bring it to a gentle simmer for 3 minutes.`,
    englishFinishStep: (item) => `Stir in ${item}, cover, and simmer 20 to 35 minutes until the main ingredient is cooked through and the sauce tastes developed.`,
    englishPlateStep: "Rest the stew off heat for 3 minutes, then plate one portion with sauce spooned over the main ingredient.",
    arabicHeatStep: "استخدم قدرا على نار متوسطة لمدة دقيقتين، ثم أضف ملعقة صغيرة زيت أو الدهن المذكور لقاعدة اليخنة.",
    arabicPrimaryStep: (item) => `أضف ${item} واطهه 6 إلى 10 دقائق مع التقليب كل دقيقتين حتى يتحمر أو يطرى قبل بدء التسبيك.`,
    arabicSecondaryStep: (item) => `أضف ${item} مع نصف كوب ماء أو مرق أو صلصة طماطم واتركه على غليان هادئ 3 دقائق.`,
    arabicFinishStep: (item) => `أضف ${item}، غط القدر واتركه 20 إلى 35 دقيقة حتى ينضج المكون الرئيسي وتتطور نكهة الصلصة.`,
    arabicPlateStep: "اترك اليخنة بعيدا عن النار 3 دقائق، ثم قدم حصة واحدة مع الصلصة فوق المكون الرئيسي."
  };
}

function defaultProfile(overrides: {
  englishPrimary?: (item: string) => string;
  arabicPrimary?: (item: string) => string;
} = {}): CookingProfile {
  return {
    englishHeatStep: "Warm the main pan over medium heat for 2 minutes, then add 1 tsp oil or the listed cooking fat and spread it into a thin, shimmering layer.",
    englishPrimaryStep: overrides.englishPrimary ?? ((item) => `Add ${item} first and cook for 4 to 6 minutes, stirring or turning every 60 seconds, until the edges look lightly browned or softened.`),
    englishSecondaryStep: (item) => isFreshServingIngredient(item)
      ? `Keep ${item} fresh for serving or add it only at the end; do not simmer it with water because it is a garnish, fresh vegetable, or crisp topping.`
      : `Add ${item} and cook 2 to 5 minutes until it softens, browns lightly, or smells aromatic according to the dish style.`,
    englishFinishStep: (item) => `Fold in ${item} in small additions, cooking only as long as needed so the colors stay bright and the texture remains tender, not mushy.`,
    englishPlateStep: "Rest the meal off heat for 2 minutes, then plate one portion with the main ingredient centered and any sauce or garnish spooned evenly over the top.",
    arabicHeatStep: "سخن المقلاة الرئيسية على نار متوسطة لمدة دقيقتين، ثم أضف ملعقة صغيرة من الزيت أو الدهن المذكور ووزعه كطبقة رقيقة لامعة.",
    arabicPrimaryStep: overrides.arabicPrimary ?? ((item) => `أضف ${item} أولا واطهه لمدة 4 إلى 6 دقائق، مع التقليب كل دقيقة، حتى تصبح الأطراف ذهبية خفيفة أو طرية.`),
    arabicSecondaryStep: (item) => isFreshServingIngredient(item)
      ? `اترك ${item} طازجا للتقديم أو أضفه في النهاية فقط؛ لا تغليه بالماء لأنه خضار مقرمش أو زينة.`
      : `أضف ${item} واطهه 2 إلى 5 دقائق حتى يطرى أو يتحمر قليلا أو تظهر رائحته حسب طبيعة الطبق.`,
    arabicFinishStep: (item) => `أضف ${item} على دفعات صغيرة، واطهه فقط بالقدر اللازم حتى يبقى اللون واضحا والقوام طريا بدون أن يتهرى.`,
    arabicPlateStep: "اترك الوجبة بعيدا عن النار لمدة دقيقتين، ثم قدم حصة واحدة مع وضع المكون الرئيسي في الوسط وتوزيع الصلصة أو الزينة بالتساوي فوقه."
  };
}

function isFreshServingIngredient(item: string) {
  return /\b(cucumber|lettuce|pickle|pickles|radish|fresh herb|parsley|cilantro|mint|lemon|lime|scallion|spring onion)\b|\u062e\u064a\u0627\u0631|\u062e\u0633|\u0645\u062e\u0644\u0644|\u0641\u062c\u0644|\u0628\u0642\u062f\u0648\u0646\u0633|\u0643\u0632\u0628\u0631\u0629|\u0646\u0639\u0646\u0627\u0639|\u0644\u064a\u0645\u0648\u0646/u.test(item);
}

function detectCookingMethod(text: string): CookingMethod {
  if (/\b(stew|stewed|braise|braised|ragout|goulash|tagine|tajine|curry|soup)\b|يخنة|طاجن|كاري|شوربة/u.test(text)) return "stew";
  if (/\b(roast|roasted|baked|oven|sheet pan|tray)\b|فرن|مخبوز|صينية/u.test(text)) return "roast";
  if (/\b(grill|grilled|bbq|barbecue|skewer|kebab)\b|مشوي|شواية|كباب/u.test(text)) return "grill";
  if (/\b(fry|fried|crispy|breaded|cutlet)\b|مقلي|مقرمش/u.test(text)) return "fry";
  return "skillet";
}

function detectPrimaryFood(text: string): PrimaryFood {
  if (/\b(ground|minced|mince|hamburger)\b|مفروم/u.test(text)) return "groundMeat";
  if (/\b(beef|steak|veal|lamb|mutton|meat cubes|stew meat|roast)\b|لحم|ستيك/u.test(text)) return "beef";
  if (/\b(chicken|hen|poultry|breast|thigh)\b|دجاج|فراخ|فرخة/u.test(text)) return "chicken";
  if (/\b(shrimp|prawn|prawns)\b|جمبري|روبيان|قريدس/u.test(text)) return "shrimp";
  if (/\b(fish|salmon|tilapia|cod|tuna|seafood)\b|سمك|سلمون|تونة|سي فود/u.test(text)) return "fish";
  if (/\b(egg|eggs)\b|بيض/u.test(text)) return "egg";
  if (/\b(rice|pasta|noodle|grain|quinoa|bulgur)\b|أرز|رز|مكرونة|معكرونة/u.test(text)) return "grain";
  if (/\b(pepper|tomato|onion|zucchini|eggplant|potato|carrot|vegetable|veggie)\b|طماطم|بصل|فلفل|بطاطس|خضار/u.test(text)) return "vegetable";
  return "general";
}

function readIngredientLabel(value: unknown) {
  if (typeof value === "string") {
    return value.replace(/\s+-\s+.*$/, "").trim();
  }

  if (value && typeof value === "object") {
    const ingredient = value as { name?: unknown; canonical?: unknown };
    if (typeof ingredient.name === "string" && ingredient.name.trim()) return ingredient.name.trim();
    if (typeof ingredient.canonical === "string" && ingredient.canonical.trim()) return ingredient.canonical.trim();
  }

  return "";
}
