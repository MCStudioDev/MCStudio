import { z } from "zod";
import { FOOD_DICTIONARY } from "@/food/FoodDictionary";
import { findRecipeDietViolation } from "@/lib/dietEnforcement";
import { findRecipeHealthViolation } from "@/lib/healthEnforcement";
import type { GenerationRestrictions } from "@/lib/profileSafety";
import type { Recipe } from "@/lib/types";
import { RecipeQualityGate } from "@/services/recipeQualityGate";
import { arabicFoodById, findArabicFood } from "./foodCatalog";
import { arabicFingerprint } from "./fingerprint";
import { ARABIC_VALIDATOR_VERSION } from "./config";
import type { ArabicRecipeEntry } from "./types";

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
  version: z.literal("ar-facts-v1"), name: z.string().min(3).max(180).regex(/^[^A-Za-z]+$/),
  cuisine: z.enum(FOOD_DICTIONARY.cuisines.map(item => item.en) as [string, ...string[]]),
  dishFamily: z.string().min(3).max(100).regex(/^[a-z0-9 -]+$/),
  mealTypes: z.array(z.enum(["breakfast", "lunch", "dinner"])).min(1).max(3),
  servings: z.number().int().min(1).max(12),
  ingredients: z.array(z.object({ foodId: z.string().max(100), arabicName: z.string().min(1).max(100).regex(/^[^A-Za-z]+$/).optional(), quantity: z.number().positive().max(10000), unit: z.enum(unitKeys), state: z.enum(["raw", "cooked", "canned", "dried"]) })).min(1).max(30),
  steps: z.array(z.object({ action: z.enum(actionKeys), foodIds: z.array(z.string()).min(1).max(30),
    minutes: z.number().min(0).max(1440), temperatureC: z.number().min(0).max(300), heat: z.enum(["none", "low", "medium", "high"]) })).min(3).max(15),
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
    actions: facts.steps.map(step => ({ action: step.action, foodIds: [...step.foodIds].sort() })) });
}
function render(facts: ArabicRecipeFacts, arabic: boolean): Recipe {
  const index = arabic ? 1 : 0;
  const nameOf = (id: string) => { const food = arabicFoodById(id)!; return arabic ? food.ar || facts.ingredients.find(item => item.foodId === id)!.arabicName! : food.en; };
  const formatIngredient = (item: ArabicRecipeFacts["ingredients"][number]) => `${item.quantity} ${arabic ? units[item.unit] : item.unit} ${nameOf(item.foodId)} ${states[item.state][index]}`.trim();
  const steps = facts.steps.map(step => {
    let line = `${actions[step.action][index]} ${step.foodIds.map(nameOf).join(arabic ? "، " : ", ")}`;
    if (step.heat !== "none") line += arabic ? ` على نار ${{ low: "هادئة", medium: "متوسطة", high: "عالية" }[step.heat]}` : ` over ${step.heat} heat`;
    if (step.temperatureC) line += arabic ? ` عند ${step.temperatureC} درجة مئوية` : ` at ${step.temperatureC} degrees Celsius`;
    if (step.minutes) line += arabic ? ` لمدة ${step.minutes} دقيقة` : ` for ${step.minutes} minutes`;
    // Safety wording is rendered from the same facts, never translated or
    // supplied by the model. Source: foodsafety.gov safe minimum temperatures.
    if (cooking.has(step.action)) {
      const names = step.foodIds.map(id => arabicFoodById(id)!.en).join(" ");
      const minimum = /chicken|turkey|duck/.test(names) ? 74 : /ground (?:beef|lamb|meat)/.test(names) ? 71 : /salmon|tuna|fish|cod|tilapia/.test(names) ? 63 : 0;
      if (minimum) line += arabic ? `، وتحقق بميزان حرارة الطعام من بلوغ الداخل ${minimum} درجة مئوية` : `, using a food thermometer verify an internal temperature of ${minimum} degrees Celsius`;
    }
    return `${line}.`;
  });
  return {
    name: arabic ? facts.name : facts.dishFamily.replace(/-/g, " "),
    cuisine: arabic ? FOOD_DICTIONARY.cuisines.find(c => c.en === facts.cuisine)!.ar : facts.cuisine,
    ingredients: facts.ingredients.map(formatIngredient), missing_ingredients: [], steps,
    calories: facts.nutrition.calories, protein: `${facts.nutrition.protein} ${arabic ? "غرام" : "g"}`,
    carbs: `${facts.nutrition.carbs} ${arabic ? "غرام" : "g"}`, fat: `${facts.nutrition.fat} ${arabic ? "غرام" : "g"}`,
    cook_time: `${facts.totalMinutes} ${arabic ? "دقيقة" : "minutes"}`,
    difficulty: arabic ? { easy: "سهل", medium: "متوسط", hard: "صعب" }[facts.difficulty] : facts.difficulty,
    recipe_source_type: "generated"
  };
}

