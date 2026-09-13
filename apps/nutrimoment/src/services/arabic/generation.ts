import { z } from "zod";
import { accessErrorResponse, accessPayload, canUseApiFeature, releaseFreeAiAction, reserveFreeAiAction } from "@/services/authService";
import { loadGenerationRestrictions } from "@/services/generationProfileService";
import { rateLimitedResponse } from "@/services/rateLimitService";
import { applyArabicRateLimit as applyRateLimit } from "./rateLimit";
import { ProfileUnavailableError } from "@/lib/profileSafety";
import { findRecipeDietViolation } from "@/lib/dietEnforcement";
import { findRecipeHealthViolation } from "@/lib/healthEnforcement";
import { buildMealPlanPreferenceSignature } from "@/lib/mealPlanPreferenceSignature";
import { buildArabicShoppingList } from "./shoppingFacts";
import { assertSafeMealPlan } from "@/lib/generationSafety";
import { logger } from "@/lib/logger";
import type { MealPlanData, Recipe } from "@/lib/types";
import { arabicDisabledResponse, arabicEnabled, ARABIC_REQUEST_BUDGET_MS, ARABIC_READABLE_VERSIONS } from "./config";
import { resolveArabicIngredients } from "./ingredientResolution";
import { listArabicRecipes, saveArabicResult, arabicPaths } from "./repository";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { arabicRecipeSchema, buildArabicEntry, partitionArabicRecipe, revalidateArabicEntry } from "./validation";
import { callArabicModel } from "./gemini";
import { generateArabicFactBatch } from "./factsGemini";
import { buildArabicFactsEntry, recipeFactsIdentity, type ArabicLabelReceipt } from "./recipeFacts";
import { findArabicSourceCandidates } from "./sourceCandidates";
import { arabicSourceIsCurrent } from "./sourceEligibility";
import { selectArabicWeeklyMeals } from "./weeklyFacts";
import { arabicFingerprint } from "./fingerprint";
import { arabicRepairSchema } from "./modelSchemas";
import type { ArabicRecipeEntry, ArabicRecipeSuggestion } from "./types";
import { arabicCuisineMatches as cuisineMatchesPreference } from "./cuisineGuidance";

