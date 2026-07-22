import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { config as loadEnv } from "dotenv";
import { PromptBuilder } from "../src/ai/PromptBuilder";
import { adaptRecipeForHealthConditions, findRecipeHealthViolation } from "../src/lib/healthEnforcement";
import { normalizeIngredients } from "../src/services/ingredientNormalizationService";
import type { Recipe } from "../src/lib/types";
import type { RecipeReferencePromptRecipe } from "../src/lib/recipeReferenceTypes";

loadEnv({ path: path.join(process.cwd(), ".env.local") });

const OUTPUT_DIR = path.join(process.cwd(), ".generated");
const REPORT_JSON_PATH = path.join(OUTPUT_DIR, "premium-italian-chicken-health-trace.json");
const REPORT_HTML_PATH = path.join(OUTPUT_DIR, "premium-italian-chicken-health-trace.html");
const conditions = ["cholesterol", "highBloodPressure", "diabetes"];

function escapeHtml(value: unknown) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseModelResponse(rawResponse: string, extractJson: (text: string) => string): unknown {
  try {
    return JSON.parse(extractJson(rawResponse));
  } catch {
    return { parseError: "Gemini did not return valid JSON.", extracted: extractJson(rawResponse) };
  }
}

function readRecipes(payload: unknown): Recipe[] {
  const normalize = (recipes: unknown[]) =>
    recipes
      .filter((recipe): recipe is Record<string, unknown> => Boolean(recipe) && typeof recipe === "object")
      .map((recipe) => ({
        ...recipe,
        ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients.filter((item): item is string => typeof item === "string") : [],
        missing_ingredients: Array.isArray(recipe.missing_ingredients)
          ? recipe.missing_ingredients.filter((item): item is string => typeof item === "string")
          : [],
        steps: Array.isArray(recipe.steps) ? recipe.steps.filter((item): item is string => typeof item === "string") : []
      }) as Recipe);

  if (Array.isArray(payload)) return normalize(payload);
  if (payload && typeof payload === "object" && Array.isArray((payload as { recipes?: unknown }).recipes)) {
    return normalize((payload as { recipes: unknown[] }).recipes);
  }
  return [];
}

function getArabicLocalizationChecks(recipes: Recipe[]) {
  const latinPattern = /[A-Za-z]/;
  const forbiddenTransliterations = ["باد كرا باو", "دومبلنجس", "ستير فراي", "جرافي", "كاشاتوري", "كراباو"];

  return recipes.map((recipe, index) => {
    const userFacingText = [recipe.name, recipe.cuisine, ...(recipe.ingredients ?? []), ...(recipe.missing_ingredients ?? []), ...(recipe.steps ?? [])].join(" ");
    const localizedArabic = recipe.localized?.Arabic;
    const localizedText = localizedArabic
      ? [localizedArabic.name, localizedArabic.cuisine, ...(localizedArabic.ingredients ?? []), ...(localizedArabic.missing_ingredients ?? []), ...(localizedArabic.steps ?? [])].join(" ")
      : "";
    const combinedText = `${userFacingText} ${localizedText}`;

    return {
      card: index + 1,
      title: recipe.name,
      hasArabicCharacters: /[\u0600-\u06FF]/u.test(combinedText),
      hasLatinCharactersInArabicFields: latinPattern.test(userFacingText),
      forbiddenTransliterations: forbiddenTransliterations.filter((term) => combinedText.includes(term)),
      localizedArabicPresent: Boolean(localizedArabic)
    };
  });
}

