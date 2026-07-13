const QUANTITY_WORDS =
  /\b(?:about|approx(?:imately)?|optional|divided|plus|more|extra|large|small|medium|fresh|frozen|canned|drained|rinsed|chopped|diced|minced|sliced|grated|shredded|cubed|boneless|skinless|whole|lean|raw|cooked|uncooked|packed|firmly|loosely|bite size|bite-size)\b/giu;

const UNIT_WORDS =
  /\b(?:cups?|c\.|tbsp\.?|tablespoons?|tsp\.?|teaspoons?|ounces?|oz\.?|pounds?|lbs?|lb\.?|grams?|g|kg|kilograms?|ml|milliliters?|liters?|l|pinch|dash|cloves?|cans?|jars?|packages?|pkg\.?|bunch(?:es)?|stalks?|slices?|pieces?|heads?)\b/giu;

export function normalizeRecipeReferenceIngredient(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\d+(?:\s*\/\s*\d+)?|\d*\.\d+/g, " ")
    .replace(UNIT_WORDS, " ")
    .replace(QUANTITY_WORDS, " ")
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return singularizeIngredient(normalized);
}

export function expandRecipeReferenceIngredient(value: string) {
  const normalized = normalizeRecipeReferenceIngredient(value);
  if (!normalized) return [];

  const expanded = new Set<string>([normalized]);
  const source = ` ${normalized} `;

  const chickenFlavorOnly =
    /\bchicken\s+(?:broth|stock|bouillon|gravy|soup|stuffing|base|flavo(?:u)?r(?:ed)?)\b/.test(source) ||
    /\bchicken\s+of\s+the\s+sea\b/.test(source);
  const beefFlavorOnly = /\bbeef\s+(?:broth|stock|bouillon|gravy|soup|base|flavo(?:u)?r(?:ed)?)\b/.test(source);

  if (!chickenFlavorOnly) {
    addIf(source, expanded, /\b(chicken|hen|poultry|chicken\s+drumstick|chicken\s+thigh|chicken\s+breast|chicken\s+wing|chicken\s+tenderloin|chicken\s+tender)\b/, "chicken");
  }
  addIf(source, expanded, /\b(ground chicken|chicken mince|minced chicken)\b/, "ground chicken");
  if (!beefFlavorOnly) {
    addIf(source, expanded, /\b(beef|steak|sirloin|ribeye|beef\s+tenderloin|beef\s+chuck|brisket|round roast|pot roast)\b/, "beef");
  }
  addIf(source, expanded, /\b(steak|sirloin|ribeye|beef\s+tenderloin)\b/, "steak");
  addIf(source, expanded, /\b(ground beef|minced beef|beef mince|hamburger meat|hamburger)\b/, "ground beef");
  addIf(source, expanded, /\b(ground meat|minced meat|mince)\b/, "ground meat");
  addIf(source, expanded, /\b(lamb|mutton)\b/, "lamb");
  addIf(source, expanded, /\b(liver|kebda|calf liver|beef liver|chicken liver)\b/, "liver");
  addIf(source, expanded, /\b(shrimp|prawn|prawns)\b/, "shrimp");
  addIf(source, expanded, /\b(shrimp|prawn|prawns|fish|salmon|tuna|cod|tilapia|halibut|bass|snapper|seafood)\b/, "seafood");
  addIf(source, expanded, /\b(fish|salmon|tuna|cod|tilapia|halibut|bass|snapper)\b/, "fish");
  addIf(source, expanded, /\b(salmon)\b/, "salmon");
  addIf(source, expanded, /\b(egg|eggs)\b/, "egg");
  addIf(source, expanded, /\b(tomato|tomatoes)\b/, "tomato");
  addIf(source, expanded, /\b(onion|onions)\b/, "onion");
  addIf(source, expanded, /\b(bell pepper|green pepper|red pepper|yellow pepper|sweet pepper|capsicum)\b/, "bell pepper");
  addIf(source, expanded, /\b(potato|potatoes)\b/, "potato");
  addIf(source, expanded, /\b(bread|pita|flatbread|bun|roll|tortilla|toast|lavash)\b/, "bread");
  addIf(source, expanded, /\b(rice|basmati|jasmine rice|white rice|brown rice)\b/, "rice");
  addIf(source, expanded, /\b(pasta|spaghetti|linguine|fettuccine|penne|macaroni|noodle|noodles)\b/, "pasta");
  addIf(source, expanded, /\b(cheese|mozzarella|parmesan|cheddar|feta|ricotta)\b/, "cheese");
  addIf(source, expanded, /\b(milk|cream|yogurt|yoghurt|sour cream|buttermilk)\b/, "dairy");
  addIf(source, expanded, /\b(beans|black beans|kidney beans|white beans|chickpeas|lentils|fava)\b/, "legumes");
  addIf(source, expanded, /\b(mushroom|mushrooms)\b/, "mushroom");
  addIf(source, expanded, /\b(spinach)\b/, "spinach");

  return Array.from(expanded).filter((item) => item.length >= 2);
}

export function buildRecipeReferenceIngredientSet(values: string[]) {
  return Array.from(new Set(values.flatMap(expandRecipeReferenceIngredient))).slice(0, 40);
}

export function normalizeRecipeReferenceCuisineKey(value?: string) {
  const normalized = (value ?? "Global")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!normalized || normalized === "any") return "global";
  if (normalized === "east-asian" || normalized === "chinese" || normalized === "asian") return "east-asian";
  if (normalized === "middle-eastern" || normalized === "lebanese" || normalized === "levantine") return "middle-eastern";
  return normalized;
}

export function buildRecipeReferenceLookupBuckets(input: {
  cuisine?: string;
  mainIngredients: string[];
}) {
  const cuisineKey = normalizeRecipeReferenceCuisineKey(input.cuisine);
  const mainIngredientKeys = Array.from(
    new Set(input.mainIngredients.map(normalizeRecipeReferenceIngredient).filter(Boolean))
  ).slice(0, 12);

  return {
    cuisineKey,
    mainIngredientKeys,
    lookupBuckets: Array.from(
      new Set([
        ...mainIngredientKeys.map((ingredient) => `${cuisineKey}::${ingredient}`),
        ...mainIngredientKeys.map((ingredient) => `any::${ingredient}`),
        `${cuisineKey}::any`
      ])
    ).slice(0, 32)
  };
}

function addIf(source: string, target: Set<string>, pattern: RegExp, value: string) {
  if (pattern.test(source)) target.add(value);
}

function singularizeIngredient(value: string) {
  return value
    .replace(/\bbreasts\b/g, "breast")
    .replace(/\bthighs\b/g, "thigh")
    .replace(/\bwings\b/g, "wing")
    .replace(/\btomatoes\b/g, "tomato")
    .replace(/\bonions\b/g, "onion")
    .replace(/\bpotatoes\b/g, "potato")
    .replace(/\beggs\b/g, "egg")
    .replace(/\bmushrooms\b/g, "mushroom")
    .replace(/\bpeppers\b/g, "pepper")
    .replace(/\s+/g, " ")
    .trim();
}
