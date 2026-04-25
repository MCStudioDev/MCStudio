interface RecipePhotoQueryInput {
  cuisine?: string;
  imageSearchIndex?: string;
  imageSearchIndices?: string[];
  ingredients?: unknown[];
  missingIngredients?: unknown[];
  name: string;
}

const PROTEIN_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "chicken breast", pattern: /\bchicken breast\b/i },
  { label: "chicken thigh", pattern: /\bchicken thigh\b/i },
  { label: "chicken", pattern: /\bchicken\b/i },
  { label: "shrimp", pattern: /\bshrimp|prawn\b/i },
  { label: "salmon", pattern: /\bsalmon\b/i },
  { label: "fish", pattern: /\bfish|cod|tilapia|snapper|sea bass\b/i },
  { label: "beef", pattern: /\bbeef|steak|meat\b/i },
  { label: "lamb", pattern: /\blamb\b/i },
  { label: "tofu", pattern: /\btofu\b/i },
  { label: "chickpea", pattern: /\bchickpea\b/i },
  { label: "lentil", pattern: /\blentil\b/i }
];

const STARCH_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "pasta", pattern: /\bpasta|spaghetti|penne|fettuccine|macaroni\b/i },
  { label: "noodles", pattern: /\bnoodle|noodles|ramen|udon|soba\b/i },
  { label: "rice", pattern: /\brice\b/i },
  { label: "potatoes", pattern: /\bpotato|potatoes\b/i },
  { label: "bread", pattern: /\bbread|toast|bun|roll\b/i }
];

const SAUCE_PATTERNS: Array<{ label: string; aliases: string[]; pattern: RegExp }> = [
  { label: "red sauce", aliases: ["tomato sauce", "marinara"], pattern: /\bred sauce|tomato sauce|marinara|pomodoro|tomato basil\b/i },
  { label: "white sauce", aliases: ["creamy sauce", "alfredo"], pattern: /\bwhite sauce|creamy sauce|alfredo|cream sauce|creamy\b/i },
  { label: "pesto", aliases: [], pattern: /\bpesto\b/i },
  { label: "soy garlic", aliases: ["garlic soy"], pattern: /\bsoy garlic|garlic soy|soy sauce\b/i },
  { label: "curry sauce", aliases: ["curry"], pattern: /\bcurry sauce|curry\b/i }
];

const METHOD_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "grilled", pattern: /\bgrilled|chargrilled\b/i },
  { label: "fried", pattern: /\bfried|crispy|breaded|crunchy\b/i },
  { label: "baked", pattern: /\bbaked\b/i },
  { label: "roasted", pattern: /\broasted\b/i },
  { label: "stir fry", pattern: /\bstir fry|stir-fry\b/i },
  { label: "pan seared", pattern: /\bpan seared|pan-seared|seared\b/i }
];

const DISH_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "pasta", pattern: /\bpasta|spaghetti|penne|fettuccine|macaroni\b/i },
  { label: "noodles", pattern: /\bnoodle|noodles|ramen|udon|soba\b/i },
  { label: "salad", pattern: /\bsalad\b/i },
  { label: "soup", pattern: /\bsoup\b/i },
  { label: "stew", pattern: /\bstew\b/i },
  { label: "bowl", pattern: /\bbowl\b/i },
  { label: "curry", pattern: /\bcurry\b/i }
];