function createHtml(report: Record<string, unknown>) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>NutriMoment Premium Recipe Trace</title>
<style>
  @page { size: A4; margin: 13mm; }
  body { font-family: Arial, sans-serif; color: #12251f; line-height: 1.45; font-size: 10pt; }
  h1 { color: #064e3b; margin: 0 0 4px; } h2 { color: #075e54; margin-top: 24px; border-bottom: 1px solid #93b6a7; padding-bottom: 4px; }
  h3 { color: #245b4b; margin: 16px 0 6px; } .note { background: #edf7f3; border-left: 4px solid #16a085; padding: 10px; }
  .warning { background: #fff7e6; border-left: 4px solid #d68b00; padding: 10px; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #f5f8f6; border: 1px solid #d6e2dc; border-radius: 4px; padding: 8px; font: 7.7pt Consolas, monospace; }
  table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #d6e2dc; padding: 6px; text-align: left; vertical-align: top; }
  th { background: #edf7f3; } .pass { color: #0a6b48; font-weight: bold; } .fail { color: #a52b20; font-weight: bold; }
  .rtl { direction: rtl; text-align: right; font-family: Tahoma, Arial, sans-serif; }
</style></head><body>
<h1>NutriMoment Premium Recipe Generation Trace</h1>
<p>Created: ${escapeHtml(report.createdAt)}</p>
<div class="note">This is a direct premium-path model trace. It uses the production PromptBuilder, Gemini transport, and the same health-condition keys as the API. It does not impersonate a signed-in Firebase user, does not write history, and does not request recipe images.</div>

<h2>Test Input</h2><pre>${escapeHtml(JSON.stringify(report.testInput, null, 2))}</pre>

<h2>Free and Premium Workflow</h2>
<table><tr><th>Stage</th><th>Free user</th><th>Premium user</th></tr>
<tr><td>Manual ingredients</td><td>Allowed while lifetime AI credits remain; otherwise shared/offline fallback.</td><td>Allowed without free-credit consumption.</td></tr>
<tr><td>Fridge image / reference image</td><td>Blocked for recipe generation; manual entry remains available.</td><td>Allowed, subject to authentication and rate limits.</td></tr>
<tr><td>Recipe source</td><td>Reference library first; Gemini can run while trial credits remain; Google grounding is enabled if references are unavailable.</td><td>Reference library first; Gemini runs; Google grounding is enabled if references are unavailable.</td></tr>
<tr><td>Recipe image</td><td>Firestore cache and provider search fallback; no Replicate generation.</td><td>Firestore cache first; Replicate generation on a cache miss when allowed by daily cap, then search fallback.</td></tr>
<tr><td>Weekly meal plan</td><td>Currently rejected by the live route as premium-only.</td><td>Allowed.</td></tr>
</table>

<h2>Source Reference Lookup</h2><pre>${escapeHtml(JSON.stringify(report.referenceLookup, null, 2))}</pre>
<h2>Exact Prompt Sent to Gemini</h2><pre>${escapeHtml(report.prompt)}</pre>
<h2>Gemini Request</h2><pre>${escapeHtml(JSON.stringify(report.geminiRequest, null, 2))}</pre>
<h2>Raw Gemini Response Before Route Filtering</h2><pre class="rtl">${escapeHtml(report.rawResponse ?? report.error ?? "No model response.")}</pre>
<h2>Parsed Cards Before Route Filtering</h2><pre class="rtl">${escapeHtml(JSON.stringify(report.parsedResponse, null, 2))}</pre>
<h2>Deterministic Health and Localization Checks</h2><pre class="rtl">${escapeHtml(JSON.stringify(report.validations, null, 2))}</pre>
<h2>Reduced-Load Localization Control</h2>
<div class="warning">This control runs only because the exact ten-card production request timed out. It uses the same PromptBuilder and Gemini Lite model with one local reference and one requested card. It verifies model response and Arabic localization at a practical per-card payload; it is not a substitute for the production ten-card result.</div>
<pre class="rtl">${escapeHtml(JSON.stringify(report.reducedLoadControl ?? { skipped: true }, null, 2))}</pre>
<div class="warning">A pass here validates the raw model output and deterministic health checks only. The production route performs additional normalization, duplicate removal, cuisine filtering, history avoidance, cache persistence, image selection, and response shaping.</div>
</body></html>`;
}

async function main() {
  const { callOpenAIText, extractJson } = await import("../src/lib/openai");
  const { findRecipeReferencesForGeneration, mapRecipeReferencesToRecipes } = await import("../src/services/recipeReferenceService");
  const rawIngredients = ["chicken"];
  const normalized = await normalizeIngredients(rawIngredients);
  let references: RecipeReferencePromptRecipe[] = [];
  let referenceLookupError: string | undefined;

  try {
    references = await findRecipeReferencesForGeneration({
      ingredients: normalized.normalized,
      preferredCuisine: "Italian",
      maxReferences: 20,
      variationSeed: "premium-italian-chicken-health-report"
    });
  } catch (error) {
    referenceLookupError = error instanceof Error ? error.message : String(error);
  }

  const prompt = PromptBuilder.recipeGeneration(
    normalized.normalized.map((name) => ({ name })),
    {
      recipeLanguage: "Arabic",
      preferredCuisine: "Italian",
      calorieTarget: 1800,
      maxMissingIngredients: 7,
      recipeCount: 10,
      diets: [],
      conditions,
      allergens: [],
      excludedIngredients: [],
      candidateDishHints: "",
      canonicalDishHint: "",
      recentRecipeAvoidance: "",
      variationSeed: "premium-italian-chicken-health-report",
      recipeReferences: references
    }
  );

  const groundingEnabled = references.length === 0;
  const model = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash-lite";
  const startedAt = Date.now();
  let rawResponse: string | undefined;
  let error: string | undefined;

  try {
    rawResponse = await callOpenAIText(
      prompt,
      model,
      { feature: "premium_recipe_report", phase: "italian_chicken_health", requestId: `report-${Date.now()}` },
      {
        groundWithGoogleSearch: groundingEnabled,
        temperature: 0.35,
        topP: 0.8,
        systemInstruction: PromptBuilder.recipeEditorSystemPrompt("Arabic")
      }
    );
  } catch (caught) {
    error = caught instanceof Error ? caught.stack || caught.message : String(caught);
  }

  const parsedResponse = rawResponse ? parseModelResponse(rawResponse, extractJson) : { unavailable: true };
  const recipes = readRecipes(parsedResponse);
  const healthAdaptedPreview = recipes.map((recipe) => adaptRecipeForHealthConditions(recipe, conditions));
  let reducedLoadControl: Record<string, unknown> | undefined;

  if (error && references.length > 0) {
    const controlPrompt = PromptBuilder.recipeGeneration(
      normalized.normalized.map((name) => ({ name })),
      {
        recipeLanguage: "Arabic",
        preferredCuisine: "Italian",
        calorieTarget: 1800,
        maxMissingIngredients: 7,
        recipeCount: 1,
        diets: [],
        conditions,
        allergens: [],
        excludedIngredients: [],
        candidateDishHints: "",
        canonicalDishHint: "",
        recentRecipeAvoidance: "",
        variationSeed: "premium-italian-chicken-health-report-control",
        recipeReferences: references.slice(0, 1)
      }
    );
    const controlStartedAt = Date.now();
    let controlRawResponse: string | undefined;
    let controlError: string | undefined;
    try {
      controlRawResponse = await callOpenAIText(
        controlPrompt,
        model,
        { feature: "premium_recipe_report", phase: "reduced_load_localization_control", requestId: `report-control-${Date.now()}` },
        {
          groundWithGoogleSearch: false,
          temperature: 0.35,
          topP: 0.8,
          systemInstruction: PromptBuilder.recipeEditorSystemPrompt("Arabic")
        }
      );
    } catch (caught) {
      controlError = caught instanceof Error ? caught.stack || caught.message : String(caught);
    }
    const controlParsedResponse = controlRawResponse
      ? parseModelResponse(controlRawResponse, extractJson)
      : { unavailable: true };
    const controlRecipes = readRecipes(controlParsedResponse);
    reducedLoadControl = {
      model,
      promptCharacterCount: controlPrompt.length,
      elapsedMs: Date.now() - controlStartedAt,
      rawResponse: controlRawResponse,
      parsedResponse: controlParsedResponse,
      receivedRecipeCount: controlRecipes.length,
      healthViolationsBeforeDeterministicAdaptation: controlRecipes.map((recipe, index) => ({
        card: index + 1,
        title: recipe.name,
        violation: findRecipeHealthViolation(recipe, conditions)
      })),
      healthViolationsAfterDeterministicAdaptation: controlRecipes.map((recipe, index) => ({
        card: index + 1,
        title: recipe.name,
        violation: findRecipeHealthViolation(adaptRecipeForHealthConditions(recipe, conditions), conditions)
      })),
      arabicLocalization: getArabicLocalizationChecks(controlRecipes),
      error: controlError
    };
  }
  const report = {
    createdAt: new Date().toISOString(),
    testInput: {
      tier: "premium simulation",
      ingredients: rawIngredients,
      normalizedIngredients: normalized.normalized,
      preferredCuisine: "Italian",
      conditions,
      language: "Arabic",
      requestedRecipeCount: 10,
      calorieTarget: 1800
    },
    referenceLookup: {
      count: references.length,
      groundedWithGoogleSearch: groundingEnabled,
      error: referenceLookupError,
      recipes: mapRecipeReferencesToRecipes(references.slice(0, 10), { calorieTarget: 1800, recipeLanguage: "Arabic" })
    },
    prompt,
    geminiRequest: { model, groundingEnabled, temperature: 0.35, topP: 0.8, elapsedMs: Date.now() - startedAt },
    rawResponse,
    parsedResponse,
    validations: {
      receivedRecipeCount: recipes.length,
      healthViolationsBeforeDeterministicAdaptation: recipes.map((recipe, index) => ({ card: index + 1, title: recipe.name, violation: findRecipeHealthViolation(recipe, conditions) })),
      healthViolationsAfterDeterministicAdaptation: healthAdaptedPreview.map((recipe, index) => ({ card: index + 1, title: recipe.name, violation: findRecipeHealthViolation(recipe, conditions) })),
      arabicLocalization: getArabicLocalizationChecks(recipes)
    },
    reducedLoadControl,
    error
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(REPORT_JSON_PATH, JSON.stringify(report, null, 2), "utf8");
  await writeFile(REPORT_HTML_PATH, createHtml(report), "utf8");
  console.log(JSON.stringify({ reportJson: REPORT_JSON_PATH, reportHtml: REPORT_HTML_PATH, error }, null, 2));
}

void main();
