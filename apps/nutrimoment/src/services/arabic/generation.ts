import { z } from "zod";
import { accessErrorResponse, accessPayload, canUseApiFeature, releaseFreeAiAction, reserveFreeAiAction } from "@/services/authService";
import { loadGenerationRestrictions } from "@/services/generationProfileService";
import { applyRateLimit, rateLimitedResponse } from "@/services/rateLimitService";
import { ProfileUnavailableError } from "@/lib/profileSafety";
import { findRecipeDietViolation } from "@/lib/dietEnforcement";
import { findRecipeHealthViolation } from "@/lib/healthEnforcement";
import { canReuseRecipePhotoForDiet } from "@/services/recipePhotoReusePolicy";
import { buildMealPlanPreferenceSignature } from "@/lib/mealPlanPreferenceSignature";
import { buildShoppingListFromMealIngredients } from "@/lib/shoppingListNormalizer";
import { assertSafeMealPlan } from "@/lib/generationSafety";
import { logger } from "@/lib/logger";
import type { MealPlanData, Recipe } from "@/lib/types";
import { arabicDisabledResponse, arabicEnabled, ARABIC_REQUEST_BUDGET_MS, ARABIC_VALIDATOR_VERSION } from "./config";
import { normalizeArabicInputs } from "./ingredients";
import { listArabicRecipes, saveArabicResult } from "./repository";
import { englishSourceFingerprint, englishSourceRecipe, findEnglishSources, readEnglishSource } from "./englishSources";
import { arabicRecipeSchema, buildArabicEntry, partitionArabicRecipe } from "./validation";
import { callArabicModel, generateArabicRecipes, translateArabicSource } from "./gemini";
import { arabicRepairSchema } from "./modelSchemas";
import type { ArabicRecipeEntry } from "./types";
import { cuisineMatchesPreference } from "@/lib/cuisines";

const schema = z.object({
  ingredients: z.array(z.string().min(1).max(300)).max(60).optional(),
  pantry: z.array(z.string().min(1).max(300)).max(60).optional(),
  pantryItems: z.array(z.object({ name: z.string().min(1).max(300), quantity: z.string().max(60).optional() })).max(60).optional(),
  recipeCount: z.number().int().min(1).max(10).default(10),
  maxMissingIngredients: z.number().int().min(0).max(30).default(5),
  preferredCuisine: z.string().max(80).default("Any"), calorieTarget: z.number().min(500).max(6000).default(1650),
  actionId: z.string().regex(/^[\w-]{1,128}$/).optional()
});
type Pair = { canonical: unknown; recipe: unknown; source?: ArabicRecipeEntry["source"] };
const pairsFrom = (value: unknown): Pair[] => {
  const parsed = z.object({ recipes: z.array(z.object({ canonical: z.unknown(), recipe: z.unknown() })).max(21) }).safeParse(value);
  return parsed.success ? parsed.data.recipes.map(pair => ({ canonical: pair.canonical, recipe: pair.recipe })) : [];
};

