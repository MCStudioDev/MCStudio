import { z } from "zod";

const englishUnits = ["g", "kg", "ml", "cup", "piece", "clove", "tbsp", "tsp"] as const;
const arabicUnits = ["غرام", "كيلوغرام", "ملليلتر", "كوب", "حبة", "فص", "ملعقة كبيرة", "ملعقة صغيرة"] as const;

// Gemini supports numeric bounds and enums, but does not document regex support.
// Require quantity/unit fields, then render the existing recipe string format.
function recipeSchema(arabic: boolean, generated: boolean) {
  const text = { type: "string", ...(arabic ? { description: "Modern Standard Arabic only, no Latin words." } : {}) };
  const ingredient = generated ? {
    type: "object", properties: {
      name: { ...text, description: `Ingredient name only in ${arabic ? "Arabic" : "English"}; no quantity, unit, size, or preparation adjectives.` },
      quantity: { type: "number", minimum: 0.001, maximum: 10000, description: "Explicit positive quantity, including for salt and water." },
      unit: { type: "string", enum: arabic ? arabicUnits : englishUnits }
    }, required: ["name", "quantity", "unit"], additionalProperties: false
  } : text;
  const properties = {
    name: text, cuisine: text,
    ingredients: { type: "array", items: ingredient, minItems: 1, maxItems: 30 },
    missing_ingredients: { type: "array", items: ingredient, maxItems: 30 },
    steps: { type: "array", items: text, minItems: 3, maxItems: 10 },
    calories: { type: "number", minimum: 80, maximum: 2500 },
    protein: text, carbs: text, fat: text, cook_time: text, difficulty: text
  };
  return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}

export function materializeArabicGeneration(value: unknown): unknown {
  if (!value || typeof value !== "object" || !("recipes" in value) || !Array.isArray(value.recipes)) return value;
  const materialize = (recipe: unknown, arabic: boolean) => {
    if (!recipe || typeof recipe !== "object") return recipe;
    const ingredient = z.object({ name: z.string().min(1).max(180), quantity: z.number().min(0.001).max(10000), unit: z.enum(arabic ? arabicUnits : englishUnits) });
    const fields = { ...recipe } as Record<string, unknown>;
    for (const key of ["ingredients", "missing_ingredients"]) {
      if (Array.isArray(fields[key])) fields[key] = fields[key].map(value => {
        // A string that violates the requested model schema still has to pass
        // every existing recipe validation check before it can be published.
        if (typeof value === "string") return value;
        const parsed = ingredient.safeParse(value);
        // Keep malformed fields for per-recipe rejection by the validator;
        // one bad pair must not discard other valid partial results.
        return parsed.success ? `${parsed.data.quantity} ${parsed.data.unit} ${parsed.data.name}` : value;
      });
    }
    return fields;
  };
  return { recipes: value.recipes.map(pair => {
    if (!pair || typeof pair !== "object") return pair;
    return { canonical: materialize(pair.canonical, false), recipe: materialize(pair.recipe, true) };
  }) };
}

export function arabicGenerationSchema(count: number) {
  return { type: "object", properties: { recipes: {
    type: "array", minItems: 1, maxItems: count,
    items: { type: "object", properties: { canonical: recipeSchema(false, true), recipe: recipeSchema(true, true) }, required: ["canonical", "recipe"], additionalProperties: false }
  } }, required: ["recipes"], additionalProperties: false };
}

export const arabicTranslationSchema = {
  type: "object", properties: { recipe: recipeSchema(true, false) }, required: ["recipe"], additionalProperties: false
};

export const arabicRepairSchema = {
  type: "object", properties: { repairs: {
    type: "array", maxItems: 21, items: {
      type: "object", properties: { index: { type: "integer", minimum: 0 }, recipe: recipeSchema(true, false) },
      required: ["index", "recipe"], additionalProperties: false
    }
  } }, required: ["repairs"], additionalProperties: false
};
