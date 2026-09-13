import { generateArabicFactBatch, type ArabicFactBatchInput } from "./factsGemini";
import { arabicFingerprint } from "./fingerprint";

const pending = new Map<string, ReturnType<typeof generateArabicFactBatch>>();

export function generateArabicSourceBatch(input: ArabicFactBatchInput, deadline: number, requestId: string) {
  const key = arabicFingerprint({ ...input, ingredients: [...input.ingredients].sort(),
    restrictions: { diets: [...input.restrictions.diets].sort(), conditions: [...input.restrictions.conditions].sort(), allergens: [...input.restrictions.allergens].sort() },
    references: input.references?.map(item => ({ source: item.source, fingerprint: item.fingerprint, variantKey: item.variantKey })) });
  const existing = pending.get(key);
  if (existing) return existing;
  const task = generateArabicFactBatch({ ...input, sourceOnly: true }, deadline, requestId).finally(() => pending.delete(key));
  pending.set(key, task);
  return task;
}
