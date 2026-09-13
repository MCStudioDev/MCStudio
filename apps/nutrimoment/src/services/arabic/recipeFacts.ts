import { z } from "zod";
import { FOOD_DICTIONARY } from "@/food/FoodDictionary";
import { findRecipeDietViolation } from "@/lib/dietEnforcement";
import { findRecipeHealthViolation } from "@/lib/healthEnforcement";
import type { GenerationRestrictions } from "@/lib/profileSafety";
import type { Recipe } from "@/lib/types";
import { RecipeQualityGate } from "@/services/recipeQualityGate";
import { getAllCuisineCatalogV2Entries } from "@/lib/cuisineCatalogs/v2";
import { arabicFoodById, findArabicFood, foodTerm } from "./foodCatalog";
import { arabicFingerprint } from "./fingerprint";
import { ARABIC_VALIDATOR_VERSION } from "./config";
import type { ArabicRecipeEntry } from "./types";
import { arabicSafetyFingerprint, needsArabicSemanticSafety } from "./semanticSafety";

const actions = {
  wash: ["Wash", "اغسل"], chop: ["Chop", "قطع"], peel: ["Peel", "قشر"],
  soak: ["Soak", "انقع"], drain: ["Drain", "صف"], mix: ["Mix", "اخلط"],
  grind: ["Grind", "اطحن"], mash: ["Mash", "اهرس"], shape: ["Shape into small patties", "شكل أقراصا صغيرة من"],
  boil: ["Boil", "اسلق"], simmer: ["Cover and simmer", "غط القدر واطه على نار هادئة"],
  fry: ["Fry", "اقل"], saute: ["Saute", "شوح"], bake: ["Bake in a preheated oven", "اخبز في فرن مسخن مسبقا"],
  grill: ["Grill", "اشو"], steam: ["Steam", "اطه على البخار"],
  stir: ["Stir", "قلب"], blend: ["Blend until smooth", "اخلط حتى يصبح المزيج ناعما"],
  layer: ["Arrange in layers", "رتب في طبقات"], rest: ["Leave to rest", "اترك جانبا"], serve: ["Serve together", "قدم معا"]
} as const;
const units = { g: "غرام", kg: "كيلوغرام", ml: "ملليلتر", cup: "كوب", piece: "حبة", clove: "فص", tbsp: "ملعقة كبيرة", tsp: "ملعقة صغيرة", can: "علبة" } as const;
const states = { raw: ["", ""], cooked: ["cooked", "مطهو"], canned: ["canned", "معلب"], dried: ["dried", "مجفف"] } as const;
const actionKeys = Object.keys(actions) as [keyof typeof actions, ...(keyof typeof actions)[]];
const unitKeys = Object.keys(units) as [keyof typeof units, ...(keyof typeof units)[]];
export const arabicFactsSchema = z.object({
  version: z.literal("ar-facts-v1"), name: z.string().min(3).max(180).regex(/^[^A-Za-z]+$/).describe("The visible dish title in Arabic script only. No English name, Latin transliteration, or parentheses containing English."),
  cuisine: z.enum(FOOD_DICTIONARY.cuisines.map(item => item.en) as [string, ...string[]]),
  dishFamily: z.string().min(3).max(100).regex(/^[a-z0-9 -]+$/i).describe("Internal English dish identity, using English letters, spaces or hyphens only."),
  mealTypes: z.array(z.enum(["breakfast", "lunch", "dinner"])).min(1).max(3),
  servings: z.literal(1),
  ingredients: z.array(z.object({ foodId: z.string().max(100), arabicName: z.string().min(1).max(100).regex(/^[^A-Za-z]+$/).optional(), quantity: z.number().positive().max(10000), unit: z.enum(unitKeys), state: z.enum(["raw", "cooked", "canned", "dried"]) })).min(1).max(30),
  steps: z.array(z.object({ action: z.enum(actionKeys), foodIds: z.array(z.string()).max(30).describe("Only foodIds from THIS recipe's ingredients. Never equipment, prepared mixtures, sauces made in earlier steps or finished dish IDs."),
    previousSteps: z.array(z.number().int().positive()).max(30).optional().describe("1-based indexes of earlier steps whose prepared outputs are used here. A sauce or mixture made earlier is referenced here, not added as a new foodId."),
    minutes: z.number().min(0).max(1440), temperatureC: z.number().min(0).max(300), heat: z.enum(["none", "low", "medium", "high"]) })).min(3).max(30),
  nutrition: z.object({ calories: z.number().positive().max(3000), protein: z.number().nonnegative().max(300), carbs: z.number().nonnegative().max(750), fat: z.number().nonnegative().max(300) }),
  totalMinutes: z.number().positive().max(1500), difficulty: z.enum(["easy", "medium", "hard"])
}).strict();
export type ArabicRecipeFacts = z.infer<typeof arabicFactsSchema>;
export interface ArabicLabelReceipt { version: "ar-label-v1"; fingerprint: string }
export function recipeLabelFingerprint(facts: ArabicRecipeFacts) {
  return arabicFingerprint(facts.ingredients.filter(item => !arabicFoodById(item.foodId)?.ar).map(item => ({ foodId: item.foodId, arabicName: item.arabicName })));
}
const cooking = new Set(["boil", "simmer", "fry", "saute", "bake", "grill", "steam"]);

