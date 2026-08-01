import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getIngredientProfileForExactTerm, normalizeIngredientText } from "@/food/IngredientNormalizer";
import type { Recipe } from "@/lib/types";

export type RecipeValidationDecision = "accepted" | "repaired" | "rejected" | "soft_selected" | "soft_dropped";

export interface RecipeValidationTraceEntry {
  finalDecision: RecipeValidationDecision;
  reason: string;
  recipeId: string;
  recipeName: string;
  repairActions: string[];
  repairAttempted: boolean;
  validator: string;
}

export interface RecipePipelineCandidate {
  id: string;
  name: string;
}

export interface RecipePipelineRemoval extends RecipePipelineCandidate {
  reason: string;
}

export interface RecipePipelineStage {
  entered: number;
  enteredRecipes: RecipePipelineCandidate[];
  exited: number;
  exitedRecipes: RecipePipelineCandidate[];
  removed: RecipePipelineRemoval[];
  stage: string;
}

export interface RecipeGenerationTrace {
  gemini: {
    failed: Array<{ attempt: number; phase: string; reason: string }>;
    started: Array<{ attempt: number; phase: string }>;
    succeeded: Array<{ attempt: number; phase: string }>;
  };
  postProcessing: {
    rejected: Array<{ id: string; name: string; reason: string }>;
  };
  response: {
    recipeIds: string[];
    recipeCount: number;
  };
  search: {
    candidatesFound: number;
    compatibleCandidatesFound: number;
    selectedIds: string[];
  };
  recipes: RecipeLifecycleTrace[];
}

export interface RecipeLifecycleTrace {
  geminiStatus: "cached" | "failed" | "not_attempted" | "skipped" | "succeeded";
  imageStatus: "pending_client_hydration" | "ready" | "skipped";
  recipeId: string;
  rejectionReason: string | null;
  repairStatus: "not_needed" | "repaired" | "skipped";
  returnedStatus: "not_returned" | "returned";
  searchScore: number | null;
  selected: boolean;
  title: string;
  validationStatus: "accepted" | "failed" | "not_attempted" | "skipped";
}

export interface RecipeValidationReport {
  requested: number;
  database_found: number;
  after_title_validation: number;
  after_quantity_validation: number;
  after_diversity: number;
  after_quality_gate: number;
  returned: number;
  failure_reason: string | null;
  createdAt: string;
  inputIngredients: string[];
  requestedCount: number;
  requestId: string;
  reportPath?: string;
  firstStageBelowRequested: string | null;
  generationTrace: RecipeGenerationTrace;
  stages: RecipePipelineStage[];
  summary: {
    accepted: number;
    rejected: number;
    repaired: number;
    softSelected: number;
  };
  traces: RecipeValidationTraceEntry[];
}

export interface RecipePipelineReport {
  executionTimeMs: number;
  finalReturnedCount: number;
  inputIngredients: string[];
  reasons: RecipeValidationTraceEntry[];
  recipesLoaded: number;
  recipesMatched: number;
  recipesRanked: number;
  recipesRejected: number;
  recipesRepaired: number;
  requestId: string;
  firstStageBelowRequested: string | null;
  generationTrace: RecipeGenerationTrace;
  stages: RecipePipelineStage[];
}

export interface RecipeRepairContext {
  recipeLanguage: string;
  scoringIngredients: string[];
  /**
   * Source recipes must retain their documented method. The editor pipeline can
   * opt out of synthetic recovery and reject incomplete references instead.
   */
  allowSyntheticFallbacks?: boolean;
}

export interface RecipeRepairResult {
  actions: string[];
  recipe: Recipe;
}

const REPAIRABLE_QUALITY_REASON_PREFIXES = [
  "ingredient_missing_quantity_or_unit",
  "protein_missing_quantity",
  "ingredient_not_used"
];

const REPAIRABLE_QUALITY_REASONS = new Set([
  "duplicate_ingredients",
  "duplicate_instructions",
  "ingredient_only_title",
  "missing_required_fields",
  "title_does_not_describe_recipe"
]);

const BLOCKING_QUALITY_REASONS = new Set([
  "english_leakage_in_arabic",
  "forbidden_arabic_transliteration",
  "missing_ingredients",
  "missing_instructions",
  "implausible_calories",
  "implausible_macros",
  "implausible_sodium"
]);

