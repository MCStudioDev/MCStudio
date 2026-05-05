import type { RecipeDishIntent } from "@/lib/types";
import { getCuisineVisualReferenceQueries } from "@/lib/cuisineVisualReferences";

interface RecipePhotoQueryInput {
  cuisine?: string;
  dishIntent?: RecipeDishIntent;
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
  { label: "mussels", pattern: /\bmussel|mussels\b/i },
  { label: "shrimp", pattern: /\bshrimp|prawn\b/i },
  { label: "salmon", pattern: /\bsalmon\b/i },
  { label: "fish", pattern: /\bfish|cod|tilapia|snapper|sea bass\b/i },
  { label: "ground meat", pattern: /\b(ground meat|minced meat|ground beef|beef mince|lamb mince|mince|minced beef|chopped meat)\b/i },
  { label: "beef", pattern: /\bbeef|steak|meat\b/i },
  { label: "lamb", pattern: /\blamb\b/i },
  { label: "tofu", pattern: /\btofu\b/i },
  { label: "chickpea", pattern: /\bchickpea\b/i },
  { label: "lentil", pattern: /\blentil\b/i }
];

const MEAT_FORM_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "meatballs", pattern: /\bmeatball|meatballs|kofte|kofta\b/i },
  { label: "kebab", pattern: /\bkebab|kabob|skewer|adana\b/i },
  { label: "stuffed bread", pattern: /\bhawawshi|stuffed bread|stuffed pita\b/i }
];

const SEAFOOD_FORM_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "grilled seafood", pattern: /\bgrilled|charred\b/i },
  { label: "fried seafood", pattern: /\bfried|crispy|breaded\b/i },
  { label: "seafood soup", pattern: /\bsoup|broth|tom yum|chowder\b/i },
  { label: "seafood pasta", pattern: /\bpasta|spaghetti|linguine|fettuccine\b/i },
  { label: "seafood rice", pattern: /\brice|pilaf\b/i },
  { label: "seafood sandwich", pattern: /\bsandwich|roll|sub|ekmek|bun\b/i },
  { label: "smoked seafood", pattern: /\bsmoked\b/i }
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
  { label: "tahini", aliases: ["sesame sauce"], pattern: /\btahini|sesame sauce\b/i },
  { label: "pesto", aliases: [], pattern: /\bpesto\b/i },
  { label: "soy garlic", aliases: ["garlic soy"], pattern: /\bsoy garlic|garlic soy|soy sauce\b/i },
  { label: "curry sauce", aliases: ["curry"], pattern: /\bcurry sauce|curry\b/i }
];

const METHOD_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "grilled", pattern: /\bgrilled|chargrilled\b/i },
  { label: "fried", pattern: /\bfried|crispy|breaded|crunchy\b/i },
  { label: "baked", pattern: /\bbaked\b/i },
  { label: "roasted", pattern: /\broasted\b/i },
  { label: "smoked", pattern: /\bsmoked\b/i },
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
  { label: "curry", pattern: /\bcurry\b/i },
  { label: "sandwich", pattern: /\bsandwich|roll|sub|ekmek\b/i }
];