const schema = z.object({
  ingredients: z.array(z.string().min(1).max(300)).max(60).optional(),
  pantry: z.array(z.string().min(1).max(300)).max(60).optional(),
  pantryItems: z.array(z.object({ name: z.string().min(1).max(300), quantity: z.string().max(60).optional() })).max(60).optional(),
  recipeCount: z.number().int().min(1).max(10).default(10),
  maxMissingIngredients: z.number().int().min(0).max(30).default(5),
  preferredCuisine: z.string().max(80).default("Any"), calorieTarget: z.number().min(500).max(6000).default(1650),
  actionId: z.string().regex(/^[\w-]{1,128}$/).optional()
});
type Pair = { canonical?: unknown; recipe?: unknown; facts?: unknown; labelReceipt?: ArabicLabelReceipt; safetyReceipt?: string; source?: ArabicRecipeEntry["source"]; variantKey?: string };
const pairsFrom = (value: unknown): Pair[] => {
  const parsed = z.object({ recipes: z.array(z.object({ canonical: z.unknown().optional(), recipe: z.unknown().optional(), facts: z.unknown().optional(),
    labelReceipt: z.object({ version: z.literal("ar-label-v1"), fingerprint: z.string() }).optional(),
    safetyReceipt: z.string().optional(),
    source: z.object({ id: z.string(), fingerprint: z.string(), kind: z.enum(["reference", "shared", "trusted"]).optional(), editorKey: z.string().optional(), editorFingerprint: z.string().optional() }).optional(), variantKey: z.string().optional() })).max(21) }).safeParse(value);
  return parsed.success ? parsed.data.recipes : [];
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
    const normalized = await resolveArabicIngredients(raw, { allowAi: authorization.allowed, deadline: Math.min(deadline, Date.now() + 15000), requestId });
    if (normalized.unclear.length) return Response.json({ code: "INGREDIENT_CLARIFICATION_REQUIRED", error: "يرجى توضيح المكونات المحددة أو كتابة أسمائها بشكل أدق.", items: normalized.unclear }, { status: 422 });
    const count = mode === "mealplan" ? 21 : input.recipeCount;
    const poolLimit = mode === "mealplan" ? 80 : count;
    const accepted = new Map<string, ArabicRecipeEntry>();
    const needsMore = () => mode === "mealplan" ? !selectArabicWeeklyMeals([...accepted.values()]) : accepted.size < count;
    const identities = new Set<string>();
    const output = new Map<string, Recipe>();
    const alternatives = new Map<string, ArabicRecipeSuggestion>();
    const alternativeSources = new Map<string, NonNullable<ArabicRecipeEntry["source"]>>();
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
      if (accepted.size >= poolLimit || !ARABIC_READABLE_VERSIONS.has(entry.validatorVersion)) return;
      if (!cuisineMatchesPreference(entry.canonical.cuisine, input.preferredCuisine)) { recordReasons(["cuisine_mismatch"]); return; }
      const rebuilt = await revalidateArabicEntry(entry, restrictions);
      if (!rebuilt.entry || rebuilt.entry.fingerprint !== entry.fingerprint) { invalidCount++; recordReasons(rebuilt.reasons.length ? rebuilt.reasons : ["stale_fingerprint"]); return; }
      if (entry.source && !await arabicSourceIsCurrent(entry.source)) { recordReasons(["source_ineligible"]); return; }
      const displayed = await partitionArabicRecipe(rebuilt.entry, normalized.canonical, 30);
      if (!displayed) { recordReasons(["pantry_mismatch"]); return; }
      if (displayed.missing_ingredients.length > input.maxMissingIngredients) {
        recordReasons(["missing_ingredient_limit"]);
        // Source eligibility was checked above; suggest only fully validated dishes.
        alternatives.set(entry.id, { name: displayed.name, missingIngredients: displayed.missing_ingredients, maxMissingIngredients: input.maxMissingIngredients });
        if (entry.source) alternativeSources.set(entry.id, entry.source);
        return;
      }
      const identity = entry.facts ? recipeFactsIdentity(entry.facts) : arabicFingerprint({ ingredients: entry.canonical.ingredients.map(value => value.toLowerCase()).sort(), steps: entry.canonical.steps });
      if (identities.has(identity)) { recordReasons(["duplicate_dish"]); return; }
      identities.add(identity);
      accepted.set(rebuilt.entry.id, rebuilt.entry); output.set(rebuilt.entry.id, displayed);
    };
    for (const entry of await listArabicRecipes(normalized.canonical)) await consider(entry);
    const failed: Array<Pair & { reasons: string[] }> = [];
    const processPair = async (pair: Pair) => {
      try {
        const validated = pair.facts ? await buildArabicFactsEntry(pair.facts, restrictions, pair.source, pair.labelReceipt, pair.safetyReceipt)
          : await buildArabicEntry(pair.canonical, pair.recipe, restrictions, pair.source);
        if (validated.entry && pair.variantKey) validated.entry.variantKey = pair.variantKey;
        if (validated.entry) await consider(validated.entry);
        else {
          invalidCount++; recordReasons(validated.reasons);
          // A translation repair cannot fix an invalid canonical recipe.
          if (!pair.facts && !validated.reasons.some(reason => reason.startsWith("canonical:"))) failed.push({ ...pair, reasons: validated.reasons });
        }
      } catch {
        invalidCount++; recordReasons(["invalid_recipe_shape"]);
        if (arabicRecipeSchema.safeParse(pair.canonical).success) failed.push({ ...pair, reasons: ["invalid_recipe_shape"] });
      }
    };
    const references = needsMore() && authorization.allowed ? await findArabicSourceCandidates(normalized.canonical, input.preferredCuisine, restrictions, count) : [];
    // Arabic cache is the entire discovery path without AI access. Entitled
    // requests can reuse a matching Arabic derivative before reserving an action.
    for (const reference of references) {
      const variant = (await getAdminDb().doc(arabicPaths.variant(reference.variantKey)).get()).data();
      if (variant?.recipeId && /^ar-[a-f0-9]{24}$/.test(variant.recipeId)) {
        const entry = (await getAdminDb().doc(arabicPaths.shared(variant.recipeId)).get()).data() as ArabicRecipeEntry | undefined;
        if (entry && entry.fingerprint === variant.fingerprint) await consider(entry);
      }
    }
    if (needsMore() && authorization.allowed) {
      // A completed English or Arabic action ID supplied by a client must not
      // authorize another generation for free. Repairs share this server action.
      const reservation = await reserveFreeAiAction(access, mode === "recipes" ? "recipe_generation" : "weekly_plan", requestId);
      reservationId = reservation.actionId;
      imageActionGrantId = reservation.actionGrantId;
      if (references.length && deadline - Date.now() > 25000) {
        try {
          didCallAi = true;
          const corrected = await generateArabicFactBatch({ ingredients: normalized.canonical, restrictions,
            count: Math.min(7, Math.max(1, count - accepted.size)), cuisine: input.preferredCuisine, calorieTarget: input.calorieTarget,
            missingLimit: input.maxMissingIngredients, sourceOnly: true, references: references.slice(0, 9),
            excludeNames: [...accepted.values()].map(entry => entry.canonical.name)
          }, Math.min(deadline - 15000, Date.now() + 35000), requestId);
          for (const pair of pairsFrom(corrected)) await processPair(pair);
          for (const diagnostic of corrected.diagnostics ?? []) recordReasons(diagnostic.issues);
          logger.info("Arabic source correction completed", { requestId, sources: references.map(item => ({
            id: item.source?.id, kind: item.source?.kind, editor: !!item.source?.editorKey, title: item.reference.title
          })), returned: corrected.recipes.length, diagnostics: corrected.diagnostics });
        } catch {
          modelFailureCount++; recordReasons(["source_correction_failed"]);
        }
      }
      if (mode === "mealplan" && deadline - Date.now() > 15000 && !selectArabicWeeklyMeals([...accepted.values()])) {
        didCallAi = true;
        // Three bounded meal-slot batches run together under one action and
        // deadline. Each aims for seven meals; no 21-recipe JSON megarequest.
        const batches = await Promise.allSettled(["breakfast", "lunch", "dinner"].map(type => generateArabicFactBatch({
          ingredients: normalized.canonical, restrictions, count: 7, cuisine: input.preferredCuisine,
          calorieTarget: input.calorieTarget, missingLimit: input.maxMissingIngredients,
          excludeNames: [...accepted.values()].map(entry => entry.canonical.name), mealTypesNeeded: [type]
        }, deadline - 5000, requestId)));
        for (const result of batches) {
          if (result.status === "fulfilled") for (const pair of pairsFrom(result.value)) await processPair(pair);
          else { modelFailureCount++; recordReasons(["weekly_batch_failed"]); }
        }
      }
      for (let batch = 0; mode === "recipes" && batch < 3 && accepted.size < count && deadline - Date.now() > 15000; batch++) {
        didCallAi = true;
        try {
          const generated = await generateArabicFactBatch({ ingredients: normalized.canonical, restrictions, count: Math.min(7, count - accepted.size), cuisine: input.preferredCuisine, calorieTarget: input.calorieTarget, missingLimit: input.maxMissingIngredients, excludeNames: [...accepted.values()].map(entry => entry.canonical.name),
            previousShortages: [...alternatives.values()].slice(-10).map(item => ({ name: item.name, missingIngredients: item.missingIngredients })) }, deadline - 5000, requestId);
          const pairs = pairsFrom(generated);
          if (!pairs.length) {
            if (generated.diagnostics?.some(item => item.issues.includes("no_feasible_ingredient_manifest"))) recordReasons(["missing_ingredient_limit"]);
            else { modelFailureCount++; generationRequestFailed = true; recordReasons(["empty_or_malformed_model_response"]); }
            break;
          }
          for (const pair of pairs) await processPair(pair);
          // Repeating a batch that added no accepted dishes cannot fill a plan.
          if (batch > 0 && pairs.every(pair => !pair.facts)) break;
        } catch (error) {
          modelFailureCount++; generationRequestFailed = true;
          recordReasons([error instanceof Error && /too many states for serving/i.test(error.message) ? "model_schema_rejected" : "generation_request_failed"]);
          break;
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
      if (!await arabicSourceIsCurrent(entry.source)) { accepted.delete(id); output.delete(id); }
    }
    const weeklyEntries = mode === "mealplan" ? selectArabicWeeklyMeals([...accepted.values()]) : null;
    const recipes = (weeklyEntries ? weeklyEntries.map(entry => output.get(entry.id)!) : [...output.values()]).map(recipe => imageActionGrantId ? { ...recipe, image_action_grant_id: imageActionGrantId } : recipe);
    for (const [id, entry] of alternativeSources) if (!await arabicSourceIsCurrent(entry)) alternatives.delete(id);
    const suggestions = [...alternatives.values()].sort((a, b) => a.missingIngredients.length - b.missingIngredients.length).slice(0, 3);
    if (!recipes.length || (mode === "mealplan" && !weeklyEntries)) {
      if (reservationId) { await releaseFreeAiAction(access, reservationId); reservationId = undefined; }
      logger.warn("Arabic generation produced insufficient validated results", { requestId, mode, returned: recipes.length, invalidCount, modelFailureCount, rejectionCounts });
      const failureCode = suggestions.length ? "ARABIC_RESULTS_UNAVAILABLE" : generationRequestFailed ? "ARABIC_AI_UNAVAILABLE" : invalidCount ? "ARABIC_VALIDATION_FAILED" : modelFailureCount ? "ARABIC_AI_UNAVAILABLE" : "ARABIC_RESULTS_UNAVAILABLE";
      if (authorization.allowed && failureCode !== "ARABIC_RESULTS_UNAVAILABLE") {
        const reason = failureCode === "ARABIC_VALIDATION_FAILED"
          ? "تعذر التحقق من دقة الوصفات العربية التي تم توليدها، لذلك لم نعرضها. هذه مشكلة في نتيجة التوليد وليست في اشتراكك."
          : "تعذر إكمال توليد الوصفات بالعربية الآن بسبب مشكلة في خدمة التوليد. اشتراكك يتيح التوليد.";
        return Response.json({ code: failureCode, error: reason + " حاول مجددًا أو بدّل إلى الإنجليزية. لم يتم خصم رصيد، ونتائجك السابقة محفوظة.", recipes: [], suggestions, generationLanguage: "ar", requestId }, { status: 503 });
      }
      const shortage = !authorization.allowed
        ? " تتوفر الوصفات العربية المحفوظة فقط لأن رصيد التوليد غير متاح. لم يتم استخدام رصيد إضافي."
        : input.maxMissingIngredients === 0
          ? " الحد الأقصى للمكونات الناقصة هو صفر؛ أضف المكونات المتوفرة لديك أو اسمح بمكون ناقص واحد أو اثنين."
          : ` الحد الأقصى للمكونات الناقصة هو ${input.maxMissingIngredients}. أضف مكونات متوفرة لديك أو عدّل هذا الحد. تبقى قيودك الغذائية مطبقة.`;
      return Response.json({ code: "ARABIC_RESULTS_UNAVAILABLE", error: (mode === "mealplan" ? "لم نتمكن من إعداد أسبوع كامل يجتاز الفحوص بالعربية. لم يتم استبدال خطتك الحالية." : "لم نجد وصفات عربية تجتاز الفحوص بهذه الإعدادات.") + shortage, recipes: [], suggestions, generationLanguage: "ar", requestId }, { status: 503 });
    }
    let mealPlan: MealPlanData | undefined;
    if (mode === "mealplan") {
      const completeRecipes = recipes.map(recipe => ({ ...recipe, ingredients: [...recipe.ingredients, ...recipe.missing_ingredients], missing_ingredients: [] }));
      const days = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
      mealPlan = { generationLanguage: "ar", plan: days.map((day, index) => ({ day, breakfast: completeRecipes[index * 3], lunch: completeRecipes[index * 3 + 1], dinner: completeRecipes[index * 3 + 2] })), shoppingList: [], preferenceSignature: buildMealPlanPreferenceSignature({ ...restrictions, ...input, uiLanguage: "ar" }) };
      mealPlan.shoppingList = await buildArabicShoppingList(weeklyEntries!, input.pantryItems ?? normalized.canonical.map(name => ({ name })));
      if (mealPlan.shoppingList.some(item => /[A-Za-z]/.test(item))) throw new Error("Arabic shopping-list language validation failed");
      assertSafeMealPlan(mealPlan, restrictions);
    }
    if (Date.now() > deadline) throw new Error("Arabic request deadline exceeded before publication");
    if (!arabicEnabled()) {
      if (reservationId) await releaseFreeAiAction(access, reservationId);
      reservationId = undefined;
      return arabicDisabledResponse();
    }
    const completedAccess = await saveArabicResult({ uid: access.uid, requestId, entries: weeklyEntries ?? [...accepted.values()], displayedRecipes: recipes, ingredients: normalized.original, restrictions, mealPlan, imageActionGrantId, billing: didCallAi ? { access, actionId: reservationId } : undefined });
    if (completedAccess) access = completedAccess;
    reservationId = undefined;
    logger.info("Arabic generation completed", { requestId, mode, returned: recipes.length, invalidCount, modelFailureCount, rejectionCounts, elapsedMs: Date.now() - startedAt });
    return Response.json({ recipes, suggestions, result: JSON.stringify(mealPlan ?? recipes), generationLanguage: "ar", generationStatus: recipes.length < count ? "PARTIAL_RESULTS" : "SUCCESS_DATASET", message: recipes.length < count ? `تم العثور على ${recipes.length} من ${count} وصفات تجتاز الفحوص بالعربية.` : undefined, requestId, access: accessPayload(access) });
  } catch (error) {
    if (access && reservationId) await releaseFreeAiAction(access, reservationId);
    if (!access) return accessErrorResponse(error);
    logger.warn("Arabic workflow failed", { requestId, error: error instanceof Error ? error.message : "unknown" });
    return Response.json({ code: error instanceof ProfileUnavailableError ? "PROFILE_UNAVAILABLE" : "ARABIC_SERVICE_UNAVAILABLE", error: "تعذر إكمال الطلب بالعربية الآن. لم يتم تغيير نتائجك السابقة. حاول مجددًا بعد قليل.", requestId }, { status: 503 });
  }
}