export function arabicPropertyViolation(ingredients: string[], restrictions: GenerationRestrictions) {
  const foods = ingredients.map(findArabicFood);
  if (restrictions.diets.some(diet => diet.toLowerCase() === "paleo") && foods.some(food => food?.categories.some(category => /grain|legume|dairy/i.test(category)))) return true;
  return false;
}

export function recipeFactsIdentity(input: unknown) {
  const facts = arabicFactsSchema.parse(input);
  // Wording, family labels, portion size and ingredient order cannot create a
  // second card for the same dish. Preparation/state still distinguish dishes.
  return arabicFingerprint({ ingredients: facts.ingredients.map(i => `${i.foodId}:${i.state}`).sort(),
    actions: facts.steps.map(step => ({ action: step.action, foodIds: [...step.foodIds].sort(), previousSteps: step.previousSteps ?? [] })) });
}
function stepFoods(facts: ArabicRecipeFacts, index: number, memo = new Map<number, string[]>()): string[] {
  const cached = memo.get(index); if (cached) return cached;
  const step = facts.steps[index];
  const result = [...new Set([...step.foodIds, ...(step.previousSteps ?? []).flatMap(previous => previous <= index ? stepFoods(facts, previous - 1, memo) : [])])];
  memo.set(index, result); return result;
}
function render(facts: ArabicRecipeFacts, arabic: boolean): Recipe {
  const index = arabic ? 1 : 0;
  const nameOf = (id: string) => { const food = arabicFoodById(id)!; return arabic ? food.ar || facts.ingredients.find(item => item.foodId === id)!.arabicName! : food.en; };
  const formatIngredient = (item: ArabicRecipeFacts["ingredients"][number]) => `${item.quantity} ${arabic ? units[item.unit] : item.unit} ${nameOf(item.foodId)} ${states[item.state][index]}`.trim();
  const steps = facts.steps.map((step, stepIndex) => {
    const items = [...step.foodIds.map(nameOf), ...(step.previousSteps ?? []).map(previous => arabic ? `المزيج الناتج من الخطوة ${previous}` : `the preparation from step ${previous}`)];
    let line = `${actions[step.action][index]} ${items.join(arabic ? "، " : ", ")}`;
    if (step.action === "serve" && !items.length) line = arabic ? "قدم الطبق بعد اكتمال التحضير" : "Serve the finished dish";
    if (step.heat !== "none") line += arabic ? ` على نار ${{ low: "هادئة", medium: "متوسطة", high: "عالية" }[step.heat]}` : ` over ${step.heat} heat`;
    if (step.temperatureC) line += arabic ? ` عند ${step.temperatureC} درجة مئوية` : ` at ${step.temperatureC} degrees Celsius`;
    if (step.minutes) line += arabic ? ` لمدة ${step.minutes} دقيقة` : ` for ${step.minutes} minutes`;
    // Safety wording is rendered from the same facts, never translated or
    // supplied by the model. Source: foodsafety.gov safe minimum temperatures.
    if (cooking.has(step.action)) {
      const names = stepFoods(facts, stepIndex).map(id => arabicFoodById(id)!.en).join(" ");
      const minimum = /chicken|turkey|duck/.test(names) ? 74 : /ground (?:beef|lamb|meat)/.test(names) ? 71 : /salmon|tuna|fish|cod|tilapia/.test(names) ? 63 : 0;
      if (minimum) line += arabic ? `، وتحقق بميزان حرارة الطعام من بلوغ الداخل ${minimum} درجة مئوية` : `, using a food thermometer verify an internal temperature of ${minimum} degrees Celsius`;
    }
    return `${line}.`;
  });
  return {
    name: arabic ? facts.name : getAllCuisineCatalogV2Entries().find(item => item.names.native.some(name => foodTerm(name) === foodTerm(facts.name)))?.names.english[0] || facts.dishFamily.replace(/-/g, " "),
    cuisine: arabic ? FOOD_DICTIONARY.cuisines.find(c => c.en === facts.cuisine)!.ar : facts.cuisine,
    ingredients: facts.ingredients.map(formatIngredient), missing_ingredients: [], steps,
    calories: facts.nutrition.calories, protein: `${facts.nutrition.protein} ${arabic ? "غرام" : "g"}`,
    carbs: `${facts.nutrition.carbs} ${arabic ? "غرام" : "g"}`, fat: `${facts.nutrition.fat} ${arabic ? "غرام" : "g"}`,
    cook_time: `${facts.totalMinutes} ${arabic ? "دقيقة" : "minutes"}`,
    difficulty: arabic ? { easy: "سهل", medium: "متوسط", hard: "صعب" }[facts.difficulty] : facts.difficulty,
    recipe_source_type: "generated"
  };
}

