type Ingredient = string | { name?: string; canonical?: string };
export interface CompositeRecipe {
  name?: string;
  title?: string;
  ingredients?: Ingredient[];
  missing_ingredients?: Ingredient[];
  steps?: string[];
}

const FAMILY = /\b(?:shawarma|shawrma|shawerma|kofta|kebab|kabob)s?\b|شاورما|شاورمة|كفتة|كفته|كباب/iu;
const BASE = /\b(?:mushrooms?|tofu|tempeh|seitan|chickpeas?|lentils?|beans?|cauliflower|aubergine|eggplant|jackfruit|vegetables?|fish|salmon|tuna|cod|shrimp|chicken|beef|lamb|pork|turkey|meat)\b|فطر|مشروم|توفو|قرنبيط|باذنجان|حمص|عدس|خضار|سمك|سلمون|تونة|دجاج|لحم/iu;
const SEASONING = /\b(?:shawarma|shawrma|shawerma|kofta|kebab)\s+(?:spices?|seasoning|spice mix)\b|(?:بهارات|توابل)\s+(?:شاورما|كفتة|كباب)/giu;
const text = (value: Ingredient) => typeof value === "string" ? value : `${value.name ?? ""} ${value.canonical ?? ""}`;
const clean = (value: string) => value.toLowerCase().replace(SEASONING, "spices");

/** A side ingredient cannot establish the protein inside an unspecified prepared dish. */
export function findUnverifiedCompositeProtein(recipe: CompositeRecipe): string | null {
  const ingredients = [...(recipe.ingredients ?? []), ...(recipe.missing_ingredients ?? [])].map(text).map(clean);
  for (const ingredient of ingredients) {
    const family = ingredient.match(FAMILY)?.[0];
    if (family && !BASE.test(ingredient)) return family;
  }
  const descriptions = [recipe.name ?? "", recipe.title ?? "", ...(recipe.steps ?? [])].map(clean);
  const family = descriptions.map(value => value.match(FAMILY)?.[0]).find(Boolean);
  if (!family) return null;
  // A recipe made from named raw ingredients can establish its own protein.
  // Prepared composite ingredients above must identify their base independently.
  return ingredients.some(value => BASE.test(value)) ? null : family;
}