export async function buildArabicFactsEntry(input: unknown, restrictions: GenerationRestrictions, source?: ArabicRecipeEntry["source"], labelReceipt?: ArabicLabelReceipt): Promise<{ entry: ArabicRecipeEntry | null; reasons: string[] }> {
  const parsed = arabicFactsSchema.safeParse(input);
  if (!parsed.success) return { entry: null, reasons: ["invalid_facts_shape"] };
  const facts = parsed.data, reasons = new Set<string>();
  const ids = facts.ingredients.map(item => item.foodId);
  if (ids.some(id => !arabicFoodById(id))) return { entry: null, reasons: ["unknown_food_id"] };
  if (facts.ingredients.some(item => !arabicFoodById(item.foodId)!.ar) &&
    (facts.ingredients.some(item => !arabicFoodById(item.foodId)!.ar && !item.arabicName) || labelReceipt?.version !== "ar-label-v1" || labelReceipt.fingerprint !== recipeLabelFingerprint(facts))) reasons.add("unverified_ingredient_label");
  if (facts.ingredients.some(item => item.arabicName && arabicFoodById(item.foodId)!.ar && item.arabicName !== arabicFoodById(item.foodId)!.ar)) reasons.add("ingredient_label_changed");
  if (new Set(ids).size !== ids.length) reasons.add("duplicate_ingredients");
  for (const step of facts.steps) {
    if (step.foodIds.some(id => !ids.includes(id))) reasons.add("unlisted_step_ingredient");
    if (cooking.has(step.action) && step.minutes <= 0) reasons.add("missing_cooking_time");
    if (step.action === "bake" && step.temperatureC <= 0) reasons.add("missing_oven_temperature");
  }
  for (const item of facts.ingredients) {
    if (!facts.steps.some(step => step.foodIds.includes(item.foodId))) reasons.add("unused_ingredient");
    const food = arabicFoodById(item.foodId)!;
    if ((item.state === "raw" || item.state === "dried") && /meat|protein|seafood|fish|poultry/.test(food.categories.join(" "))
      && !facts.steps.some(step => cooking.has(step.action) && step.foodIds.includes(item.foodId))) reasons.add("raw_protein_not_cooked");
  }
  if (reasons.size) return { entry: null, reasons: [...reasons] };
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
  for (const reason of gate.validate(canonical, "English").reasons.filter(reason => reason !== "not_source_backed")) reasons.add(`canonical:${reason}`);
  if (reasons.size) return { entry: null, reasons: [...reasons] };
  const fingerprint = arabicFingerprint({ facts, source: source ?? null });
  const id = `ar-${fingerprint.slice(0, 24)}`;
  return { reasons: [], entry: { id, facts, labelReceipt, canonical, recipe: { ...recipe, id, generationLanguage: "ar" },
    ingredientCanonicals: names, fingerprint, source, validatorVersion: ARABIC_VALIDATOR_VERSION, validatedAt: new Date().toISOString() } };
}
