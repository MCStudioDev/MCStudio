export interface GenerationRestrictions {
  diets: string[];
  conditions: string[];
  allergens: string[];
}

export class ProfileUnavailableError extends Error {
  constructor() {
    super("Your saved health profile could not be verified. Reload your profile before generating meals.");
    this.name = "ProfileUnavailableError";
  }
}

export function parseSavedRestrictions(value: unknown): GenerationRestrictions {
  if (!value || typeof value !== "object") throw new ProfileUnavailableError();
  const raw = value as Record<string, unknown>;
  const array = (key: string, optional = false): string[] => {
    if (optional && raw[key] === undefined) return [];
    const values = raw[key];
    if (!Array.isArray(values) || values.some(item => typeof item !== "string" || !item.trim())) {
      throw new ProfileUnavailableError();
    }
    return [...new Set(values.map(item => item.trim()))];
  };
  return { diets: array("diets"), conditions: array("conditions", true), allergens: array("allergens", true) };
}