export function createRecipeValidationReport(input: {
  inputIngredients: string[];
  requestedCount: number;
  requestId: string;
}): RecipeValidationReport {
  return {
    requested: input.requestedCount,
    database_found: 0,
    after_title_validation: 0,
    after_quantity_validation: 0,
    after_diversity: 0,
    after_quality_gate: 0,
    returned: 0,
    failure_reason: null,
    createdAt: new Date().toISOString(),
    inputIngredients: input.inputIngredients,
    requestedCount: input.requestedCount,
    requestId: input.requestId,
    firstStageBelowRequested: null,
    generationTrace: {
      gemini: { failed: [], started: [], succeeded: [] },
      postProcessing: { rejected: [] },
      response: { recipeIds: [], recipeCount: 0 },
      search: { candidatesFound: 0, compatibleCandidatesFound: 0, selectedIds: [] },
      recipes: []
    },
    stages: [],
    summary: {
      accepted: 0,
      rejected: 0,
      repaired: 0,
      softSelected: 0
    },
    traces: []
  };
}

export function recordRecipeLifecycle(
  report: RecipeValidationReport,
  input: Partial<RecipeLifecycleTrace> & { recipeId: string; title: string }
) {
  const existing = report.generationTrace.recipes.find((recipe) => recipe.recipeId === input.recipeId);
  const base: RecipeLifecycleTrace = existing ?? {
    geminiStatus: "not_attempted",
    imageStatus: "pending_client_hydration",
    recipeId: input.recipeId,
    rejectionReason: null,
    repairStatus: "not_needed",
    returnedStatus: "not_returned",
    searchScore: null,
    selected: false,
    title: input.title,
    validationStatus: "not_attempted"
  };
  const next = { ...base, ...input, title: input.title || base.title };
  if (existing) {
    Object.assign(existing, next);
  } else {
    report.generationTrace.recipes.push(next);
  }
}

export function recordRecipeGenerationTrace(
  report: RecipeValidationReport,
  input:
    | { type: "gemini_started"; attempt: number; phase: string }
    | { type: "gemini_succeeded"; attempt: number; phase: string }
    | { type: "gemini_failed"; attempt: number; phase: string; reason: string }
    | { type: "post_rejected"; id: string; name: string; reason: string }
    | { type: "search"; candidatesFound: number; compatibleCandidatesFound?: number; selectedIds: string[] }
    | { type: "response"; recipes: Recipe[] }
) {
  if (input.type === "gemini_started") report.generationTrace.gemini.started.push({ attempt: input.attempt, phase: input.phase });
  if (input.type === "gemini_succeeded") report.generationTrace.gemini.succeeded.push({ attempt: input.attempt, phase: input.phase });
  if (input.type === "gemini_failed") report.generationTrace.gemini.failed.push({ attempt: input.attempt, phase: input.phase, reason: input.reason });
  if (input.type === "post_rejected") {
    report.generationTrace.postProcessing.rejected.push({
      id: input.id,
      name: input.name,
      reason: input.reason
    });
  }
  if (input.type === "search") {
    report.generationTrace.search.candidatesFound = Math.max(
      report.generationTrace.search.candidatesFound,
      input.candidatesFound
    );
    report.generationTrace.search.compatibleCandidatesFound = Math.max(
      report.generationTrace.search.compatibleCandidatesFound,
      input.compatibleCandidatesFound ?? input.candidatesFound
    );
    report.generationTrace.search.selectedIds = Array.from(new Set([
      ...report.generationTrace.search.selectedIds,
      ...input.selectedIds
    ]));
  }
  if (input.type === "response") {
    report.generationTrace.response = {
      recipeCount: input.recipes.length,
      recipeIds: input.recipes.map(readRecipeId)
    };
    input.recipes.forEach((recipe) => {
      recordRecipeLifecycle(report, {
        recipeId: readRecipeId(recipe),
        title: recipe.name,
        returnedStatus: "returned",
        imageStatus: recipe.image_url ? "ready" : "pending_client_hydration"
      });
    });
    const returnedIds = new Set(input.recipes.map(readRecipeId));
    report.generationTrace.recipes
      .filter((recipe) => recipe.selected && !returnedIds.has(recipe.recipeId) && !recipe.rejectionReason)
      .forEach((recipe) => {
        recipe.rejectionReason = "superseded_by_higher_ranked_result";
      });
  }
}