export async function handleArabicGeneration(request: Request, mode: "recipes" | "mealplan") {
  if (!arabicEnabled()) return arabicDisabledResponse();
  const requestId = crypto.randomUUID(), startedAt = Date.now(), deadline = startedAt + ARABIC_REQUEST_BUDGET_MS;
  let access: Awaited<ReturnType<typeof canUseApiFeature>>["access"] | undefined;
  let reservationId: string | undefined;
  let imageActionGrantId: string | undefined;
  let didCallAi = false;
  try {
    const authorization = await canUseApiFeature(request, mode === "recipes" ? "recipe_generation" : "weekly_plan");
    access = authorization.access;
    const limit = applyRateLimit({ uid: access.uid, feature: mode === "recipes" ? "recipe_generation" : "meal_plan", isPremium: authorization.allowed, bypass: access.isAdmin });
    if (!limit.decision.allowed) return rateLimitedResponse(limit.decision, limit.config);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ code: "INVALID_INPUT", error: "تحقق من المكونات والإعدادات ثم حاول مجددًا." }, { status: 400 });
    const input = parsed.data;
    const restrictions = await loadGenerationRestrictions(access.uid);
    const raw = input.ingredients ?? input.pantry ?? input.pantryItems?.map(item => item.name) ?? [];
    if (!raw.length) return Response.json({ error: "أضف مكونًا واحدًا على الأقل." }, { status: 400 });
    const normalized = await normalizeArabicInputs(raw);
    if (normalized.unclear.length) return Response.json({ code: "INGREDIENT_CLARIFICATION_REQUIRED", error: "يرجى توضيح المكونات المحددة أو كتابة أسمائها بشكل أدق.", items: normalized.unclear }, { status: 422 });
    const count = mode === "mealplan" ? 21 : input.recipeCount;
    const accepted = new Map<string, ArabicRecipeEntry>();
    const output = new Map<string, Recipe>();
    let invalidCount = 0, modelFailureCount = 0;
    let generationRequestFailed = false;
    const rejectionCounts: Record<string, number> = {};
    const recordReasons = (reasons: string[]) => {
      for (const reason of reasons) {
        // Quality-gate details can include ingredient text. Log only stable codes.
        const code = reason.split(":").slice(0, /^(canonical|arabic):/.test(reason) ? 2 : 1).join(":");
        rejectionCounts[code] = (rejectionCounts[code] ?? 0) + 1;
      }
    };
    const consider = async (entry: ArabicRecipeEntry) => {
      if (accepted.size >= count || entry.validatorVersion !== ARABIC_VALIDATOR_VERSION) return;
      if (!cuisineMatchesPreference(entry.canonical.cuisine, input.preferredCuisine)) { recordReasons(["cuisine_mismatch"]); return; }
      const rebuilt = await buildArabicEntry(entry.canonical, entry.recipe, restrictions, entry.source);
      if (!rebuilt.entry || rebuilt.entry.fingerprint !== entry.fingerprint) { invalidCount++; recordReasons(rebuilt.reasons.length ? rebuilt.reasons : ["stale_fingerprint"]); return; }
      if (entry.source) {
        const source = await readEnglishSource(entry.source.id);
        if (!source || englishSourceFingerprint(source) !== entry.source.fingerprint) { recordReasons(["source_ineligible"]); return; }
        const english = englishSourceRecipe(source);
        if (canReuseRecipePhotoForDiet(english, restrictions.diets, true)) {
          rebuilt.entry.recipe.image_url = english.image_url;
          rebuilt.entry.recipe.image_source = english.image_source;
        }
      }
      const displayed = await partitionArabicRecipe(rebuilt.entry, normalized.canonical, input.maxMissingIngredients);
      if (!displayed) { recordReasons(["pantry_mismatch"]); return; }
      accepted.set(rebuilt.entry.id, rebuilt.entry); output.set(rebuilt.entry.id, displayed);
    };
    for (const entry of await listArabicRecipes(normalized.canonical)) await consider(entry);
    const failed: Array<Pair & { reasons: string[] }> = [];
    const processPair = async (pair: Pair) => {
      try {
        const validated = await buildArabicEntry(pair.canonical, pair.recipe, restrictions, pair.source);
        if (validated.entry) await consider(validated.entry);
        else {
          invalidCount++; recordReasons(validated.reasons);
          // A translation repair cannot fix an invalid canonical recipe.
          if (!validated.reasons.some(reason => reason.startsWith("canonical:"))) failed.push({ ...pair, reasons: validated.reasons });
        }
      } catch {
        invalidCount++; recordReasons(["invalid_recipe_shape"]);
        if (arabicRecipeSchema.safeParse(pair.canonical).success) failed.push({ ...pair, reasons: ["invalid_recipe_shape"] });
      }
    };
    if (accepted.size < count && authorization.allowed) {
      // A completed English or Arabic action ID supplied by a client must not
      // authorize another generation for free. Repairs share this server action.
      const reservation = await reserveFreeAiAction(access, mode === "recipes" ? "recipe_generation" : "weekly_plan", requestId);
      reservationId = reservation.actionId;
      imageActionGrantId = reservation.actionGrantId;
      const sources = (await findEnglishSources(normalized.canonical)).filter(source =>
        !findRecipeDietViolation(source, restrictions) && !findRecipeHealthViolation(source, restrictions.conditions)
        && cuisineMatchesPreference(englishSourceRecipe(source).cuisine, input.preferredCuisine)
      ).slice(0, Math.min(3, count - accepted.size));
      const translations = await Promise.allSettled(sources.map(async source => {
        const canonical = englishSourceRecipe(source), fingerprint = englishSourceFingerprint(source);
        didCallAi = true;
        const translated = await translateArabicSource(`${source.id}:${fingerprint}:${ARABIC_VALIDATOR_VERSION}`, canonical, Math.min(deadline, Date.now() + 25_000), requestId);
        const result = z.object({ recipe: z.unknown() }).parse(translated);
        return { canonical, recipe: result.recipe, source: { id: source.id, fingerprint } };
      }));
      for (const result of translations) {
        if (result.status === "fulfilled") await processPair(result.value);
        else { modelFailureCount++; recordReasons(["translation_request_failed"]); }
      }
      if (accepted.size < count && deadline - Date.now() > 15_000) {
        didCallAi = true;
        try {
          const generated = await generateArabicRecipes({ ingredients: normalized.canonical, restrictions, count: count - accepted.size, cuisine: input.preferredCuisine, calorieTarget: input.calorieTarget, missingLimit: input.maxMissingIngredients }, deadline - 10_000, requestId);
          const pairs = pairsFrom(generated);
          if (!pairs.length) { modelFailureCount++; generationRequestFailed = true; recordReasons(["empty_or_malformed_model_response"]); }
          for (const pair of pairs) await processPair(pair);
        } catch (error) {
          modelFailureCount++; generationRequestFailed = true;
          recordReasons([error instanceof Error && /too many states for serving/i.test(error.message) ? "model_schema_rejected" : "generation_request_failed"]);
        }
      }
      if (failed.length && accepted.size < count && deadline - Date.now() >= 5000) {
        // One repair batch; canonical recipes and source links are never accepted back from the model.
        try {
          const repairItems = failed.slice(0, count).map((pair, index) => ({ ...pair, index }));
          const repair = await callArabicModel(`Repair only the Arabic translations using these validation reasons. Keep the canonical recipes unchanged. Return {"repairs":[{"index":number,"recipe":ArabicRecipe}]}, copying the supplied zero-based index. Preserve every numeric quantity and every numeral in each instruction exactly, in order, without unit conversion or number words. Translate every cooking action.\n${JSON.stringify(repairItems)}`, deadline, requestId, "arabic_language_repair", arabicRepairSchema);
          const result = z.object({ repairs: z.array(z.object({ index: z.number().int().nonnegative(), recipe: z.unknown() })).max(21) }).parse(repair);
          for (const item of result.repairs) if (failed[item.index]) {
            const original = failed[item.index];
            const validated = await buildArabicEntry(original.canonical, item.recipe, restrictions, original.source);
            if (validated.entry) await consider(validated.entry);
            else recordReasons(validated.reasons);
          }
        } catch { modelFailureCount++; recordReasons(["repair_request_failed"]); }
      }
    }
    // Recheck source eligibility immediately before any Arabic publication.
    for (const [id, entry] of accepted) if (entry.source) {
      const source = await readEnglishSource(entry.source.id);
      if (!source || englishSourceFingerprint(source) !== entry.source.fingerprint) { accepted.delete(id); output.delete(id); }
    }
    const recipes = [...output.values()].map(recipe => imageActionGrantId ? { ...recipe, image_action_grant_id: imageActionGrantId } : recipe);
    if (!recipes.length || (mode === "mealplan" && recipes.length < 21)) {
      if (reservationId) { await releaseFreeAiAction(access, reservationId); reservationId = undefined; }
      logger.warn("Arabic generation produced insufficient validated results", { requestId, mode, returned: recipes.length, invalidCount, modelFailureCount, rejectionCounts });
      const failureCode = generationRequestFailed ? "ARABIC_AI_UNAVAILABLE" : invalidCount ? "ARABIC_VALIDATION_FAILED" : modelFailureCount ? "ARABIC_AI_UNAVAILABLE" : "ARABIC_RESULTS_UNAVAILABLE";
      if (authorization.allowed && failureCode !== "ARABIC_RESULTS_UNAVAILABLE") {
        const reason = failureCode === "ARABIC_VALIDATION_FAILED"
          ? "تعذر التحقق من دقة الوصفات العربية التي تم توليدها، لذلك لم نعرضها. هذه مشكلة في نتيجة التوليد وليست في اشتراكك."
          : "تعذر إكمال توليد الوصفات بالعربية الآن بسبب مشكلة في خدمة التوليد. اشتراكك يتيح التوليد.";
        return Response.json({ code: failureCode, error: reason + " حاول مجددًا أو بدّل إلى الإنجليزية. لم يتم خصم رصيد، ونتائجك السابقة محفوظة.", recipes: [], generationLanguage: "ar", requestId }, { status: 503 });
      }
      const shortage = !authorization.allowed
        ? " تتوفر الوصفات العربية المحفوظة فقط لأن رصيد التوليد غير متاح. لم يتم استخدام رصيد إضافي."
        : input.maxMissingIngredients === 0
          ? " الحد الأقصى للمكونات الناقصة هو صفر؛ أضف المكونات المتوفرة لديك أو اسمح بمكون ناقص واحد أو اثنين."
          : ` الحد الأقصى للمكونات الناقصة هو ${input.maxMissingIngredients}. أضف مكونات متوفرة لديك أو عدّل هذا الحد. تبقى قيودك الغذائية مطبقة.`;
      return Response.json({ code: "ARABIC_RESULTS_UNAVAILABLE", error: (mode === "mealplan" ? "لم نتمكن من إعداد أسبوع كامل يجتاز الفحوص بالعربية. لم يتم استبدال خطتك الحالية." : "لم نجد وصفات عربية تجتاز الفحوص بهذه الإعدادات.") + shortage, recipes: [], generationLanguage: "ar", requestId }, { status: 503 });
    }
    let mealPlan: MealPlanData | undefined;
    if (mode === "mealplan") {
      const completeRecipes = recipes.map(recipe => ({ ...recipe, ingredients: [...recipe.ingredients, ...recipe.missing_ingredients], missing_ingredients: [] }));
      const days = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
      mealPlan = { generationLanguage: "ar", plan: days.map((day, index) => ({ day, breakfast: completeRecipes[index * 3], lunch: completeRecipes[index * 3 + 1], dinner: completeRecipes[index * 3 + 2] })), shoppingList: [], preferenceSignature: buildMealPlanPreferenceSignature({ ...restrictions, ...input, uiLanguage: "ar" }) };
      mealPlan.shoppingList = buildShoppingListFromMealIngredients({ mealPlan, pantryItems: input.pantryItems ?? normalized.canonical.map(name => ({ name, quantity: "1" })), displayLanguage: "ar" });
      if (mealPlan.shoppingList.some(item => /[A-Za-z]/.test(item))) throw new Error("Arabic shopping-list language validation failed");
      assertSafeMealPlan(mealPlan, restrictions);
    }
    if (Date.now() > deadline) throw new Error("Arabic request deadline exceeded before publication");
    if (!arabicEnabled()) {
      if (reservationId) await releaseFreeAiAction(access, reservationId);
      reservationId = undefined;
      return arabicDisabledResponse();
    }
    const completedAccess = await saveArabicResult({ uid: access.uid, requestId, entries: [...accepted.values()], displayedRecipes: recipes, ingredients: normalized.original, restrictions, mealPlan, imageActionGrantId, billing: didCallAi ? { access, actionId: reservationId } : undefined });
    if (completedAccess) access = completedAccess;
    reservationId = undefined;
    logger.info("Arabic generation completed", { requestId, mode, returned: recipes.length, invalidCount, modelFailureCount, rejectionCounts, elapsedMs: Date.now() - startedAt });
    return Response.json({ recipes, result: JSON.stringify(mealPlan ?? recipes), generationLanguage: "ar", generationStatus: recipes.length < count ? "PARTIAL_RESULTS" : "SUCCESS_DATASET", message: recipes.length < count ? `تم العثور على ${recipes.length} من ${count} وصفات تجتاز الفحوص بالعربية.` : undefined, requestId, access: accessPayload(access) });
  } catch (error) {
    if (access && reservationId) await releaseFreeAiAction(access, reservationId);
    if (!access) return accessErrorResponse(error);
    logger.warn("Arabic workflow failed", { requestId, error: error instanceof Error ? error.message : "unknown" });
    return Response.json({ code: error instanceof ProfileUnavailableError ? "PROFILE_UNAVAILABLE" : "ARABIC_SERVICE_UNAVAILABLE", error: "تعذر إكمال الطلب بالعربية الآن. لم يتم تغيير نتائجك السابقة. حاول مجددًا بعد قليل.", requestId }, { status: 503 });
  }
}