export function buildRecipePhotoQueryCandidates(input: RecipePhotoQueryInput) {
  const dishIntentQueries = buildDishIntentQueries(input.dishIntent);
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
  const meatForm = detectLabel(context, MEAT_FORM_PATTERNS);
  const seafoodForm = detectLabel(context, SEAFOOD_FORM_PATTERNS);
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
  const heuristicQueries = buildCuisineIngredientHeuristicQueries({
    cuisine,
    dish,
    exactName,
    ingredientLabels: [...ownedIngredientLabels, ...missingIngredientLabels],
    meatForm,
    seafoodForm,
    method,
    protein,
    sauceLabel: sauce?.label,
    starch
  });
  const visualReferenceQueries = getCuisineVisualReferenceQueries(
    input.cuisine ?? "",
    [...ownedIngredientLabels, ...missingIngredientLabels]
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

  return Array.from(
    new Set([...explicitQueries, ...derivedCandidates, ...heuristicQueries, ...dishIntentQueries, ...visualReferenceQueries])
  ).slice(0, 5);
}

function buildDishIntentQueries(dishIntent?: RecipeDishIntent) {
  if (!dishIntent) return [];

  const dishName = normalizePhrase(dishIntent.dish_name);
  const cuisine = normalizePhrase(dishIntent.cuisine);
  const method = normalizePhrase(dishIntent.cooking_method);
  const diet = normalizePhrase(dishIntent.diet_type);
  const [leadVisual, secondVisual] = (dishIntent.visual_keywords ?? []).map((value) => normalizePhrase(value));

  return normalizeQueryList([
    joinRecipeQueryParts(dishName, cuisine, "food"),
    joinRecipeQueryParts(dishName, method, "plate"),
    joinRecipeQueryParts(cuisine, "traditional", dishName),
    joinRecipeQueryParts(cuisine, method, leadVisual || dishName),
    joinRecipeQueryParts(diet, cuisine, leadVisual || dishName),
    joinRecipeQueryParts(leadVisual, cuisine),
    joinRecipeQueryParts(secondVisual, cuisine)
  ]);
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

function buildCuisineIngredientHeuristicQueries({
  cuisine,
  dish,
  exactName,
  ingredientLabels,
  meatForm,
  seafoodForm,
  method,
  protein,
  sauceLabel,
  starch
}: {
  cuisine: string;
  dish?: string;
  exactName: string;
  ingredientLabels: string[];
  meatForm?: string;
  seafoodForm?: string;
  method?: string;
  protein?: string;
  sauceLabel?: string;
  starch?: string;
}) {
  const normalizedIngredients = ingredientLabels
    .map((label) => normalizePhrase(label))
    .filter((label) => label.length >= 3);
  const hasRice = normalizedIngredients.some((label) => /\brice\b/.test(label)) || starch === "rice";
  const hasPasta = normalizedIngredients.some((label) => /\bpasta|macaroni|macarona\b/.test(label)) || starch === "pasta";
  const hasLentils = normalizedIngredients.some((label) => /\blentil|lentils\b/.test(label)) || protein === "lentil";
  const hasChickpeas = normalizedIngredients.some((label) => /\bchickpea|chickpeas\b/.test(label)) || protein === "chickpea";
  const hasEgg = normalizedIngredients.some((label) => /\begg|eggs\b/.test(label)) || /\begg|eggs\b/.test(exactName);
  const hasYogurt =
    normalizedIngredients.some((label) => /\byogurt|labneh\b/.test(label)) || /\byogurt|labneh\b/.test(exactName);
  const hasTomato = normalizedIngredients.some((label) => /\btomato|tomatoes\b/.test(label)) || sauceLabel === "red sauce";
  const hasOnion = normalizedIngredients.some((label) => /\bonion|onions\b/.test(label));
  const hasBread = normalizedIngredients.some((label) => /\bbread|pita|flatbread\b/.test(label)) || starch === "bread";
  const hasEggplant = normalizedIngredients.some((label) => /\beggplant|aubergine\b/.test(label));
  const hasBellPepper = normalizedIngredients.some((label) => /\bbell pepper|pepper\b/.test(label));
  const hasPilaf = /\bpilaf\b/.test(exactName) || dish === "pilaf";
  const hasGroundMeat = protein === "ground meat";
  const hasMussels = protein === "mussels";
  const hasShrimp = protein === "shrimp";
  const hasFish = protein === "fish" || protein === "salmon";
  const isEgyptianLike = /\begyptian|middle eastern\b/.test(cuisine);
  const isTurkishLike = /\bturkish\b/.test(cuisine);

  const groundMeatQueries = hasGroundMeat
    ? buildCuisineGroundMeatQueries({
        cuisine,
        hasBellPepper,
        hasBread,
        hasEggplant,
        hasOnion,
        hasPasta,
        hasRice,
        hasTomato,
        meatForm,
        method
      })
    : [];
  const seafoodQueries = hasFish || hasShrimp || hasMussels
    ? buildCuisineSeafoodQueries({
        cuisine,
        dish,
        hasBread,
        hasFish,
        hasMussels,
        hasOnion,
        hasPasta,
        hasRice,
        hasShrimp,
        hasTomato,
        method,
        sauceLabel,
        seafoodForm
      })
    : [];

  if (!isEgyptianLike && !isTurkishLike) {
    return normalizeQueryList([...groundMeatQueries, ...seafoodQueries]);
  }

  return normalizeQueryList([
    ...groundMeatQueries,
    ...seafoodQueries,
    hasEgg && hasYogurt && !hasTomato ? "cilbir" : "",
    hasEgg && hasYogurt && !hasTomato ? "turkish poached eggs yogurt" : "",
    hasEgg && hasYogurt && !hasTomato ? "eggs with garlic yogurt" : "",
    hasRice && hasLentils ? "roz bel ads" : "",
    hasRice && hasLentils ? "mujadara" : "",
    hasRice && hasLentils ? "lentils and rice" : "",
    hasPasta && hasLentils ? "koshary egyptian dish" : "",
    hasPasta && hasLentils ? "macarona bel ads" : "",
    hasPasta && hasLentils ? "egyptian pasta lentils" : "",
    hasRice && hasChickpeas ? "chickpea rice pilaf" : "",
    hasRice && hasTomato && hasOnion && hasPilaf ? "egyptian rice pilaf" : "",
    hasRice && hasTomato && hasOnion && hasPilaf ? "tomato rice pilaf" : "",
    hasLentils && hasTomato && hasOnion && !hasRice && !hasPasta ? "egyptian lentil stew" : "",
    hasLentils && hasTomato && hasOnion && !hasRice && !hasPasta ? "lentil tomato stew" : "",
    isTurkishLike && hasGroundMeat ? "turkish kofte" : "",
    isTurkishLike && hasGroundMeat ? "izgara kofte" : "",
    isTurkishLike && hasGroundMeat && hasTomato ? "adana kebab" : "",
    isTurkishLike && hasEgg && hasYogurt && !hasTomato ? "cilbir turkish breakfast" : "",
    joinRecipeQueryParts(cuisine, exactName),
    joinRecipeQueryParts(method, protein, sauceLabel, starch ?? dish),
    joinRecipeQueryParts(protein, sauceLabel, starch ?? dish)
  ]);
}

function buildCuisineGroundMeatQueries({
  cuisine,
  hasBellPepper,
  hasBread,
  hasEggplant,
  hasOnion,
  hasPasta,
  hasRice,
  hasTomato,
  meatForm,
  method
}: {
  cuisine: string;
  hasBellPepper: boolean;
  hasBread: boolean;
  hasEggplant: boolean;
  hasOnion: boolean;
  hasPasta: boolean;
  hasRice: boolean;
  hasTomato: boolean;
  meatForm?: string;
  method?: string;
}) {
  const isEgyptianLike = /\begyptian\b/.test(cuisine);
  const isTurkishLike = /\bturkish\b/.test(cuisine);
  const isMiddleEasternLike = /\bmiddle eastern|mediterranean|levantine\b/.test(cuisine);

  return normalizeQueryList([
    isEgyptianLike && hasBread ? "egyptian hawawshi stuffed bread" : "",
    isEgyptianLike && hasBread ? "hawawshi meat stuffed baladi bread" : "",
    isEgyptianLike && !hasBread ? "egyptian kofta" : "",
    isEgyptianLike && !hasBread ? "kofta kebab egyptian" : "",
    isEgyptianLike && !hasBread ? "egyptian meatballs" : "",
    isEgyptianLike && hasPasta ? "macarona bechamel egyptian pasta bake" : "",
    isEgyptianLike && hasEggplant ? "egyptian moussaka" : "",
    isEgyptianLike && hasBellPepper && hasRice ? "mahshi bell peppers egyptian" : "",
    isTurkishLike ? "turkish kofte" : "",
    isTurkishLike ? "izgara kofte" : "",
    isTurkishLike ? "turkish meatballs" : "",
    isTurkishLike && (hasTomato || meatForm === "kebab" || method === "grilled") ? "adana kebab" : "",
    isTurkishLike ? "turkish kebab platter" : "",
    isMiddleEasternLike ? "kofta kebab" : "",
    isMiddleEasternLike ? "middle eastern kofta" : "",
    isMiddleEasternLike && hasRice ? "kofta rice plate" : "",
    !isEgyptianLike && !isTurkishLike && !isMiddleEasternLike && hasOnion ? "meatball kebab plate" : "",
    !isEgyptianLike && !isTurkishLike && !isMiddleEasternLike ? joinRecipeQueryParts(cuisine, "meatballs") : ""
  ]);
}

function buildCuisineSeafoodQueries({
  cuisine,
  dish,
  hasBread,
  hasFish,
  hasMussels,
  hasOnion,
  hasPasta,
  hasRice,
  hasShrimp,
  hasTomato,
  method,
  sauceLabel,
  seafoodForm
}: {
  cuisine: string;
  dish?: string;
  hasBread: boolean;
  hasFish: boolean;
  hasMussels: boolean;
  hasOnion: boolean;
  hasPasta: boolean;
  hasRice: boolean;
  hasShrimp: boolean;
  hasTomato: boolean;
  method?: string;
  sauceLabel?: string;
  seafoodForm?: string;
}) {
  const isEgyptianLike = /\begyptian\b/.test(cuisine);
  const isMediterraneanLike = /\bmediterranean|middle eastern\b/.test(cuisine);
  const isItalianLike = /\bitalian\b/.test(cuisine);
  const isIndianLike = /\bindian\b/.test(cuisine);
  const isMexicanLike = /\bmexican\b/.test(cuisine);
  const isAsianLike = /\basian\b/.test(cuisine);
  const isThaiLike = /\bthai\b/.test(cuisine);
  const isTurkishLike = /\bturkish\b/.test(cuisine);

  return normalizeQueryList([
    isEgyptianLike && hasFish && hasRice ? "sayadeya egyptian fish rice" : "",
    isEgyptianLike && hasFish ? "egyptian fish rice" : "",
    isMediterraneanLike && hasFish && (method === "grilled" || seafoodForm === "grilled seafood") ? "grilled mediterranean fish" : "",
    isMediterraneanLike && hasFish ? "baked white fish mediterranean" : "",
    isMediterraneanLike && hasFish && sauceLabel === "tahini" ? "samak bil tahini" : "",
    isMediterraneanLike && hasFish && sauceLabel === "tahini" ? "fish tahini plate" : "",
    isMediterraneanLike && hasShrimp && sauceLabel === "tahini" ? "shrimp tahini plate" : "",
    isMediterraneanLike && hasShrimp && sauceLabel === "tahini" ? "middle eastern shrimp tahini" : "",
    isMediterraneanLike && hasShrimp && hasPasta && sauceLabel !== "tahini" ? "garlic shrimp pasta" : "",
    isMediterraneanLike && hasShrimp && hasPasta && sauceLabel !== "tahini" ? "shrimp linguine mediterranean" : "",
    isItalianLike && hasShrimp && hasPasta && sauceLabel !== "tahini" ? "shrimp linguine" : "",
    isItalianLike && hasShrimp && sauceLabel === "white sauce" ? "creamy shrimp pasta" : "",
    isItalianLike && hasShrimp && sauceLabel !== "white sauce" && sauceLabel !== "tahini" ? "garlic shrimp spaghetti" : "",
    isIndianLike && hasFish ? "indian fish curry" : "",
    isIndianLike && hasFish && hasRice ? "fish curry with rice" : "",
    isMexicanLike && hasShrimp ? "camarones al ajo" : "",
    isMexicanLike && hasShrimp && hasRice ? "garlic shrimp rice plate" : "",
    isAsianLike && hasShrimp && seafoodForm === "seafood soup" ? "shrimp noodle soup" : "",
    isAsianLike && hasShrimp && sauceLabel !== "tahini" ? "garlic honey shrimp" : "",
    isAsianLike && hasFish && seafoodForm === "seafood soup" ? "fish soup asian" : "",
    isThaiLike && hasShrimp && seafoodForm === "seafood soup" ? "tom yum goong" : "",
    isThaiLike && hasShrimp && (hasRice || seafoodForm === "seafood rice") ? "thai garlic shrimp" : "",
    isThaiLike && hasShrimp && sauceLabel === "curry sauce" ? "thai shrimp curry" : "",
    isTurkishLike && hasFish && hasBread ? "balik ekmek" : "",
    isTurkishLike && hasFish ? "turkish grilled fish" : "",
    hasMussels ? joinRecipeQueryParts(cuisine, "mussels plate") : "",
    hasMussels && seafoodForm === "seafood soup" ? joinRecipeQueryParts(cuisine, "mussels soup") : "",
    hasMussels && sauceLabel === "tahini" ? joinRecipeQueryParts(cuisine, "mussels tahini plate") : "",
    hasFish && seafoodForm === "smoked seafood" ? joinRecipeQueryParts(cuisine, "smoked fish") : "",
    hasShrimp && seafoodForm === "fried seafood" ? joinRecipeQueryParts(cuisine, "fried shrimp") : "",
    hasShrimp && hasPasta && sauceLabel !== "tahini" ? joinRecipeQueryParts(cuisine, "shrimp pasta") : "",
    hasFish && hasRice ? joinRecipeQueryParts(cuisine, "fish rice") : "",
    hasFish && hasBread ? joinRecipeQueryParts(cuisine, "fish sandwich") : "",
    hasFish && hasOnion && hasTomato ? joinRecipeQueryParts(cuisine, "fish stew") : "",
    hasShrimp && hasOnion && hasTomato ? joinRecipeQueryParts(cuisine, "shrimp plate") : "",
    hasMussels ? joinRecipeQueryParts(method, "mussels", dish) : "",
    hasFish ? joinRecipeQueryParts(method, "fish", dish) : "",
    hasShrimp ? joinRecipeQueryParts(method, "shrimp", starchOrSeafoodDish(hasPasta, hasRice, dish)) : ""
  ]);
}

function starchOrSeafoodDish(hasPasta: boolean, hasRice: boolean, dish?: string) {
  if (hasPasta) return "pasta";
  if (hasRice) return "rice";
  return dish;
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

function normalizePhrase(value: unknown) {
  if (typeof value !== "string") return "";

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
