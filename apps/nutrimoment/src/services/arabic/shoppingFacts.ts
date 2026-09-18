import { parsePantryQuantity } from "@/lib/pantryQuantity";
import { arabicFoodById, findArabicFood } from "./foodCatalog";
import { normalizeArabicInputs, normalizeArabicMeasure } from "./ingredients";
import type { ArabicRecipeEntry } from "./types";

const units: Record<string, { base: string; factor: number; ar: string }> = {
  g: { base: "g", factor: 1, ar: "غرام" }, kg: { base: "g", factor: 1000, ar: "كيلوغرام" },
  ml: { base: "ml", factor: 1, ar: "ملليلتر" }, cup: { base: "ml", factor: 240, ar: "كوب" },
  tbsp: { base: "ml", factor: 15, ar: "ملعقة كبيرة" }, tsp: { base: "ml", factor: 5, ar: "ملعقة صغيرة" },
  piece: { base: "piece", factor: 1, ar: "حبة" }, whole: { base: "piece", factor: 1, ar: "حبة" },
  can: { base: "can", factor: 1, ar: "علبة" }, clove: { base: "clove", factor: 1, ar: "فص" }
};
type Amount = { id: string; state: string; label: string; quantity: number; unit: string };
const stateLabels: Record<string, string> = { raw: "", cooked: "مطهو", canned: "معلب", dried: "مجفف" };
const measurePrefix = /^\s*((?:\d+\s+)?\d+\s*\/\s*\d+|\d+(?:\.\d+)?)\s*(\S+)\s+/;
// Inputs are already validated entries. Facts carry identity and labels directly;
// legacy translations retain their independently validated ingredient pairing.
export async function buildArabicShoppingList(entries: ArabicRecipeEntry[], pantry: Array<{ name: string; quantity?: string }>) {
  const needed = new Map<string, Amount>();
  const add = (amount: Amount) => {
    const unit = units[amount.unit];
    if (!unit || !Number.isFinite(amount.quantity) || amount.quantity <= 0 || /[A-Za-z]/.test(amount.label)) throw new Error("Invalid Arabic shopping ingredient");
    const key = `${amount.id}:${amount.state}:${unit.base}`;
    const existing = needed.get(key);
    if (existing) existing.quantity += amount.quantity * unit.factor / units[existing.unit].factor;
    else needed.set(key, { ...amount });
  };
  for (const entry of entries) {
    if (entry.facts) {
      for (const item of entry.facts.ingredients) add({ id: item.foodId, state: item.state, label: arabicFoodById(item.foodId)?.ar || item.arabicName || "", quantity: item.quantity, unit: item.unit });
    } else {
      const canonical = [...entry.canonical.ingredients, ...entry.canonical.missing_ingredients];
      const display = [...entry.recipe.ingredients, ...entry.recipe.missing_ingredients];
      for (const [index, ingredient] of canonical.entries()) {
        const normalized = await normalizeArabicInputs([ingredient]);
        const quantity = normalizeArabicMeasure(ingredient).match(measurePrefix);
        const label = normalizeArabicMeasure(display[index]).replace(measurePrefix, "");
        if (!quantity || normalized.unclear.length || normalized.canonical.length !== 1) throw new Error("Unresolved Arabic shopping ingredient");
        const name = normalized.canonical[0];
        const fraction = quantity[1].match(/^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/);
        const amount = fraction ? Number(fraction[1] ?? 0) + Number(fraction[2]) / Number(fraction[3]) : Number(quantity[1]);
        add({ id: findArabicFood(name)?.id ?? name, label, quantity: amount, unit: quantity[2], state: "raw" });
      }
    }
  }
  for (const item of pantry) {
    // A name alone proves presence, not enough stock for all seven days.
    if (!item.quantity?.trim()) continue;
    const normalized = await normalizeArabicInputs([item.name]);
    if (normalized.unclear.length || normalized.canonical.length !== 1) continue;
    const name = normalized.canonical[0], id = findArabicFood(name)?.id ?? name;
    const parsed = parsePantryQuantity(normalizeArabicMeasure(item.quantity), name), unit = units[parsed.unit];
    if (!unit || !Number.isFinite(parsed.quantity) || parsed.quantity <= 0) continue;
    // Do not guess density, package size, or raw-to-cooked yield conversions.
    const key = `${id}:raw:${unit.base}`, target = needed.get(key);
    if (target) target.quantity = Math.max(0, target.quantity - parsed.quantity * unit.factor / units[target.unit].factor);
  }
  return [...needed.values()].filter(item => item.quantity > 0).map(item =>
    `${Number(item.quantity.toFixed(3))} ${units[item.unit].ar} ${item.label}${stateLabels[item.state] ? ` ${stateLabels[item.state]}` : ""}`);
}
