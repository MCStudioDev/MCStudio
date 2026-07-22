import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { config as loadEnv } from "dotenv";
import { buildRecipeGenerationPrompt } from "../src/ai/PromptBuilder";
import { callOpenAIText, extractJson } from "../src/lib/openai";
import { normalizeIngredients } from "../src/services/ingredientNormalizationService";
import {
  findRecipeReferencesForGeneration,
  mapRecipeReferencesToRecipes
} from "../src/services/recipeReferenceService";
import type { RecipeReferencePromptRecipe } from "../src/lib/recipeReferenceTypes";

loadEnv({ path: path.join(process.cwd(), ".env.local") });

const RAW_INGREDIENTS = ["فراخ", "فلفل", "عيش", "بصل", "زبادي"];
const CUISINES = ["Egyptian", "Turkish"] as const;
const OUTPUT_DIR = path.join(process.cwd(), ".generated");
const REPORT_JSON_PATH = path.join(OUTPUT_DIR, "recipe-generation-trace.json");
const REPORT_HTML_PATH = path.join(OUTPUT_DIR, "recipe-generation-trace.html");

type TraceRun = {
  cuisine: string;
  references: unknown[];
  referenceLookupError?: string;
  prompt: string;
  request: {
    model: string;
    groundingEnabled: boolean;
    recipeCount: number;
  };
  elapsedMs: number;
  rawResponse?: string;
  parsedBeforeFiltering?: unknown;
  error?: string;
};

function escapeHtml(value: unknown) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function parseRawResponse(raw: string): unknown {
  const extracted = extractJson(raw);
  try {
    return JSON.parse(extracted);
  } catch {
    return { parseError: "Gemini did not return valid JSON.", extractedJson: extracted };
  }
}

function buildHtml(report: Record<string, unknown>) {
  const runs = report.runs as TraceRun[];
  const normalized = report.normalizedIngredients;
  const runSections = runs.map((run) => `
    <section>
      <h2>${escapeHtml(run.cuisine)} trace</h2>
      <p><strong>API result:</strong> ${run.error ? "Failed" : "Succeeded"} in ${run.elapsedMs} ms.</p>
      <p><strong>Model:</strong> ${escapeHtml(run.request.model)}. <strong>Google grounding:</strong> ${run.request.groundingEnabled ? "enabled (no local references)" : "disabled (local references found)"}.</p>
      ${run.error ? `<pre class="error">${escapeHtml(run.error)}</pre>` : ""}
      <h3>Local recipe references retrieved before Gemini</h3>
      ${run.referenceLookupError ? `<pre class="error">Reference lookup failed: ${escapeHtml(run.referenceLookupError)}</pre>` : ""}
      <pre>${escapeHtml(toJson(run.references))}</pre>
      <h3>Exact prompt sent to Gemini</h3>
      <pre>${escapeHtml(run.prompt)}</pre>
      <h3>Raw Gemini response before all application filters</h3>
      <pre>${escapeHtml(run.rawResponse ?? "No response because the API request failed.")}</pre>
      <h3>Parsed card objects before all application filters</h3>
      <pre>${escapeHtml(toJson(run.parsedBeforeFiltering ?? { unavailable: true }))}</pre>
    </section>
  `).join("\n");

  return `<!doctype html>
  <html lang="en"><head><meta charset="utf-8" />
  <title>NutriMoment Raw Recipe Generation Trace</title>
  <style>
    @page { size: A4; margin: 14mm; }
    body { font-family: Arial, sans-serif; color: #14231f; line-height: 1.45; font-size: 10pt; }
    h1 { color: #064e3b; margin-bottom: 4px; } h2 { color: #075e54; margin-top: 26px; border-bottom: 1px solid #8fb7a8; padding-bottom: 4px; }
    h3 { color: #334e45; margin-top: 18px; } .note { background: #edf7f3; border-left: 4px solid #16a085; padding: 10px; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #f6f8f7; border: 1px solid #d7e2dd; border-radius: 4px; padding: 9px; font-family: Consolas, monospace; font-size: 7.7pt; }
    .error { background: #fff1f0; border-color: #e5aaa5; color: #8b1f1b; }
    section { break-before: page; } section:first-of-type { break-before: auto; }
  </style></head><body>
    <h1>NutriMoment Raw Recipe Generation Trace</h1>
    <p><strong>Created:</strong> ${escapeHtml(report.createdAt)}<br />
      <strong>User pantry:</strong> ${escapeHtml((report.rawIngredients as string[]).join(" | "))}<br />
      <strong>Normalized pantry:</strong> ${escapeHtml(toJson(normalized))}</p>
    <p class="note">This is a direct execution trace. The two prompts and raw Gemini outputs below are captured before the route's validation, source-preservation, health/diet enforcement, image selection, repeat exclusion, and final card filtering. A failed request is reported as failed; this document never substitutes invented cards.</p>
    ${runSections}
  </body></html>`;
}

