import { buildArabicCuisineGuidance } from "./cuisineGuidance";
import { arabicFingerprint } from "./fingerprint";
import { foodTerm } from "./foodCatalog";
import type { ArabicFactBatchInput } from "./factsGemini";
import type { ArabicReferenceCandidate } from "./referenceSources";

export interface ArabicDishCandidate {
  candidateId: string;
  kind: "source" | "catalog" | "discovery";
  title?: string;
  nativeName?: string;
  description?: string;
  essentialIngredients?: string[];
  reference?: ArabicReferenceCandidate;
}

/** Select identities before asking the model for ingredient manifests. */
export async function selectArabicDishCandidates(input: ArabicFactBatchInput): Promise<ArabicDishCandidate[]> {
  if (input.sourceOnly) {
    const seen = new Set<string>();
    return (input.references ?? []).filter(item => {
      const identity = foodTerm(item.reference.title);
      if (seen.has(identity)) return false;
      seen.add(identity); return true;
    }).slice(0, Math.min(input.count, 10)).map(reference => ({
      candidateId: `dish-${arabicFingerprint({ source: reference.source, id: reference.reference.id, fingerprint: reference.fingerprint }).slice(0, 24)}`,
      kind: "source", title: reference.reference.title, reference
    }));
  }
  const excluded = new Set((input.excludeNames ?? []).map(foodTerm));
  let guidance = (await buildArabicCuisineGuidance(input.cuisine, input.ingredients, input.restrictions))
    .filter(dish => ![dish.name, dish.nativeName ?? ""].some(name => name && excluded.has(foodTerm(name))));
  const weeklySlots = ["breakfast", "lunch", "dinner"] as const;
  if (input.mealTypesNeeded?.length) {
    // All parallel batches derive the same assignment, so a flexible dish is
    // generated once instead of occupying breakfast, lunch and dinner slots.
    const counts = new Map(weeklySlots.map(type => [type, 0]));
    const assigned = new Set<string>();
    guidance = guidance.filter(dish => {
      const keys = [dish.name, dish.nativeName].filter(Boolean).map(foodTerm);
      if (keys.some(key => assigned.has(key))) return false;
      keys.forEach(key => assigned.add(key));
      const compatible = weeklySlots.filter(type => (dish.mealTypes ?? weeklySlots).includes(type));
      if (input.mealTypesNeeded!.length !== 1) return compatible.some(type => input.mealTypesNeeded!.includes(type));
      const slot = compatible.sort((a, b) => counts.get(a)! - counts.get(b)!)[0];
      if (!slot) return false;
      counts.set(slot, counts.get(slot)! + 1);
      return slot === input.mealTypesNeeded![0];
    });
  }
  // Round-robin ingredient families: a run of rice variations cannot occupy
  // every slot before another compatible dish gets a chance. No dish allowlist.
  const groups = new Map<string, typeof guidance>();
  for (const dish of guidance) {
    const key = [...new Set(dish.essentialIngredients.map(foodTerm))].sort().join("|");
    groups.set(key, [...(groups.get(key) ?? []), dish]);
  }
  const selected: ArabicDishCandidate[] = [], seen = new Set<string>();
  const limit = Math.min(input.count + 2, 10);
  for (let round = 0; selected.length < limit && round < guidance.length; round++) {
    for (const group of groups.values()) {
      const dish = group[round];
      const keys = dish ? [dish.name, dish.nativeName].filter(Boolean).map(foodTerm) : [];
      if (!dish || keys.some(key => seen.has(key)) || selected.length >= limit) continue;
      keys.forEach(key => seen.add(key));
      selected.push({ candidateId: `dish-${arabicFingerprint({ cuisine: input.cuisine, title: foodTerm(dish.name) }).slice(0, 24)}`,
        kind: "catalog", title: dish.name, nativeName: dish.nativeName, description: dish.description, essentialIngredients: dish.essentialIngredients });
    }
  }
  // Any/uncatalogued cuisines can propose identities only in issued discovery
  // slots. Once the manifest is accepted, its identity is immutable as well.
  while (selected.length < Math.min(input.count, 10)) {
    selected.push({ candidateId: `dish-${arabicFingerprint({ cuisine: input.cuisine, pantry: [...input.ingredients].sort(), seed: input.variationSeed, mealTypes: input.mealTypesNeeded, slot: selected.length }).slice(0, 24)}`, kind: "discovery" });
  }
  return selected;
}
