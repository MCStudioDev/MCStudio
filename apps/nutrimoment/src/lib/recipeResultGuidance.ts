export interface RecipeResultGuidance {
  title: string;
  reasons: string[];
  suggestions: string[];
}

export interface RecipeResultContext {
  returnedCount: number;
  requestedCount: number;
  maxMissingIngredients: number;
  preferredCuisine: string;
  language: string;
  hasRestrictions: boolean;
  missingLimitRejected?: number;
  safetyRejected?: number;
  recentExcluded?: number;
  otherCuisineCount?: number;
  serviceUnavailable?: boolean;
  aiCreditsExhausted?: boolean;
}

/** Explain observed results separately from settings that may narrow the search. */
export function buildRecipeResultGuidance(context: RecipeResultContext): RecipeResultGuidance | null {
  const ar = context.language === "ar" || context.language === "Arabic";
  const { returnedCount: returned, requestedCount: requested } = context;
  if (returned >= requested && !context.otherCuisineCount && !context.serviceUnavailable) return null;
  if (context.serviceUnavailable && !returned) {
    return {
      title: ar ? "تعذر إكمال البحث" : "Recipe search could not finish",
      reasons: [ar ? "تعذر إكمال البحث الآن، لذلك لا يمكننا تحديد ما إذا كانت مكوناتك تطابق وصفات مناسبة." : "We could not complete the search, so we cannot tell whether your ingredients have suitable matches."],
      suggestions: [ar ? "حاول مرة أخرى بعد قليل بنفس الإعدادات." : "Try again shortly with the same settings."]
    };
  }
  const reasons: string[] = [];
  const suggestions: string[] = [];
  const limit = Math.max(0, Math.floor(context.maxMissingIngredients));
  if (returned < requested) {
    reasons.push(ar ? "لم نجد ما يكفي من الوصفات التي تجتاز الفحوص مع المكونات والإعدادات الحالية." : "We could not find enough verified recipes with your current ingredients and settings.");
    reasons.push(limit === 0
      ? ar ? "المكونات المفقودة مضبوطة على 0: نستبعد الوصفات التي تحتاج إلى شراء مكونات إضافية. هذا يضيّق نطاق البحث." : "Missing ingredients is set to 0: we exclude recipes that need additional shopping ingredients. This narrows the search."
      : ar ? `تسمح إعداداتك بحد أقصى ${limit} من المكونات المفقودة لكل وصفة.` : `Your limit allows up to ${limit} missing ingredient${limit === 1 ? "" : "s"} per recipe.`);
    if (context.missingLimitRejected) reasons.push(ar
      ? "استُبعدت بعض الوصفات المطابقة في البحث لأنها تحتاج مكونات مفقودة أكثر من الحد الذي اخترته."
      : "Some otherwise matching recipes in the search needed more missing ingredients than your limit allows.");
    if (context.safetyRejected) reasons.push(ar
      ? "حُجبت بعض الوصفات لأنها لم تجتز الفحوص الغذائية الحالية."
      : "Some recipes were withheld because they did not pass your current dietary checks.");
    else if (context.hasRestrictions) reasons.push(ar
      ? "تظل قيودك الغذائية والصحية ومسببات الحساسية جزءًا من الفحص."
      : "Your saved dietary, health and allergy restrictions remain part of the checks.");
    if (context.recentExcluded) reasons.push(ar
      ? "استُبعدت بعض الوصفات لأنها عُرضت لك خلال آخر 24 ساعة."
      : "Some recipes were excluded because they were shown to you in the last 24 hours.");
    if (context.aiCreditsExhausted) reasons.push(ar
      ? "نفد رصيد الذكاء الاصطناعي، لذلك اقتصر البحث على الوصفات الجاهزة ولم تُنشأ وصفات إضافية."
      : "Your AI credits are used up, so we searched existing recipes without generating additional options.");
    suggestions.push(ar ? "أضف مكونات أخرى متوفرة لديك بالفعل، وتحقق من أسماء المكونات." : "Add other ingredients you already have, and check the ingredient names.");
    suggestions.push(limit === 0
      ? ar ? "إذا كنت مستعدًا لشراء مكون أو مكونين، غيّر الحد الأقصى للمكونات المفقودة إلى 1 أو 2 في الإعدادات، ثم حاول مجددًا." : "If you are happy to buy 1 or 2 ingredients, change Max Missing Ingredients to 1 or 2 in Settings, then try again."
      : ar ? "إذا كنت مستعدًا لشراء مكونات إضافية، ارفع الحد الأقصى للمكونات المفقودة في الإعدادات، ثم حاول مجددًا." : "If you are happy to buy more ingredients, increase Max Missing Ingredients in Settings, then try again.");
  }
  if (context.otherCuisineCount) reasons.push(ar
    ? `لم تكفِ الوصفات المناسبة من المطبخ المختار (${context.preferredCuisine})، لذا تتضمن النتائج وصفات من مطابخ أخرى.`
    : `There were not enough suitable ${context.preferredCuisine} recipes, so the results include recipes from other cuisines.`);
  if (context.preferredCuisine && context.preferredCuisine !== "Any") {
    if (!context.otherCuisineCount) reasons.push(ar ? `تفضيل المطبخ الحالي هو ${context.preferredCuisine}.` : `Your cuisine preference is ${context.preferredCuisine}.`);
    suggestions.push(ar ? "جرّب مطبخًا آخر أو اختر «أي مطبخ» في الإعدادات لبحث أوسع." : "Try another cuisine or choose Any in Settings for a broader search.");
  }
  return {
    title: returned ? ar ? `وجدنا ${returned} من ${requested} وصفات مطلوبة` : `Found ${returned} of ${requested} requested recipes` : ar ? "لم نجد وصفات تطابق إعداداتك الحالية" : "No recipes matched your current settings",
    reasons,
    suggestions
  };
}