async function runTrace(cuisine: (typeof CUISINES)[number], normalizedIngredients: string[]): Promise<TraceRun> {
  let references: RecipeReferencePromptRecipe[] = [];
  let referenceLookupError: string | undefined;
  try {
    references = await findRecipeReferencesForGeneration({
      ingredients: normalizedIngredients,
      preferredCuisine: cuisine,
      maxReferences: 20,
      variationSeed: `manual-pdf-trace-${cuisine.toLowerCase()}`
    });
  } catch (error) {
    referenceLookupError = error instanceof Error ? error.message : String(error);
  }
  const prompt = buildRecipeGenerationPrompt(
    normalizedIngredients.map((name) => ({ name })),
    {
      recipeLanguage: "Arabic",
      preferredCuisine: cuisine,
      calorieTarget: 2000,
      maxMissingIngredients: 7,
      recipeCount: 10,
      diets: [],
      conditions: [],
      allergens: [],
      excludedIngredients: [],
      candidateDishHints: "",
      canonicalDishHint: "",
      recentRecipeAvoidance: "",
      variationSeed: `manual-pdf-trace-${cuisine.toLowerCase()}`,
      recipeReferences: references
    }
  );
  const groundingEnabled = references.length === 0;
  const model = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash-lite";
  const startedAt = Date.now();

  try {
    const rawResponse = await callOpenAIText(
      prompt,
      model,
      { feature: "manual_recipe_trace", phase: cuisine, requestId: `trace-${Date.now()}-${cuisine}` },
      { groundWithGoogleSearch: groundingEnabled, temperature: 0.92, topP: 0.95 }
    );
    return {
      cuisine,
      references: mapRecipeReferencesToRecipes(references.slice(0, 10), { calorieTarget: 2000, recipeLanguage: "Arabic" }),
      referenceLookupError,
      prompt,
      request: { model, groundingEnabled, recipeCount: 10 },
      elapsedMs: Date.now() - startedAt,
      rawResponse,
      parsedBeforeFiltering: parseRawResponse(rawResponse)
    };
  } catch (error) {
    return {
      cuisine,
      references: mapRecipeReferencesToRecipes(references.slice(0, 10), { calorieTarget: 2000, recipeLanguage: "Arabic" }),
      referenceLookupError,
      prompt,
      request: { model, groundingEnabled, recipeCount: 10 },
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.stack || error.message : String(error)
    };
  }
}

async function main() {
  const normalization = await normalizeIngredients(RAW_INGREDIENTS);
  const runs: TraceRun[] = [];
  for (const cuisine of CUISINES) {
    runs.push(await runTrace(cuisine, normalization.normalized));
  }
  const report = {
    createdAt: new Date().toISOString(),
    rawIngredients: RAW_INGREDIENTS,
    normalizedIngredients: normalization,
    runs
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(REPORT_JSON_PATH, toJson(report), "utf8");
  await writeFile(REPORT_HTML_PATH, buildHtml(report), "utf8");
  console.log(`Wrote ${REPORT_JSON_PATH}`);
  console.log(`Wrote ${REPORT_HTML_PATH}`);
  for (const run of runs) {
    console.log(`${run.cuisine}: ${run.error ? `FAILED (${run.elapsedMs}ms)` : `OK (${run.elapsedMs}ms)`}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
