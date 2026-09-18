import { z } from "zod";
import { accessErrorResponse, accessPayload, canUseApiFeature, releaseFreeAiAction, reserveFreeAiAction } from "@/services/authService";
import { loadGenerationRestrictions } from "@/services/generationProfileService";
import { rateLimitedResponse } from "@/services/rateLimitService";
import { applyArabicRateLimit as applyRateLimit } from "./rateLimit";
import { ProfileUnavailableError } from "@/lib/profileSafety";
import { buildMealPlanPreferenceSignature } from "@/lib/mealPlanPreferenceSignature";
import { buildArabicShoppingList } from "./shoppingFacts";
import { assertSafeMealPlan } from "@/lib/generationSafety";
import { logger } from "@/lib/logger";
import type { MealPlanData, Recipe } from "@/lib/types";
import { arabicDisabledResponse, arabicEnabled, ARABIC_REQUEST_BUDGET_MS, ARABIC_READABLE_VERSIONS } from "./config";
import { resolveArabicIngredients } from "./ingredientResolution";
import { listArabicRecipes, saveArabicResult, arabicPaths, readRecentArabicRecipeHistory } from "./repository";
import { arabicLastShownAt, buildArabicRecentRecipes, rotateArabicCandidates, type ArabicRecentRecipes } from "./freshness";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { arabicRecipeSchema, buildArabicEntry, partitionArabicRecipe, revalidateArabicEntry } from "./validation";
import { callArabicModel } from "./gemini";
import { generateArabicFactBatch } from "./factsGemini";
import { generateArabicSourceBatch } from "./sourceCorrections";
import { buildArabicFactsEntry, recipeFactsIdentity, type ArabicLabelReceipt } from "./recipeFacts";
import { findArabicSourceCandidates } from "./sourceCandidates";
import { arabicSourceIsCurrent } from "./sourceEligibility";
import { selectArabicWeeklyMeals, arabicWeeklyMealCounts, arabicWeeklyMealTypes, ARABIC_WEEKLY_MAX_REPEATED_SLOTS } from "./weeklyFacts";
import { arabicFingerprint } from "./fingerprint";
import { buildArabicCuisineGuidance } from "./cuisineGuidance";
import { arabicRepairSchema } from "./modelSchemas";
import type { ArabicRecipeEntry, ArabicRecipeSuggestion } from "./types";
import { arabicCuisineMatches as cuisineMatchesPreference } from "./cuisineGuidance";
import { boundedArabicDiagnostics, type ArabicDishDiagnostic } from "./generationDiagnostics";