/**
 * Records every candidate transition in the request pipeline. The caller
 * supplies a stage-level reason; safety stages can pass a per-recipe reason.
 */
export function recordRecipePipelineStage(
  report: RecipeValidationReport,
  input: {
    entered: Recipe[];
    exited: Recipe[];
    reason?: string | ((recipe: Recipe) => string);
    stage: string;
  }
) {
  const enteredRecipes = input.entered.map(toPipelineCandidate);
  const exitedRecipes = input.exited.map(toPipelineCandidate);
  const exitedKeys = new Set(input.exited.map(readRecipeId));
  const removed = input.entered
    .filter((recipe) => !exitedKeys.has(readRecipeId(recipe)))
    .map((recipe) => ({
      ...toPipelineCandidate(recipe),
      reason: typeof input.reason === "function" ? input.reason(recipe) : input.reason ?? "not_selected"
    }));

  report.stages.push({
    entered: enteredRecipes.length,
    enteredRecipes,
    exited: exitedRecipes.length,
    exitedRecipes,
    removed,
    stage: input.stage
  });

  if (!report.firstStageBelowRequested && input.exited.length < report.requestedCount) {
    report.firstStageBelowRequested = input.stage;
  }
}

export function updateRecipeValidationFunnel(
  report: RecipeValidationReport,
  updates: Partial<Pick<
    RecipeValidationReport,
    | "after_diversity"
    | "after_quality_gate"
    | "after_quantity_validation"
    | "after_title_validation"
    | "database_found"
    | "failure_reason"
    | "requested"
    | "requestedCount"
    | "returned"
  >>
) {
  Object.assign(report, updates);
}

export function increaseRecipeValidationDatabaseFound(report: RecipeValidationReport, count: number) {
  report.database_found = Math.max(report.database_found, count);
}

export function recordRecipeValidationTrace(
  report: RecipeValidationReport,
  entry: Omit<RecipeValidationTraceEntry, "recipeId" | "recipeName"> & {
    recipe: Recipe;
  }
) {
  report.traces.push({
    finalDecision: entry.finalDecision,
    reason: entry.reason,
    recipeId: readRecipeId(entry.recipe),
    recipeName: entry.recipe.name,
    repairActions: entry.repairActions,
    repairAttempted: entry.repairAttempted,
    validator: entry.validator
  });

  if (entry.finalDecision === "accepted") report.summary.accepted += 1;
  if (entry.finalDecision === "rejected") report.summary.rejected += 1;
  if (entry.finalDecision === "repaired") report.summary.repaired += 1;
  if (entry.finalDecision === "soft_selected") report.summary.softSelected += 1;
}

export async function persistRecipeValidationReport(report: RecipeValidationReport) {
  const reportDirectory = join(tmpdir(), "nutrimoment-recipe-validation", report.requestId);
  const reportPath = join(reportDirectory, "validation_report.json");
  await mkdir(reportDirectory, { recursive: true });
  report.reportPath = reportPath;
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}

