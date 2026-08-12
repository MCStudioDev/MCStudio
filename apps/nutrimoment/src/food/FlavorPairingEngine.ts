import { buildIngredientKnowledgeProfile, type IngredientKnowledgeProfile } from "@/lib/IngredientKnowledgeGraph";

export class FlavorPairingEngine {
  recommend(ingredients: string[], excluded: string[] = []): IngredientKnowledgeProfile {
    const blocked = new Set(excluded.map(normalize));
    const profile = buildIngredientKnowledgeProfile(ingredients);
    return {
      ...profile,
      flavorPairings: profile.flavorPairings.filter((item) => !blocked.has(normalize(item))),
      herbs: profile.herbs.filter((item) => !blocked.has(normalize(item))),
      spices: profile.spices.filter((item) => !blocked.has(normalize(item))),
      sauces: profile.sauces.filter((item) => !blocked.has(normalize(item)))
    };
  }
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