export async function buildArabicFactsEntry(input: unknown, restrictions: GenerationRestrictions, source?: ArabicRecipeEntry["source"], labelReceipt?: ArabicLabelReceipt, safetyReceipt?: string): Promise<{ entry: ArabicRecipeEntry | null; reasons: string[] }> {
  const parsed = arabicFactsSchema.safeParse(input);
  if (!parsed.success) return { entry: null, reasons: ["invalid_facts_shape"] };
  const facts = parsed.data, reasons = new Set<string>();
  if (facts.totalMinutes < Math.max(...facts.steps.map(step => step.minutes))) reasons.add("inconsistent_total_time");
  const ids = facts.ingredients.map(item => item.foodId);
  if (ids.some(id => !arabicFoodById(id))) return { entry: null, reasons: ["unknown_food_id"] };
  if (arabicPropertyViolation(ids.map(id => arabicFoodById(id)!.en), restrictions)) reasons.add("diet_violation");
  if (needsArabicSemanticSafety(facts, restrictions) && safetyReceipt !== arabicSafetyFingerprint(facts, restrictions)) reasons.add("semantic_safety_unverified");
  if (facts.ingredients.some(item => !arabicFoodById(item.foodId)!.ar) &&
    (facts.ingredients.some(item => !arabicFoodById(item.foodId)!.ar && !item.arabicName) || labelReceipt?.version !== "ar-label-v1" || labelReceipt.fingerprint !== recipeLabelFingerprint(facts))) reasons.add("unverified_ingredient_label");
  if (facts.ingredients.some(item => item.arabicName && arabicFoodById(item.foodId)!.ar && item.arabicName !== arabicFoodById(item.foodId)!.ar)) reasons.add("ingredient_label_changed");
  if (new Set(ids).size !== ids.length) reasons.add("duplicate_ingredients");
  for (const [index, step] of facts.steps.entries()) {
    if (step.foodIds.some(id => !ids.includes(id))) reasons.add("unlisted_step_ingredient");
    if ((!step.foodIds.length && !step.previousSteps?.length && step.action !== "serve") || step.previousSteps?.some(previous => previous > index)) reasons.add("invalid_preparation_reference");
    if (cooking.has(step.action) && step.minutes <= 0) reasons.add("missing_cooking_time");
    if (step.action === "bake" && step.temperatureC <= 0) reasons.add("missing_oven_temperature");
    if (["boil", "simmer", "steam"].includes(step.action)) {
      const used = stepFoods(facts, index);
      const dryStaple = facts.ingredients.some(item => used.includes(item.foodId) && ["raw", "dried"].includes(item.state)
        && /grain|legume/.test(arabicFoodById(item.foodId)!.categories.join(" ")));
      const liquid = used.some(id => /\b(water|broth|stock|milk|sauce)\b/.test(arabicFoodById(id)?.en ?? ""));
      if (dryStaple && !liquid) reasons.add("missing_cooking_liquid");
    }
  }
  for (const item of facts.ingredients) {
    if (!facts.steps.some(step => step.foodIds.includes(item.foodId))) reasons.add("unused_ingredient");
    const food = arabicFoodById(item.foodId)!;
    if ((item.state === "raw" || item.state === "dried") && /meat|protein|seafood|fish|poultry/.test(food.categories.join(" "))
      && !facts.steps.some((step, index) => cooking.has(step.action) && stepFoods(facts, index).includes(item.foodId))) reasons.add("raw_protein_not_cooked");
  }
  // Pending semantic receipts must not hide repairable instruction defects.
  // Only invalid references prevent safe rendering for the quality preflight.
  if (reasons.has("unlisted_step_ingredient") || reasons.has("invalid_preparation_reference")) return { entry: null, reasons: [...reasons] };
  const canonical = render(facts, false), recipe = render(facts, true);
  const names = ids.map(id => arabicFoodById(id)!.en);
  if (arabicPropertyViolation(names, restrictions)) reasons.add("diet_violation");
  for (const subject of [canonical, recipe]) {
    if (findRecipeDietViolation(subject, restrictions)) reasons.add("diet_violation");
    if (findRecipeHealthViolation(subject, restrictions.conditions)) reasons.add("health_violation");
  }
  // Pure English safety checks remain unchanged. The server owns the Arabic
  // rendering, so no second independent text or regex translation comparison.
  const gate = new RecipeQualityGate();
  // Overnight soaking/resting is displayed in the facts and total time, but
  // must not be mistaken for hundreds of minutes of active cooking.
  const passiveMinutes = facts.steps.filter(step => step.action === "soak" || step.action === "rest").reduce((sum, step) => sum + step.minutes, 0);
  const activeMinutes = facts.totalMinutes - passiveMinutes;
  for (const reason of gate.validate({ ...canonical, cook_time: `${activeMinutes} minutes` }, "English").reasons.filter(reason => reason !== "not_source_backed")) reasons.add(`canonical:${reason}`);
  if (reasons.size) return { entry: null, reasons: [...reasons] };
  const fingerprint = arabicFingerprint({ facts, source: source ?? null });
  const id = `ar-${fingerprint.slice(0, 24)}`;
  return { reasons: [], entry: { id, facts, labelReceipt, safetyReceipt, canonical, recipe: { ...recipe, id, generationLanguage: "ar" },
    ingredientCanonicals: names, fingerprint, source, validatorVersion: ARABIC_VALIDATOR_VERSION, validatedAt: new Date().toISOString() } };
}