const schema = z.object({
  ingredients: z.array(z.string().min(1).max(300)).max(60).optional(),
  pantry: z.array(z.string().min(1).max(300)).max(60).optional(),
  pantryItems: z.array(z.object({ name: z.string().min(1).max(300), quantity: z.string().max(60).optional() })).max(60).optional(),
  recipeCount: z.number().int().min(1).max(10).default(10),
  maxMissingIngredients: z.union([z.number().int().min(0).max(30), z.literal("unlimited")]).default(5),
  preferredCuisine: z.string().max(80).default("Any"), calorieTarget: z.number().min(500).max(6000).default(1650),
  actionId: z.string().regex(/^[\w-]{1,128}$/).optional()
});
type Pair = { candidateId?: string; canonical?: unknown; recipe?: unknown; facts?: unknown; labelReceipt?: ArabicLabelReceipt; safetyReceipt?: string; source?: ArabicRecipeEntry["source"]; variantKey?: string };
const pairsFrom = (value: unknown): Pair[] => {
  const parsed = z.object({ recipes: z.array(z.object({ candidateId: z.string().optional(), canonical: z.unknown().optional(), recipe: z.unknown().optional(), facts: z.unknown().optional(),
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
    if (!raw.length && mode === "recipes") return Response.json({ error: "أضف مكونًا واحدًا على الأقل." }, { status: 400 });
    const normalized = await resolveArabicIngredients(raw, { allowAi: authorization.allowed, deadline: Math.min(deadline, Date.now() + 15000), requestId });
    if (normalized.unclear.length) return Response.json({ code: "INGREDIENT_CLARIFICATION_REQUIRED", error: "يرجى توضيح المكونات المحددة أو كتابة أسمائها بشكل أدق.", items: normalized.unclear }, { status: 422 });
    const allowEmptyPantry = mode === "mealplan" && normalized.canonical.length === 0;
    const variationSeed = input.actionId ?? requestId;
    let recent: ArabicRecentRecipes = { shownAt: new Map(), names: [] }, freshnessUnavailable = false;
    if (mode === "recipes") {
      try { recent = await buildArabicRecentRecipes(await readRecentArabicRecipeHistory(access.uid), normalized.canonical); }
      catch { freshnessUnavailable = true; logger.warn("Arabic freshness history unavailable", { requestId }); }
    }
    const count = mode === "mealplan" ? 21 : input.recipeCount;
    const poolLimit = mode === "mealplan" ? 80 : count;
    const accepted = new Map<string, ArabicRecipeEntry>();
    const needsMore = () => mode === "mealplan" ? !selectArabicWeeklyMeals([...accepted.values()]) : accepted.size < count;
    const identities = new Set<string>();
    const output = new Map<string, Recipe>();
    const recentCandidates = new Map<string, { entry: ArabicRecipeEntry; displayed: Recipe; identity: string }>();
    const backfilledIds = new Set<string>(), aiAcceptedIds = new Set<string>();
    const excludeNames = () => [...new Set([...recent.names, ...[...accepted.values()].flatMap(entry => [entry.canonical.name, entry.recipe.name])])];
    const alternatives = new Map<string, ArabicRecipeSuggestion>();
    const alternativeSources = new Map<string, NonNullable<ArabicRecipeEntry["source"]>>();
    let invalidCount = 0, modelFailureCount = 0;
    let generationRequestFailed = false;
    const dishDiagnostics: ArabicDishDiagnostic[] = [];
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
      const displayed = await partitionArabicRecipe(rebuilt.entry, normalized.canonical, "unlimited", allowEmptyPantry);
      if (!displayed) { recordReasons(["pantry_mismatch"]); return; }
      if (input.maxMissingIngredients !== "unlimited" && displayed.missing_ingredients.length > input.maxMissingIngredients) {
        recordReasons(["missing_ingredient_limit"]);
        // Source eligibility was checked above; suggest only fully validated dishes.
        alternatives.set(entry.id, { name: displayed.name, missingIngredients: displayed.missing_ingredients, maxMissingIngredients: input.maxMissingIngredients });
        if (entry.source) alternativeSources.set(entry.id, entry.source);
        return;
      }
      const identity = entry.facts ? recipeFactsIdentity(entry.facts) : arabicFingerprint({ ingredients: entry.canonical.ingredients.map(value => value.toLowerCase()).sort(), steps: entry.canonical.steps });
      if (identities.has(identity)) { recordReasons(["duplicate_dish"]); return; }
      if (mode === "recipes" && arabicLastShownAt(rebuilt.entry, recent)) {
        if (!recentCandidates.has(identity)) recentCandidates.set(identity, { entry: rebuilt.entry, displayed, identity });
        recordReasons(["recent_recipe"]); return;
      }
      identities.add(identity);
      accepted.set(rebuilt.entry.id, rebuilt.entry); output.set(rebuilt.entry.id, displayed);
    };
    const cached = await listArabicRecipes(normalized.canonical, mode === "recipes" || allowEmptyPantry ? 200 : 50, allowEmptyPantry);
    for (const entry of mode === "recipes" ? rotateArabicCandidates(cached, variationSeed, entry => entry.id) : cached) await consider(entry);
    const failed: Array<Pair & { reasons: string[] }> = [];
    const processPair = async (pair: Pair) => {
      try {
        const validated = pair.facts ? await buildArabicFactsEntry(pair.facts, restrictions, pair.source, pair.labelReceipt, pair.safetyReceipt)
          : await buildArabicEntry(pair.canonical, pair.recipe, restrictions, pair.source);
        if (validated.entry && pair.variantKey) validated.entry.variantKey = pair.variantKey;
        if (validated.entry) {
          const alreadyAccepted = accepted.has(validated.entry.id);
          const before = { ...rejectionCounts };
          await consider(validated.entry);
          if (!alreadyAccepted && accepted.has(validated.entry.id)) aiAcceptedIds.add(validated.entry.id);
          if (pair.candidateId) dishDiagnostics.push({ candidateId: pair.candidateId, name: validated.entry.recipe.name, stage: "publication",
            status: accepted.has(validated.entry.id) ? "accepted" : "rejected",
            issues: Object.keys(rejectionCounts).filter(code => rejectionCounts[code] !== before[code]) });
        }
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
    const references = needsMore() && authorization.allowed ? await findArabicSourceCandidates(normalized.canonical, input.preferredCuisine, restrictions, count,
      mode === "recipes" ? { recentKeys: [...recent.shownAt.keys()], seed: variationSeed } : undefined, allowEmptyPantry) : [];
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
      const consumeBatch = async (generated: Awaited<ReturnType<typeof generateArabicFactBatch>>) => {
        for (const diagnostic of generated.diagnostics ?? []) {
          if (diagnostic.stage) dishDiagnostics.push(diagnostic);
          recordReasons(diagnostic.issues);
          if (diagnostic.status === "rejected" && ["validation", "verification", "generation"].includes(diagnostic.stage)) invalidCount++;
          if (diagnostic.issues.some(code => /unavailable|invalid_manifest_response|invalid_recipe_response/.test(code))) generationRequestFailed = true;
        }
        const pairs = pairsFrom(generated);
        if (!pairs.length && !generated.diagnostics?.length) { modelFailureCount++; generationRequestFailed = true; recordReasons(["empty_or_malformed_model_response"]); }
        for (const pair of pairs) await processPair(pair);
      };
      const base = { ingredients: normalized.canonical, restrictions, cuisine: input.preferredCuisine,
        calorieTarget: input.calorieTarget, missingLimit: input.maxMissingIngredients, allowEmptyPantry };
      const selectedSources = references.slice(0, mode === "mealplan" ? Math.min(21, Math.max(1, count - accepted.size + 2)) : Math.min(3, Math.max(1, count - accepted.size)));
      // Correction and fresh discovery have independent prompts and share only
      // this action/deadline. A slow source must not consume the fresh budget.
      const jobs: Array<{ kind: string; run: Promise<Awaited<ReturnType<typeof generateArabicFactBatch>>> }> = [];
      if (deadline - Date.now() >= 39000) {
        for (let start = 0; start < selectedSources.length; start += 7) {
          const batch = selectedSources.slice(start, start + 7);
          jobs.push({ kind: "source_correction_failed", run: generateArabicSourceBatch({ ...base,
            count: batch.length, sourceOnly: true, references: batch, excludeNames: excludeNames() }, deadline - 5000, requestId) });
        }
        const freshExclusions = [...excludeNames(), ...selectedSources.map(item => item.reference.title)];
        if (mode === "mealplan") {
          for (const type of ["breakfast", "lunch", "dinner"]) jobs.push({ kind: "weekly_batch_failed", run: generateArabicFactBatch({ ...base,
            count: 7, excludeNames: freshExclusions, mealTypesNeeded: [type] }, deadline - 5000, requestId) });
          // Mixed catalog/discovery prompts can omit the unnamed slots. Give
          // new dish discovery its own bounded batch, excluding planned dishes.
          const guidance = await buildArabicCuisineGuidance(base.cuisine, base.ingredients, restrictions, allowEmptyPantry);
          const coverage = arabicWeeklyMealCounts([...accepted.values()]);
          const missingTypes = arabicWeeklyMealTypes.filter(type => coverage[type] < 7);
          jobs.push({ kind: "weekly_discovery_failed", run: generateArabicFactBatch({ ...base, discoveryOnly: true,
            count: Math.min(7, Math.max(1, 21 - accepted.size + 2)),
            excludeNames: [...freshExclusions, ...guidance.flatMap(dish => [dish.name, dish.nativeName]).filter(Boolean)],
            mealTypesNeeded: missingTypes.length ? missingTypes : [...arabicWeeklyMealTypes], variationSeed: `${variationSeed}:weekly-discovery` }, deadline - 5000, requestId) });
        } else {
          jobs.push({ kind: "generation_request_failed", run: generateArabicFactBatch({ ...base,
            count: Math.min(7, Math.max(1, count - accepted.size - selectedSources.length)), excludeNames: freshExclusions,
            variationSeed: `${variationSeed}:0` }, deadline - 5000, requestId) });
        }
      } else {
        generationRequestFailed = true; recordReasons(["insufficient_generation_time"]);
        dishDiagnostics.push({ stage: "generation", status: "rejected", issues: ["insufficient_generation_time"] });
      }
      didCallAi = jobs.length > 0;
      const completed = await Promise.allSettled(jobs.map(job => job.run));
      for (const [index, result] of completed.entries()) {
        if (result.status === "fulfilled") await consumeBatch(result.value);
        else {
          modelFailureCount++;
          const kind = jobs[index].kind;
          if (kind !== "source_correction_failed") generationRequestFailed = true;
          recordReasons([kind]); dishDiagnostics.push({ stage: "generation", status: "rejected", issues: [kind] });
        }
      }
      // Complete shortages before the same <=10% repeat fallback used by the
      // English workflow. Keep one action reservation and the original deadline.
      if (mode === "mealplan" && aiAcceptedIds.size > 0
        && !selectArabicWeeklyMeals([...accepted.values()], { allowLimitedRepeats: true }) && deadline - Date.now() >= 39000) {
        const counts = arabicWeeklyMealCounts([...accepted.values()]);
        const missingTypes = arabicWeeklyMealTypes.filter(type => counts[type] < 7);
        try {
          await consumeBatch(await generateArabicFactBatch({ ...base, count: Math.min(7, Math.max(1, 21 - accepted.size)),
            excludeNames: [...excludeNames(), ...dishDiagnostics.flatMap(item => item.name ? [item.name] : [])],
            mealTypesNeeded: missingTypes.length ? missingTypes : [...arabicWeeklyMealTypes],
            variationSeed: `${variationSeed}:weekly-top-up` }, deadline - 5000, requestId));
        } catch { modelFailureCount++; generationRequestFailed = true; recordReasons(["weekly_top_up_failed"]); }
      }
      // One bounded top-up only after a productive first pass. Exclude every
      // attempted family so a rejected dish is not retried under another ID.
      if (mode === "recipes" && aiAcceptedIds.size > 0 && accepted.size < count && deadline - Date.now() >= 39000) {
        try {
          const attempted = dishDiagnostics.flatMap(item => item.name ? [item.name] : []);
          await consumeBatch(await generateArabicFactBatch({ ...base, count: Math.min(7, count - accepted.size),
            excludeNames: [...excludeNames(), ...attempted], variationSeed: `${variationSeed}:1`,
            previousShortages: [...alternatives.values()].slice(-10).map(item => ({ name: item.name, missingIngredients: item.missingIngredients })) }, deadline - 5000, requestId));
        } catch { modelFailureCount++; generationRequestFailed = true; recordReasons(["generation_request_failed"]); }
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
            if (validated.entry) {
              const alreadyAccepted = accepted.has(validated.entry.id);
              await consider(validated.entry);
              if (!alreadyAccepted && accepted.has(validated.entry.id)) aiAcceptedIds.add(validated.entry.id);
            }
            else recordReasons(validated.reasons);
          }
        } catch { modelFailureCount++; recordReasons(["repair_request_failed"]); }
      }
    }
    // Recheck source eligibility immediately before any Arabic publication.
    for (const [id, entry] of accepted) if (entry.source) {
      if (!await arabicSourceIsCurrent(entry.source)) { accepted.delete(id); output.delete(id); }
    }
    // Only after fresh cache/source/AI selection, fill remaining slots with
    // currently safe recent dishes. Prefer those shown least recently.
    if (mode === "recipes") {
      const fallback = rotateArabicCandidates([...recentCandidates.values()], variationSeed, item => item.entry.id)
        .sort((a, b) => arabicLastShownAt(a.entry, recent) - arabicLastShownAt(b.entry, recent));
      for (const { entry, displayed, identity } of fallback) {
        if (accepted.size >= count) break;
        if (identities.has(identity) || (entry.source && !await arabicSourceIsCurrent(entry.source))) continue;
        identities.add(identity); accepted.set(entry.id, entry); output.set(entry.id, displayed); backfilledIds.add(entry.id);
      }
      if (reservationId && ![...accepted.keys()].some(id => aiAcceptedIds.has(id))) {
        await releaseFreeAiAction(access, reservationId); reservationId = undefined; imageActionGrantId = undefined; didCallAi = false;
      }
      for (const [id, recipe] of output) output.set(id, { ...recipe, freshness_origin: freshnessUnavailable ? undefined : backfilledIds.has(id) ? "backfilled_recent" : "fresh" });
    }
    const weeklyEntries = mode === "mealplan" ? selectArabicWeeklyMeals([...accepted.values()], { allowLimitedRepeats: true }) : null;
    if (weeklyEntries && reservationId && !weeklyEntries.some(entry => aiAcceptedIds.has(entry.id))) {
      await releaseFreeAiAction(access, reservationId); reservationId = undefined; imageActionGrantId = undefined; didCallAi = false;
    }
    const uniqueWeeklyCount = weeklyEntries ? new Set(weeklyEntries.map(entry => entry.id)).size : 0;
    const repeatFallback = weeklyEntries && uniqueWeeklyCount < 21
      ? { maxRepeatedSlots: ARABIC_WEEKLY_MAX_REPEATED_SLOTS, repeatedSlots: 21 - uniqueWeeklyCount, uniqueMealCount: uniqueWeeklyCount } : undefined;
    const recipes = (weeklyEntries ? weeklyEntries.map(entry => output.get(entry.id)!) : [...output.values()]).map(recipe => imageActionGrantId ? { ...recipe, image_action_grant_id: imageActionGrantId } : recipe);
    for (const [id, entry] of alternativeSources) if (!await arabicSourceIsCurrent(entry)) alternatives.delete(id);
    const suggestions = [...alternatives.entries()]
      .sort(([aId, a], [bId, b]) => a.missingIngredients.length - b.missingIngredients.length
        || Number(alternativeSources.has(bId)) - Number(alternativeSources.has(aId)))
      .slice(0, 3).map(([, suggestion]) => suggestion);
    if (!recipes.length || (mode === "mealplan" && !weeklyEntries)) {
      if (reservationId) { await releaseFreeAiAction(access, reservationId); reservationId = undefined; }
      logger.warn("Arabic generation produced insufficient validated results", { requestId, mode, returned: recipes.length, invalidCount, modelFailureCount, rejectionCounts, diagnostics: boundedArabicDiagnostics(dishDiagnostics) });
      if (mode === "mealplan" && recipes.length) {
        const coverage = arabicWeeklyMealCounts([...accepted.values()]);
        return Response.json({ code: "ARABIC_WEEKLY_PLAN_INCOMPLETE", validatedRecipeCount: accepted.size, mealTypeCounts: coverage,
          error: `توفر ${accepted.size} وصفة تجتاز الفحوص، لكن توزيعها لا يكفي لإكمال 21 وجبة مع تكرار وجبتين فقط كحد أقصى (أقل من 10٪). المتاح للفطور: ${coverage.breakfast}، والغداء: ${coverage.lunch}، والعشاء: ${coverage.dinner}. جرّب مكونات إضافية أو مطبخًا آخر أو أعد المحاولة. لم يتم خصم رصيد أو تغيير خطتك السابقة.`,
          recipes: [], suggestions, generationLanguage: "ar", requestId }, { status: 503 });
      }
      const failureCode = suggestions.length ? "ARABIC_RESULTS_UNAVAILABLE" : generationRequestFailed ? "ARABIC_AI_UNAVAILABLE" : invalidCount ? "ARABIC_VALIDATION_FAILED" : modelFailureCount ? "ARABIC_AI_UNAVAILABLE" : "ARABIC_RESULTS_UNAVAILABLE";
      if (authorization.allowed && failureCode !== "ARABIC_RESULTS_UNAVAILABLE") {
        const reason = failureCode === "ARABIC_VALIDATION_FAILED"
          ? "تعذر التحقق من دقة الوصفات العربية التي تم توليدها، لذلك لم نعرضها. هذه مشكلة في نتيجة التوليد وليست في اشتراكك."
          : "تعذر إكمال توليد الوصفات بالعربية الآن بسبب مشكلة في خدمة التوليد. اشتراكك يتيح التوليد.";
        return Response.json({ code: failureCode, error: reason + " حاول مجددًا أو بدّل إلى الإنجليزية. لم يتم خصم رصيد، ونتائجك السابقة محفوظة.", recipes: [], suggestions, generationLanguage: "ar", requestId }, { status: 503 });
      }
      const shortage = !authorization.allowed
        ? " تتوفر الوصفات العربية المحفوظة فقط لأن رصيد التوليد غير متاح. لم يتم استخدام رصيد إضافي."
        : input.maxMissingIngredients === "unlimited"
          ? " لا يوجد حد لعدد المكونات الناقصة. تبقى قيودك الغذائية مطبقة؛ جرّب مكونات أخرى أو مطبخًا آخر."
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
    const completedAccess = await saveArabicResult({ uid: access.uid, requestId, entries: weeklyEntries ? [...new Map(weeklyEntries.map(entry => [entry.id, entry])).values()] : [...accepted.values()], displayedRecipes: recipes, ingredients: normalized.original, canonicalIngredients: normalized.canonical, restrictions, mealPlan, imageActionGrantId, generationDiagnostics: boundedArabicDiagnostics(dishDiagnostics), billing: didCallAi ? { access, actionId: reservationId } : undefined });
    if (completedAccess) access = completedAccess;
    reservationId = undefined;
    logger.info("Arabic generation completed", { requestId, mode, returned: recipes.length, invalidCount, modelFailureCount, rejectionCounts, diagnostics: boundedArabicDiagnostics(dishDiagnostics), elapsedMs: Date.now() - startedAt });
    const backfilledCount = backfilledIds.size, freshCount = recipes.length - backfilledCount;
    const refreshFailure = invalidCount ? "بعض الوصفات الجديدة لم تجتز فحص الدقة والتحضير، لذلك لم نعرضها."
      : generationRequestFailed || modelFailureCount ? "تعذر إكمال توليد بعض الوصفات الجديدة الآن." : undefined;
    const message = repeatFallback ? `أكملنا الأسبوع بتكرار ${repeatFallback.repeatedSlots} من الوجبات المتحقق منها، بما لا يتجاوز 10٪ من أصل 21 وجبة. تضم الخطة ${repeatFallback.uniqueMealCount} وصفة مختلفة، والتكرار في أيام مختلفة.`
      : refreshFailure && (backfilledCount || recipes.length < count)
      ? `${refreshFailure} عرضنا ${recipes.length} وصفات محفوظة أو تحقّقنا منها، منها ${backfilledCount} شاهدتها سابقًا. يمكنك المحاولة مجددًا؛ قيودك الغذائية ما زالت مطبقة.`
      : freshnessUnavailable ? "تعذر التحقق من السجل الآن. هذه وصفات مطابقة لإعداداتك، وقد تتضمن وصفات شاهدتها سابقًا."
      : backfilledCount ? `وجدنا ${freshCount} وصفات جديدة، وأكملنا النتائج بـ ${backfilledCount} وصفات شاهدتها خلال آخر 24 ساعة لعدم توفر خيارات جديدة كافية. ما زالت جميعها تطابق مكوناتك وقيودك الغذائية.`
      : recipes.length < count ? `تم العثور على ${recipes.length} من ${count} وصفات تجتاز الفحوص بالعربية.` : undefined;
    return Response.json({ recipes, suggestions, result: JSON.stringify(mealPlan ?? recipes), generationLanguage: "ar", generationStatus: recipes.length < count || backfilledCount || freshnessUnavailable ? "PARTIAL_RESULTS" : "SUCCESS_DATASET", message,
      ...(mode === "recipes" ? { freshCount: freshnessUnavailable ? undefined : freshCount, backfilledCount, freshnessUnavailable } : { repeatFallback }), requestId, access: accessPayload(access) });
  } catch (error) {
    if (access && reservationId) await releaseFreeAiAction(access, reservationId);
    if (!access) return accessErrorResponse(error);
    logger.warn("Arabic workflow failed", { requestId, error: error instanceof Error ? error.message : "unknown" });
    return Response.json({ code: error instanceof ProfileUnavailableError ? "PROFILE_UNAVAILABLE" : "ARABIC_SERVICE_UNAVAILABLE", error: "تعذر إكمال الطلب بالعربية الآن. لم يتم تغيير نتائجك السابقة. حاول مجددًا بعد قليل.", requestId }, { status: 503 });
  }
}
