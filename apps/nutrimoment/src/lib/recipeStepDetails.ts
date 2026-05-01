import type { MealPlanData, MealPlanMeal, Recipe } from "@/lib/types";

type StepLanguage = "English" | "Arabic";

interface StepSource {
  ingredients?: unknown[];
  missing_ingredients?: unknown[];
  name: string;
  steps?: string[];
}

export function ensureDetailedRecipeSteps(recipe: Recipe, language: StepLanguage = "English"): Recipe {
  return {
    ...recipe,
    steps: buildDetailedSteps(recipe, language)
  };
}

export function ensureDetailedMealSteps(meal: MealPlanMeal, language: StepLanguage = "English"): MealPlanMeal {
  return {
    ...meal,
    steps: buildDetailedSteps(meal, language)
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

function buildDetailedSteps(source: StepSource, language: StepLanguage) {
  const rawExisting = Array.isArray(source.steps)
    ? source.steps.map((step) => step.trim()).filter(Boolean)
    : [];
  const existing =
    language === "Arabic" && rawExisting.some((step) => /[A-Za-z]/.test(step))
      ? []
      : rawExisting;

  if (existing.length >= 7) {
    return existing;
  }

  const ingredients = source.ingredients?.map(readIngredientLabel).filter(Boolean) ?? [];
  const missing = source.missing_ingredients?.map(readIngredientLabel).filter(Boolean) ?? [];
  const primary = ingredients[0] ?? missing[0] ?? (language === "Arabic" ? "المكون الرئيسي" : "main ingredient");
  const secondary = ingredients[1] ?? missing[1] ?? (language === "Arabic" ? "المكون الثاني" : "second ingredient");
  const finishing = [...ingredients, ...missing].slice(2, 5).join(", ");
  const finalSteps = language === "Arabic"
    ? buildArabicFallbackSteps(source.name, primary, secondary, finishing)
    : buildEnglishFallbackSteps(source.name, primary, secondary, finishing);

  return [...existing, ...finalSteps].slice(0, Math.max(7, existing.length));
}

function buildEnglishFallbackSteps(name: string, primary: string, secondary: string, finishing: string) {
  const finishText = finishing || "the remaining ingredients";

  return [
    `Prep for ${name}: measure 1 serving of ${primary} and 1 serving of ${secondary}; keep ${finishText} nearby so each addition is ready before cooking.`,
    `Warm the main pan over medium heat for 2 minutes, then add 1 tsp oil or the listed cooking fat and spread it into a thin, shimmering layer.`,
    `Add ${primary} first and cook for 4 to 6 minutes, stirring or turning every 60 seconds, until the edges look lightly browned or softened.`,
    `Add ${secondary} with 2 tbsp water or cooking liquid, then cook for 3 to 5 minutes until the mixture smells aromatic and the liquid mostly evaporates.`,
    `Fold in ${finishText} in small handfuls, cooking 2 to 4 minutes more so the colors brighten and the texture stays tender, not mushy.`,
    `Taste and adjust with 1 pinch salt, 1 pinch pepper, or the listed seasoning; cook 1 final minute so the seasoning clings to the food.`,
    `Rest the meal off heat for 2 minutes, then plate one portion with the main ingredient centered and any sauce or garnish spooned evenly over the top.`
  ];
}

function buildArabicFallbackSteps(name: string, primary: string, secondary: string, finishing: string) {
  const finishText = finishing || "باقي المكونات";

  return [
    `حضّر ${name}: قِس حصة واحدة من ${primary} وحصة واحدة من ${secondary}، وضع ${finishText} بجانبك حتى تكون الإضافات جاهزة قبل الطبخ.`,
    "سخّن المقلاة الرئيسية على نار متوسطة لمدة دقيقتين، ثم أضف ملعقة صغيرة من الزيت أو الدهن المذكور ووزعه كطبقة رقيقة لامعة.",
    `أضف ${primary} أولاً واطهه لمدة 4 إلى 6 دقائق، مع التقليب كل دقيقة، حتى تصبح الأطراف ذهبية خفيفة أو طرية.`,
    `أضف ${secondary} مع ملعقتين كبيرتين من الماء أو سائل الطبخ، واطهه 3 إلى 5 دقائق حتى تظهر الرائحة ويتبخر معظم السائل.`,
    `أضف ${finishText} على دفعات صغيرة، واطهه 2 إلى 4 دقائق حتى يثبت اللون ويبقى القوام طرياً بدون أن يتهرى.`,
    "تذوق واضبط بقرصة ملح وقرصة فلفل أو التوابل المذكورة، ثم اطهِ دقيقة أخيرة حتى تلتصق النكهة بالمكونات.",
    "اترك الوجبة بعيداً عن النار لمدة دقيقتين، ثم قدّم حصة واحدة مع وضع المكون الرئيسي في الوسط وتوزيع الصلصة أو الزينة بالتساوي فوقه."
  ];
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