export async function persistRecipePipelineReport(
  report: RecipeValidationReport,
  startedAtMs: number
) {
  const reportDirectory = join(tmpdir(), "nutrimoment-recipe-validation", report.requestId);
  const reportPath = join(reportDirectory, "pipeline_report.json");
  const pipelineReport: RecipePipelineReport = {
    executionTimeMs: Date.now() - startedAtMs,
    finalReturnedCount: report.returned,
    inputIngredients: report.inputIngredients,
    reasons: report.traces,
    recipesLoaded: report.database_found,
    recipesMatched: Math.max(report.after_title_validation, report.after_quantity_validation),
    recipesRanked: report.after_diversity,
    recipesRejected: report.summary.rejected,
    recipesRepaired: report.summary.repaired,
    requestId: report.requestId,
    firstStageBelowRequested: report.firstStageBelowRequested,
    generationTrace: report.generationTrace,
    stages: report.stages
  };
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(pipelineReport, null, 2)}\n`, "utf8");
  return { pipelineReport, reportPath };
}

function toPipelineCandidate(recipe: Recipe): RecipePipelineCandidate {
  return {
    id: readRecipeId(recipe),
    name: recipe.name
  };
}

export function repairRecipeForValidation(recipe: Recipe, context: RecipeRepairContext): RecipeRepairResult {
  const actions: string[] = [];
  let repaired: Recipe = { ...recipe };
  const wantsArabic = context.recipeLanguage.toLowerCase() === "arabic";

  const repairedIngredients = repairIngredientList(repaired.ingredients, wantsArabic, actions);
  const repairedMissingIngredients = repairIngredientList(repaired.missing_ingredients, wantsArabic, actions);
  repaired = {
    ...repaired,
    ingredients: repairedIngredients,
    missing_ingredients: repairedMissingIngredients
  };

  if (isIngredientOnlyTitle(repaired.name, [...repaired.ingredients, ...repaired.missing_ingredients])) {
    const recoveredTitle = recoverDishTitle(repaired, context);
    if (recoveredTitle && recoveredTitle !== repaired.name) {
      repaired = { ...repaired, name: recoveredTitle };
      actions.push("recovered_dish_identity_title");
    }
  }

  const dedupedSteps = dedupeStrings(repaired.steps);
  if (dedupedSteps.length !== repaired.steps.length) {
    repaired = { ...repaired, steps: dedupedSteps };
    actions.push("removed_duplicate_steps");
  }

  if (repaired.steps.length < 2 && context.allowSyntheticFallbacks !== false) {
    repaired = { ...repaired, steps: buildFallbackSteps(repaired, wantsArabic) };
    actions.push("estimated_missing_steps");
  }

  const usageRepairedSteps = ensureIngredientsAppearInSteps(repaired, wantsArabic);
  if (usageRepairedSteps.length !== repaired.steps.length) {
    repaired = { ...repaired, steps: usageRepairedSteps };
    actions.push("added_missing_ingredient_usage_step");
  }

  if (!repaired.cook_time?.trim()) {
    repaired = { ...repaired, cook_time: estimateCookTime(repaired, wantsArabic) };
    actions.push("estimated_cooking_time");
  }

  if (!repaired.difficulty?.trim()) {
    repaired = { ...repaired, difficulty: wantsArabic ? "\u0633\u0647\u0644" : "Easy" };
    actions.push("inferred_difficulty");
  }

  if (!Number.isFinite(Number(repaired.calories)) || Number(repaired.calories) < 80 || Number(repaired.calories) > 2500) {
    repaired = { ...repaired, calories: 450 };
    actions.push("estimated_calories");
  }

  if (!readMacro(repaired.protein) || !readMacro(repaired.carbs) || !readMacro(repaired.fat)) {
    repaired = {
      ...repaired,
      protein: repaired.protein || "30g",
      carbs: repaired.carbs || "35g",
      fat: repaired.fat || "18g"
    };
    actions.push("estimated_macros");
  }

  return { actions: Array.from(new Set(actions)), recipe: repaired };
}

export function qualityReasonsAreRepairable(reasons: string[]) {
  return reasons.length > 0 && reasons.every(isRepairableQualityReason);
}

export function qualityReasonsAreBlocking(reasons: string[]) {
  return reasons.some((reason) => BLOCKING_QUALITY_REASONS.has(reason));
}

function isRepairableQualityReason(reason: string) {
  return REPAIRABLE_QUALITY_REASONS.has(reason) ||
    REPAIRABLE_QUALITY_REASON_PREFIXES.some((prefix) => reason.startsWith(prefix));
}

function readRecipeId(recipe: Recipe) {
  return recipe.id ?? recipe.source_recipe_id ?? recipe.dish_identity ?? (slugify(recipe.name) || "unknown_recipe");
}

function repairIngredientList(values: unknown, wantsArabic: boolean, actions: string[]) {
  if (!Array.isArray(values)) return [];
  const repaired = values
    .map((value) => repairIngredient(value, wantsArabic, actions))
    .filter(Boolean);
  const deduped = mergeDuplicateIngredients(repaired);
  if (deduped.length !== repaired.length) actions.push("merged_duplicate_ingredients");
  return deduped;
}

function repairIngredient(value: unknown, wantsArabic: boolean, actions: string[]) {
  const ingredient = readIngredient(value);
  if (!ingredient.label) return "";

  let quantity = ingredient.quantity;
  let unit = ingredient.unit;
  const inference = inferQuantityAndUnit(ingredient.label, wantsArabic);

  if (!quantity) {
    quantity = inference.quantity;
    actions.push("inferred_missing_quantity");
  }
  if (!unit) {
    unit = inference.unit;
    actions.push("inferred_missing_unit");
  }

  return `${quantity} ${unit} ${ingredient.label}`.replace(/\s+/g, " ").trim();
}

function readIngredient(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    const match = trimmed.match(/^(\d+(?:\.\d+)?|\d+\s*\/\s*\d+|half|one|two|three|four|five|six|seven|eight|nine|ten)\s+([a-zA-Z\u0600-\u06FF]+)?\s*(.+)$/u);
    return {
      label: match?.[3]?.trim() || trimmed,
      quantity: match?.[1],
      unit: match?.[2]
    };
  }

  if (value && typeof value === "object") {
    const item = value as { ingredient?: unknown; name?: unknown; quantity?: unknown; unit?: unknown };
    return {
      label: String(item.ingredient ?? item.name ?? "").trim(),
      quantity: item.quantity == null ? undefined : String(item.quantity).trim(),
      unit: typeof item.unit === "string" ? item.unit.trim() : undefined
    };
  }

  return { label: "", quantity: undefined, unit: undefined };
}

function inferQuantityAndUnit(label: string, wantsArabic: boolean) {
  const normalized = normalizeText(label);
  const profile = getIngredientProfileForExactTerm(label);
  const category = profile?.category ?? "";
  if (/\b(chicken breast|breast)\b/i.test(normalized)) return { quantity: "2", unit: wantsArabic ? "\u0642\u0637\u0639" : "pieces" };
  if (category === "protein" || /\b(chicken|beef|liver|fish|shrimp|meat|steak|tofu|turkey|salmon|egg)\b/i.test(normalized)) {
    if (/\b(egg|eggs)\b/i.test(normalized)) return { quantity: "2", unit: wantsArabic ? "\u062d\u0628\u0627\u062a" : "pieces" };
    return { quantity: "1", unit: wantsArabic ? "\u0631\u0637\u0644" : "lb" };
  }
  if (category === "grain" || category === "legume" || /\b(rice|pasta|beans|lentil|oats)\b/i.test(normalized)) {
    return { quantity: "1", unit: wantsArabic ? "\u0643\u0648\u0628" : "cup" };
  }
  if (category === "dairy" || /\b(milk|yogurt|cream|cheese)\b/i.test(normalized)) {
    return { quantity: "1", unit: wantsArabic ? "\u0643\u0648\u0628" : "cup" };
  }
  if (/\b(oil|spice|salt|pepper|cumin|paprika|coriander|garlic powder|onion powder)\b/i.test(normalized)) {
    return { quantity: "1", unit: wantsArabic ? "\u0645\u0644\u0639\u0642\u0629" : "tsp" };
  }
  if (category === "vegetable" || category === "fruit") {
    return { quantity: "1", unit: wantsArabic ? "\u062d\u0628\u0629" : "piece" };
  }
  return { quantity: "1", unit: wantsArabic ? "\u062d\u0635\u0629" : "serving" };
}

function mergeDuplicateIngredients(values: string[]) {
  const merged = new Map<string, string>();
  for (const value of values) {
    const ingredient = readIngredient(value);
    const key = ingredientIdentity(ingredient.label);
    if (!key || !merged.has(key)) {
      merged.set(key || normalizeText(value), value);
    }
  }
  return Array.from(merged.values());
}

function isIngredientOnlyTitle(title: string, ingredients: string[]) {
  const titleKey = ingredientIdentity(title);
  if (!titleKey) return false;
  return ingredients.some((ingredient) => ingredientIdentity(readIngredient(ingredient).label) === titleKey) ||
    Boolean(getIngredientProfileForExactTerm(title));
}

function recoverDishTitle(recipe: Recipe, context: RecipeRepairContext) {
  const dishIdentity = recipe.dish_identity ?? recipe.dish_intent?.dish_name ?? recipe.photo_identity?.english_name;
  if (dishIdentity && !isIngredientOnlyTitle(dishIdentity, recipe.ingredients)) return dishIdentity;

  const primary = readIngredient(recipe.ingredients[0]).label || context.scoringIngredients[0] || recipe.name;
  const method = inferMethod(recipe);
  const cuisine = recipe.cuisine?.trim();
  if (context.recipeLanguage.toLowerCase() === "arabic") {
    const methodLabel = method === "grilled" ? "\u0645\u0634\u0648\u064a" : method === "stewed" ? "\u0645\u0637\u0647\u0648 \u0628\u0627\u0644\u0635\u0648\u0635" : "\u0628\u0637\u0631\u064a\u0642\u0629 \u0645\u0646\u0632\u0644\u064a\u0629";
    return `${primary} ${methodLabel}`.trim();
  }
  const titleMethod = method ? toTitleCase(method.replace(/ed$/, "")) : "Skillet";
  return [cuisine && cuisine !== "Any" ? cuisine : "", toTitleCase(primary), titleMethod].filter(Boolean).join(" ");
}

function buildFallbackSteps(recipe: Recipe, wantsArabic: boolean) {
  const primary = readIngredient(recipe.ingredients[0]).label || recipe.name;
  if (wantsArabic) {
    return [
      `\u062d\u0636\u0631 ${primary} \u0645\u0639 \u0628\u0642\u064a\u0629 \u0627\u0644\u0645\u0643\u0648\u0646\u0627\u062a.`,
      `\u0627\u0637\u0647 ${primary} \u062d\u062a\u0649 \u064a\u0646\u0636\u062c \u062b\u0645 \u0642\u062f\u0645\u0647 \u0633\u0627\u062e\u0646\u0627.`
    ];
  }
  return [
    `Prepare ${primary} with the remaining ingredients.`,
    `Cook ${primary} until done, then serve warm.`
  ];
}

function ensureIngredientsAppearInSteps(recipe: Recipe, wantsArabic: boolean) {
  const stepsText = normalizeText(recipe.steps.join(" "));
  const missing = recipe.ingredients
    .map((ingredient) => readIngredient(ingredient).label)
    .filter((label) => ingredientTokens(label).some((token) => !stepsText.includes(token)))
    .slice(0, 3);
  if (!missing.length) return recipe.steps;
  const step = wantsArabic
    ? `\u0623\u0636\u0641 ${missing.join("\u060c ")} \u0623\u062b\u0646\u0627\u0621 \u0627\u0644\u0637\u0647\u064a \u0648\u0639\u062f\u0644 \u0627\u0644\u062a\u062a\u0628\u064a\u0644.`
    : `Add ${missing.join(", ")} during cooking and adjust the seasoning.`;
  return [...recipe.steps, step];
}

function estimateCookTime(recipe: Recipe, wantsArabic: boolean) {
  const method = inferMethod(recipe);
  const minutes = method === "baked" ? 35 : method === "stewed" ? 45 : method === "grilled" ? 25 : 30;
  return wantsArabic ? `${minutes} \u062f\u0642\u064a\u0642\u0629` : `${minutes} minutes`;
}

function inferMethod(recipe: Recipe) {
  const text = normalizeText([
    recipe.name,
    recipe.dish_intent?.cooking_method,
    ...recipe.steps
  ].filter(Boolean).join(" "));
  if (/\b(grill|grilled|char|skewer)\b/.test(text)) return "grilled";
  if (/\b(bake|baked|roast|roasted|oven)\b/.test(text)) return "baked";
  if (/\b(simmer|stew|braise|braised)\b/.test(text)) return "stewed";
  if (/\b(fry|fried|saute|sauteed|skillet|pan)\b/.test(text)) return "sauteed";
  return "";
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizeText(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ingredientIdentity(value: string) {
  const profile = getIngredientProfileForExactTerm(value);
  if (profile) return profile.id;
  return normalizeIngredientText(value)
    .replace(/\b\d+(?:\.\d+)?\b/g, " ")
    .replace(/\b(?:cup|cups|tbsp|tsp|oz|ounce|ounces|lb|kg|g|gram|grams|can|cans|piece|pieces|serving|servings|whole|large|small|medium)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+/g, "_");
}

function ingredientTokens(value: string) {
  return ingredientIdentity(value)
    .split("_")
    .filter((token) => token.length >= 3)
    .filter((token) => !new Set(["with", "and", "fresh", "dried", "optional"]).has(token));
}

function normalizeText(value: string) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function readMacro(value: string | undefined) {
  const parsed = Number(String(value ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toTitleCase(value: string) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}