export function buildRecipePhotoQueryCandidates(input: RecipePhotoQueryInput) {
  const ownedIngredientLabels = [...(input.ingredients ?? [])]
    .map(getIngredientLabel)
    .filter(Boolean);
  const missingIngredientLabels = [...(input.missingIngredients ?? [])]
    .map(getIngredientLabel)
    .filter(Boolean);
  const context = [input.name, input.cuisine, ...ownedIngredientLabels, ...missingIngredientLabels].filter(Boolean).join(" ");
  const protein = detectLabel(context, PROTEIN_PATTERNS);
  const starch = detectLabel(context, STARCH_PATTERNS);
  const sauce = detectSauce(context);
  const method = detectLabel(context, METHOD_PATTERNS);
  const dish = detectLabel(context, DISH_PATTERNS);
  const explicitQueries = normalizeQueryList([...(input.imageSearchIndices ?? []), input.imageSearchIndex]).filter(
    (query) =>
      !isExplicitQueryTooGeneric(query, {
        dish,
        protein,
        starch
      })
  );
  const cuisine = normalizePhrase(input.cuisine ?? "");
  const exactName = normalizePhrase(input.name);
  const simplifiedName = normalizePhrase(
    input.name
      .replace(/\b(recipe|plate|dish|style)\b/gi, " ")
      .replace(/\s+/g, " ")
  );

  const derivedCandidates = normalizeQueryList([
    exactName,
    simplifiedName,
    joinRecipeQueryParts(method, protein, sauce?.label, starch ?? dish, "plate"),
    joinRecipeQueryParts(protein, sauce?.label, starch ?? dish, "plate"),
    joinRecipeQueryParts(method, protein, starch ?? dish, "plate"),
    joinRecipeQueryParts(protein, starch ?? dish, "plate"),
    joinRecipeQueryParts(method, protein, sauce?.label, starch ?? dish),
    joinRecipeQueryParts(protein, sauce?.label, starch ?? dish),
    joinRecipeQueryParts(method, protein, starch ?? dish),
    joinRecipeQueryParts(cuisine, protein, sauce?.label, starch ?? dish),
    joinRecipeQueryParts(cuisine, protein, dish),
    ...((sauce?.aliases ?? []).map((alias) => joinRecipeQueryParts(protein, alias, starch ?? dish))),
    joinRecipeQueryParts(protein, dish),
    joinRecipeQueryParts(cuisine, exactName),
    ...buildSparseIngredientQueries({
      cuisine,
      dish,
      exactName,
      ingredientLabels: [...ownedIngredientLabels, ...missingIngredientLabels],
      method,
      protein,
      sauceLabel: sauce?.label,
      starch
    })
  ]);

  return Array.from(new Set([...explicitQueries, ...derivedCandidates])).slice(0, 5);
}

function buildSparseIngredientQueries({
  cuisine,
  dish,
  exactName,
  ingredientLabels,
  method,
  protein,
  sauceLabel,
  starch
}: {
  cuisine: string;
  dish?: string;
  exactName: string;
  ingredientLabels: string[];
  method?: string;
  protein?: string;
  sauceLabel?: string;
  starch?: string;
}) {
  if (ingredientLabels.length === 0 || ingredientLabels.length > 2) return [];

  const normalizedIngredients = ingredientLabels
    .map((label) => normalizePhrase(label))
    .filter((label) => label.length >= 3)
    .slice(0, 2);
  const leadIngredient = normalizedIngredients[0];
  const pair = normalizedIngredients.join(" ");

  return normalizeQueryList([
    joinRecipeQueryParts(cuisine, exactName),
    joinRecipeQueryParts(cuisine, pair),
    joinRecipeQueryParts(pair, dish),
    joinRecipeQueryParts(pair, starch ?? dish),
    joinRecipeQueryParts(protein, starch ?? dish, "plate"),
    joinRecipeQueryParts(method, pair, starch ?? dish),
    joinRecipeQueryParts(protein, sauceLabel, pair),
    joinRecipeQueryParts(leadIngredient, dish),
    joinRecipeQueryParts(leadIngredient, "dish")
  ]);
}

function isExplicitQueryTooGeneric(
  query: string,
  {
    dish,
    protein,
    starch
  }: {
    dish?: string;
    protein?: string;
    starch?: string;
  }
) {
  const normalized = normalizePhrase(query);
  if (!normalized || !protein) return false;

  const tokens = normalized.split(/\s+/).filter(Boolean);
  const hasProtein = normalized.includes(protein);
  const hasStarch = Boolean(starch && normalized.includes(starch));
  const hasDish = Boolean(dish && normalized.includes(dish));

  if (hasProtein) return false;
  if (starch && normalized === starch) return true;
  if (dish && normalized === dish) return true;
  if (hasStarch && tokens.length <= 2) return true;
  if (hasDish && tokens.length <= 2) return true;

  return false;
}

function detectLabel(value: string, patterns: Array<{ label: string; pattern: RegExp }>) {
  return patterns.find((entry) => entry.pattern.test(value))?.label;
}

function detectSauce(value: string) {
  return SAUCE_PATTERNS.find((entry) => entry.pattern.test(value));
}

function joinRecipeQueryParts(...parts: Array<string | undefined>) {
  return normalizePhrase(parts.filter(Boolean).join(" "));
}

function normalizeQueryList(values: Array<string | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => normalizePhrase(value ?? ""))
        .filter((value) => value.length >= 3)
    )
  );
}

function normalizePhrase(value: string) {
  return value
    .toLowerCase()
    .replace(/[_]/g, " ")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getIngredientLabel(value: unknown) {
  if (typeof value === "string") {
    return value.replace(/\s+-\s+.*$/, "").trim();
  }

  if (value && typeof value === "object") {
    const ingredient = value as { name?: unknown };
    return typeof ingredient.name === "string" ? ingredient.name.trim() : "";
  }

  return "";
}
