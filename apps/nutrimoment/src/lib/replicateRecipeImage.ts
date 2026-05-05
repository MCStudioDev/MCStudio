import { logger } from "@/lib/logger";
import { buildRecipePhotoIdentity } from "@/lib/recipePhotoIdentity";

export interface GeneratedRecipeImage {
  imageUrl: string;
  source: "generated";
  model: string;
}

interface ReplicatePrediction {
  error?: string | null;
  id?: string;
  output?: unknown;
  status?: string;
  urls?: {
    get?: string;
  };
}

const replicateApiToken = process.env.REPLICATE_API_TOKEN?.trim() ?? "";
const replicateModel = process.env.REPLICATE_IMAGE_MODEL?.trim() || "black-forest-labs/flux-schnell";
const replicateExtraInput = parseReplicateImageInput(process.env.REPLICATE_IMAGE_INPUT_JSON);
const REPLICATE_WAIT_SECONDS = 60;
const REPLICATE_POLL_ATTEMPTS = 6;
const REPLICATE_POLL_DELAY_MS = 1500;

interface DishVisualPrompt {
  englishName: string;
  visualDescription: string;
  plating: string;
  avoid: string;
  cuisineStyle?: string;
}

const DISH_VISUAL_PROMPTS: Record<string, DishVisualPrompt> = {
  hawawshi: {
    englishName: "Egyptian hawawshi",
    visualDescription:
      "a whole round Egyptian baladi flatbread that has been stuffed internally with a thin layer of minced beef, onions, green peppers, parsley, and warm spices, then baked flat until the bread is crispy, golden brown, blistered, and slightly oily. The bread is sliced into triangular quarters with the minced meat filling visible only at the cut edges, like real Egyptian hawawshi",
    plating:
      "served as flat crispy bread wedges on a simple plate, with small pickles, tahini sauce, and lemon wedges only if they fit the recipe",
    avoid:
      "burger bun, hamburger, open sandwich, pita pocket, shawarma wrap, tacos, pizza, quesadilla, cheese, pasta, rice bowl, kebab skewers, loose meatballs, thick bread loaf, random vegetables",
    cuisineStyle: "authentic Egyptian street food"
  },
  "macarona-bechamel": {
    englishName: "Egyptian macarona bechamel",
    visualDescription:
      "layered baked pasta casserole with minced meat and creamy bechamel, golden browned top crust, cut into a square slice so the pasta, meat layer, and bechamel are visible",
    plating: "served as one neat baked pasta square or casserole portion on a plain plate",
    avoid: "lasagna sheets, spaghetti bowl, red sauce pasta, soup, rice, kebab, sandwich, extra salad",
    cuisineStyle: "authentic Egyptian home cooking"
  },
  koshary: {
    englishName: "Egyptian koshary",
    visualDescription:
      "a bowl of rice, lentils, small pasta, chickpeas, tomato sauce, and crispy fried onions arranged in distinct visible layers",
    plating: "served in one Egyptian street-food bowl with tomato sauce and crispy onions on top",
    avoid: "plain rice, biryani, risotto, spaghetti-only pasta, meat, chicken, creamy sauce, soup",
    cuisineStyle: "authentic Egyptian street food"
  },
  kafta: {
    englishName: "Egyptian kofta kebab",
    visualDescription:
      "charred minced meat kofta shaped as long kebab fingers or skewers, browned and juicy with visible grill marks",
    plating: "served on a simple platter with minimal parsley and optional flatbread only if it fits the recipe",
    avoid: "meatballs in tomato sauce, burger patty, steak, pasta, spaghetti, soup, rice as the main subject",
    cuisineStyle: "authentic Egyptian or Middle Eastern grilled food"
  },
  mahshi: {
    englishName: "Egyptian mahshi",
    visualDescription:
      "stuffed vegetables filled with seasoned rice and herbs, such as bell peppers, zucchini, eggplant, or grape leaves, cooked until tender",
    plating: "served as arranged stuffed vegetables on one plate with the rice filling visible in at least one piece",
    avoid: "salad bowl, raw vegetables, pasta, kebab, burger, pizza, unrelated grilled meat",
    cuisineStyle: "authentic Egyptian home cooking"
  },
  shakshuka: {
    englishName: "Egyptian shakshuka",
    visualDescription:
      "eggs cooked in a rustic tomato and pepper sauce with onions and spices, with the eggs visible in the red sauce",
    plating: "served in a small skillet or shallow plate as one finished tomato egg dish",
    avoid: "plain omelette, boiled eggs, pasta, rice, pizza, soup, burger",
    cuisineStyle: "authentic Egyptian breakfast"
  },
  "ful-medames": {
    englishName: "Egyptian ful medames",
    visualDescription:
      "slow-cooked fava beans mashed lightly with olive oil, lemon, cumin, and small vegetable garnish, thick and hearty",
    plating: "served in one small bowl or deep plate with the fava beans as the clear main subject",
    avoid: "chickpea hummus, lentil soup, rice, pasta, meat stew, salad bowl",
    cuisineStyle: "authentic Egyptian breakfast"
  },
  "kebab-halla": {
    englishName: "Egyptian kebab halla",
    visualDescription:
      "tender beef cubes or lamb cubes braised with onions into a glossy brown Egyptian meat stew, no skewers",
    plating: "served as a rich meat stew portion on a plate or shallow bowl with the meat cubes clearly visible",
    avoid: "grilled kebab skewers, meatballs, burger, pasta, spaghetti, soup bowl, random vegetables",
    cuisineStyle: "authentic Egyptian home cooking"
  },
  "alexandrian-liver": {
    englishName: "Egyptian Alexandrian liver",
    visualDescription:
      "thin strips of sauteed beef liver with green peppers, garlic, chili, and spices, glossy and browned",
    plating: "served as a street-food plate or sandwich-style filling only if bread is part of the recipe",
    avoid: "steak, kebab, meatballs, pasta, rice bowl, soup, burger",
    cuisineStyle: "authentic Alexandrian Egyptian street food"
  },
  mujadara: {
    englishName: "mujadara lentils and rice",
    visualDescription:
      "lentils and rice cooked together, topped with crispy caramelized onions, earthy brown color and distinct onion topping",
    plating: "served in one simple bowl or plate with crispy onions clearly visible on top",
    avoid: "plain rice, biryani, koshary tomato sauce, pasta, meat, chicken, soup",
    cuisineStyle: "authentic Middle Eastern home cooking"
  },
  menemen: {
    englishName: "Turkish menemen",
    visualDescription:
      "soft scrambled eggs cooked with tomatoes, green peppers, and spices, rustic and slightly saucy",
    plating: "served in a small pan or shallow dish with egg and tomato clearly visible",
    avoid: "plain omelette, shakshuka with whole poached eggs, pasta, rice, burger, soup",
    cuisineStyle: "authentic Turkish breakfast"
  },
  "mercimek-corbasi": {
    englishName: "Turkish mercimek corbasi",
    visualDescription:
      "smooth golden red lentil soup with a silky texture, lightly garnished with chili oil or dried mint",
    plating: "served in one soup bowl with lemon wedge only if it fits the recipe",
    avoid: "bean stew, chunky vegetable soup, rice bowl, pasta, meat, salad",
    cuisineStyle: "authentic Turkish soup"
  },
  lahmacun: {
    englishName: "Turkish lahmacun",
    visualDescription:
      "thin round flatbread topped edge-to-edge with spiced minced meat, tomato, pepper, and herbs, baked crisp",
    plating: "served flat or slightly folded with lemon and parsley only if they fit the recipe",
    avoid: "pizza with cheese, thick bread, sandwich, kebab wrap, pasta, rice",
    cuisineStyle: "authentic Turkish bakery food"
  },
  "adana-kebab": {
    englishName: "Turkish Adana kebab",
    visualDescription:
      "long spicy minced lamb kebab grilled on flat skewers with char marks and a juicy texture",
    plating: "served on a simple kebab plate with minimal flatbread or grilled pepper only if they fit the recipe",
    avoid: "meatballs, burger, steak, pasta, soup, rice as the main subject",
    cuisineStyle: "authentic Turkish grilled food"
  },
  manti: {
    englishName: "Turkish manti",
    visualDescription:
      "small Turkish dumplings topped with yogurt sauce, red pepper butter, and dried mint",
    plating: "served in one shallow bowl with dumplings clearly visible under the sauce",
    avoid: "ravioli in tomato sauce, pasta spaghetti, soup, rice, kebab, burger",
    cuisineStyle: "authentic Turkish home cooking"
  },
  cilbir: {
    englishName: "Turkish cilbir",
    visualDescription:
      "poached eggs over thick garlicky yogurt with red pepper butter drizzled on top",
    plating: "served in a shallow bowl with the eggs and yogurt clearly visible",
    avoid: "plain boiled eggs, omelette, tomato shakshuka, pasta, rice, soup",
    cuisineStyle: "authentic Turkish breakfast"
  },
  "sarma-dolma": {
    englishName: "Turkish sarma and dolma",
    visualDescription:
      "neatly rolled grape leaves or stuffed vegetables filled with rice, herbs, and spices",
    plating: "served as compact rolls or stuffed vegetables arranged on one plate",
    avoid: "raw salad, pasta, kebab, burger, pizza, soup",
    cuisineStyle: "authentic Turkish home cooking"
  },
  karniyarik: {
    englishName: "Turkish karniyarik",
    visualDescription:
      "roasted eggplant split open and filled with minced meat, tomato, peppers, onions, and herbs",
    plating: "served as stuffed eggplant halves on one plate with the meat filling visible",
    avoid: "eggplant dip, pasta, rice bowl, kebab, burger, pizza",
    cuisineStyle: "authentic Turkish home cooking"
  }
};

export function isReplicateConfigured() {
  return Boolean(replicateApiToken && replicateModel);
}

export function getReplicateImageModel() {
  return replicateModel;
}

export async function generateRecipeImageWithReplicate(
  query: string,
  ingredients: string[] = [],
  options: { alternateDishNames?: string[] } = {}
): Promise<GeneratedRecipeImage | null> {
  if (!isReplicateConfigured()) return null;

  const input = buildReplicateImageInput(query, ingredients, options);
  logger.info("Replicate recipe image prompt prepared", {
    query,
    replicateModel,
    alternateDishNames: normalizeAlternateDishNames(options.alternateDishNames ?? []),
    ingredients: normalizePromptIngredients(ingredients),
    prompt: typeof input.prompt === "string" ? input.prompt : null
  });

  const prediction = await createReplicatePrediction({
    input,
    version: replicateModel
  });
  const completedPrediction = await waitForReplicatePrediction(prediction);
  const imageUrl = extractImageUrlFromPredictionOutput(completedPrediction.output);

  if (!imageUrl) {
    if (completedPrediction.error) {
      throw new Error(completedPrediction.error);
    }
    return null;
  }

  return {
    imageUrl,
    model: replicateModel,
    source: "generated"
  };
}

async function createReplicatePrediction(body: { input: Record<string, unknown>; version: string }) {
  const response = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: buildReplicateHeaders({
      "Cancel-After": "60s",
      Prefer: `wait=${REPLICATE_WAIT_SECONDS}`
    }),
    body: JSON.stringify(body)
  });

  const prediction = (await response.json().catch(() => null)) as ReplicatePrediction | null;
  if (!response.ok) {
    throw new Error(prediction?.error || `Replicate image generation failed with status ${response.status}.`);
  }
  if (!prediction) {
    throw new Error("Replicate image generation returned an empty response.");
  }
  return prediction;
}

async function waitForReplicatePrediction(initialPrediction: ReplicatePrediction) {
  if (isCompletedReplicatePrediction(initialPrediction)) {
    return initialPrediction;
  }

  const pollUrl = initialPrediction.urls?.get || (initialPrediction.id ? `https://api.replicate.com/v1/predictions/${initialPrediction.id}` : null);
  if (!pollUrl) {
    return initialPrediction;
  }

  let latestPrediction = initialPrediction;
  for (let attempt = 0; attempt < REPLICATE_POLL_ATTEMPTS; attempt += 1) {
    await sleep(REPLICATE_POLL_DELAY_MS);

    const response = await fetch(pollUrl, {
      headers: buildReplicateHeaders()
    });
    const nextPrediction = (await response.json().catch(() => null)) as ReplicatePrediction | null;

    if (!response.ok) {
      throw new Error(nextPrediction?.error || `Replicate prediction polling failed with status ${response.status}.`);
    }
    if (!nextPrediction) {
      throw new Error("Replicate prediction polling returned an empty response.");
    }

    latestPrediction = nextPrediction;
    if (isCompletedReplicatePrediction(latestPrediction)) {
      return latestPrediction;
    }
  }

  return latestPrediction;
}

function buildReplicateHeaders(extraHeaders?: Record<string, string>) {
  return {
    Authorization: `Bearer ${replicateApiToken}`,
    "Content-Type": "application/json",
    ...(extraHeaders ?? {})
  };
}

function buildReplicateImageInput(
  query: string,
  ingredients: string[],
  options: { alternateDishNames?: string[] } = {}
) {
  const baseInput = {
    aspect_ratio: "1:1",
    output_format: "jpg",
    output_quality: 70,
    prompt: buildRecipeImagePrompt(query, ingredients, options)
  };

  if (isFluxSchnellModel(replicateModel)) {
    return {
      ...baseInput,
      go_fast: true,
      megapixels: "1",
      num_inference_steps: 4,
      num_outputs: 1,
      ...replicateExtraInput
    };
  }

  return {
    ...baseInput,
    resolution: "1 MP",
    safety_tolerance: 2,
    ...replicateExtraInput
  };
}

function buildRecipeImagePrompt(
  query: string,
  ingredients: string[],
  options: { alternateDishNames?: string[] } = {}
) {
  const dish = query
    .replace(/\b(prepared food|food plated|food|recipe|dish|meal)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const identity = buildRecipePhotoIdentity(dish || query);
  const ingredientList = normalizePromptIngredients(ingredients);
  const alternateDishNames = normalizeAlternateDishNames(options.alternateDishNames ?? []);
  const alternateDishNameClause = buildAlternateDishNameClause(alternateDishNames);
  const curatedPrompt = buildCuratedDishImagePrompt(dish || query, ingredientList, identity, alternateDishNameClause);
  if (curatedPrompt) {
    return curatedPrompt;
  }

  const primarySubject = inferPrimaryVisualSubject(dish || query, ingredientList, identity);
  const supportStarches = ingredientList.filter((ingredient) =>
    /\b(rice|pasta|spaghetti|linguine|fettuccine|macaroni|vermicelli|bulgur|bread|pita|bun|potato|potatoes)\b/i.test(
      ingredient
    )
  );
  const ingredientClause = ingredientList.length
    ? `Use only ingredients that fit this recipe: ${ingredientList.join(", ")}.`
    : "Use only ingredients clearly implied by this exact recipe name.";
  const anchorClause = buildDishAnchorClause(identity, dish || query, primarySubject);
  const subjectClause = primarySubject
    ? `The hero subject must clearly be ${primarySubject}, centered and visually dominant in the plate.`
    : `The hero subject must clearly be ${dish || query}, centered and visually dominant in the plate.`;
  const starchClause = supportStarches.length
    ? `If ${supportStarches.join(", ")} appear, keep them as supporting elements and do not let them dominate the frame over the main dish.`
    : "Do not let secondary ingredients dominate the frame over the main dish.";
  const forbiddenIngredientClause = buildForbiddenIngredientClause(identity, ingredientList, supportStarches);
  const cuisineClause = buildCuisineAuthenticityClause(identity.cuisineKey);
  const servingClause = buildServingFormClause(identity.mealTypeKey, identity.starchKey, identity.cookingMethodKey);
  const compositionClause = buildCompositionClause(identity.mealTypeKey);

  return [
    `Create a photorealistic editorial food photograph of ${dish || query}.`,
    "The image must match this exact meal name and cuisine as closely as possible.",
    alternateDishNameClause,
    anchorClause,
    cuisineClause,
    servingClause,
    subjectClause,
    ingredientClause,
    starchClause,
    forbiddenIngredientClause,
    "Do not add extra side dishes, extra bowls, sauces, vegetables, herbs, garnishes, toppings, bread, drinks, utensils, or ingredients that are not part of the recipe.",
    "Show exactly one finished plated dish only, appetizing and realistic, with natural restaurant lighting.",
    "Do not show people, hands, packages, logos, labels, captions, text, or unrelated dishes.",
    compositionClause
  ].join(" ");
}

function buildCuratedDishImagePrompt(
  query: string,
  ingredients: string[],
  identity: ReturnType<typeof buildRecipePhotoIdentity>,
  alternateDishNameClause = ""
) {
  const visualPrompt = findDishVisualPrompt(identity);
  if (!visualPrompt) return null;

  const ingredientClause = ingredients.length
    ? `Recipe ingredient guardrail: only show ingredients that fit this recipe list: ${ingredients.join(", ")}.`
    : "Recipe ingredient guardrail: only show ingredients clearly implied by this exact dish.";
  const cuisineStyle = visualPrompt.cuisineStyle ?? "authentic regional cooking";
  const exactNameClause =
    query && query.toLowerCase() !== visualPrompt.englishName.toLowerCase()
      ? `The requested recipe name is "${query}"; keep the image faithful to that exact recipe while using the visual identity of ${visualPrompt.englishName}.`
      : `The requested recipe is ${visualPrompt.englishName}.`;

  return [
    `Create a photorealistic editorial food photograph of ${visualPrompt.englishName}.`,
    exactNameClause,
    alternateDishNameClause,
    `Visual description: ${visualPrompt.visualDescription}.`,
    `Plating: ${visualPrompt.plating}.`,
    `Style: ${cuisineStyle}, realistic food photography, natural restaurant lighting, appetizing but not exaggerated.`,
    ingredientClause,
    `Do not show or imply: ${visualPrompt.avoid}.`,
    "Do not add extra side dishes, extra bowls, sauces, vegetables, herbs, garnishes, toppings, bread, drinks, utensils, or ingredients unless they are explicitly part of the visual description or the recipe ingredient guardrail.",
    "Show exactly one finished plated dish only. No people, hands, packages, logos, labels, captions, text, or unrelated dishes.",
    "Use a clean tabletop background and a tight square composition with the plated food clearly framed for a recipe card."
  ].join(" ");
}

function findDishVisualPrompt(identity: ReturnType<typeof buildRecipePhotoIdentity>) {
  const keys = [
    identity.canonicalDishKey,
    identity.familyKey,
    identity.cleanQuery.toLowerCase().replace(/\s+/g, "-")
  ].filter(Boolean) as string[];

  for (const key of keys) {
    const visualPrompt = DISH_VISUAL_PROMPTS[key];
    if (visualPrompt) return visualPrompt;
  }

  return null;
}

function normalizePromptIngredients(ingredients: string[]) {
  return Array.from(
    new Set(
      ingredients
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
        .map((value) => value.replace(/\s+-\s+.*$/, "").trim())
    )
  ).slice(0, 10);
}

function normalizeAlternateDishNames(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => /[\u0600-\u06FF]/.test(value))
        .map((value) => value.replace(/\s+/g, " "))
    )
  ).slice(0, 3);
}

function buildAlternateDishNameClause(alternateDishNames: string[]) {
  if (!alternateDishNames.length) return "";
  return `Additional cultural name context only, not the main prompt language: ${alternateDishNames.join(", ")}. Use this to recognize the authentic dish, but follow the English visual description above.`;
}

function inferPrimaryVisualSubject(
  query: string,
  ingredients: string[],
  identity: ReturnType<typeof buildRecipePhotoIdentity>
) {
  const source = `${query} ${ingredients.join(" ")}`.toLowerCase();

  if (identity.canonicalDishKey) {
    return identity.canonicalDishKey.replace(/-/g, " ");
  }

  const explicitDishMatch =
    source.match(
      /\b(fried chicken|grilled chicken|roast chicken|chicken breast|chicken thigh|kofta|kebab|shawarma|shakshuka|koshary|lentil soup|chickpea salad|fish fillet|grilled fish|shrimp|prawns?|beef stew|meatballs?)\b/
    )?.[1] ?? "";
  if (explicitDishMatch) return explicitDishMatch;

  const proteinMatch =
    source.match(/\b(chicken|beef|lamb|fish|shrimp|prawn|egg|eggs|lentils?|chickpeas?)\b/)?.[1] ?? "";
  if (proteinMatch) return proteinMatch;

  const starchOnlyMatch =
    source.match(/\b(koshary|pasta|spaghetti|macarona bechamel|rice|bulgur|lentil soup|chickpea salad)\b/)?.[1] ?? "";
  return starchOnlyMatch || "";
}

function buildDishAnchorClause(
  identity: ReturnType<typeof buildRecipePhotoIdentity>,
  query: string,
  primarySubject: string
) {
  if (identity.canonicalDishKey) {
    const canonicalDish = identity.canonicalDishKey.replace(/-/g, " ");
    return `Visually anchor the dish to authentic real-world plating for ${canonicalDish}, not to a generic meal or a neighboring dish family.`;
  }

  if (identity.familyKey) {
    const family = identity.familyKey.replace(/-/g, " ");
    return `Keep the dish visually consistent with the real-world ${family} family and avoid drifting into a different dish family.`;
  }

  return `Keep the image tightly aligned to the exact named dish ${primarySubject || query} and do not reinterpret it as a different nearby meal.`;
}

function buildForbiddenIngredientClause(
  identity: ReturnType<typeof buildRecipePhotoIdentity>,
  ingredients: string[],
  supportStarches: string[]
) {
  const source = `${identity.cleanQuery} ${ingredients.join(" ")}`.toLowerCase();
  const forbiddenGroups: string[] = [];

  if (!supportStarches.some((value) => /\b(pasta|spaghetti|linguine|fettuccine|macaroni|vermicelli|noodle|noodles)\b/i.test(value))) {
    forbiddenGroups.push("spaghetti, pasta, noodles, vermicelli");
  }

  if (!supportStarches.some((value) => /\b(rice|pilaf|bulgur|couscous)\b/i.test(value)) && identity.starchKey !== "rice") {
    forbiddenGroups.push("plain rice, pilaf, couscous, bulgur");
  }

  if (!supportStarches.some((value) => /\b(bread|pita|bun|roll|toast)\b/i.test(value)) && identity.starchKey !== "bread") {
    forbiddenGroups.push("bread, toast, buns, pita");
  }

  if (!/\bsoup|stew|broth\b/i.test(source) && identity.mealTypeKey !== "soup" && identity.mealTypeKey !== "stew") {
    forbiddenGroups.push("a soup bowl or stew presentation");
  }

  if (!/\bsalad\b/i.test(source) && identity.mealTypeKey !== "salad") {
    forbiddenGroups.push("a salad-style presentation");
  }

  if (!forbiddenGroups.length) {
    return "Do not substitute the dish with a visually similar but incorrect meal.";
  }

  return `Do not show ${Array.from(new Set(forbiddenGroups)).join(", ")} unless they are explicitly part of this recipe.`;
}

function buildCuisineAuthenticityClause(cuisineKey?: string) {
  if (!cuisineKey || cuisineKey === "general") {
    return "Use plating, vessel choice, garnish level, and food styling that fit the dish naturally without borrowing visual cues from unrelated cuisines.";
  }

  const cuisineLabel = cuisineKey.replace(/-/g, " ");
  return `Use plating, vessel choice, garnish level, and food styling authentic to ${cuisineLabel} cuisine, and avoid borrowing presentation cues from unrelated cuisines.`;
}

function buildServingFormClause(
  mealTypeKey?: string,
  starchKey?: string,
  cookingMethodKey?: string
) {
  if (mealTypeKey === "soup" || mealTypeKey === "stew") {
    return "Serve it in an appropriate bowl for a soup or stew, with the liquid and solids matching the real dish.";
  }

  if (mealTypeKey === "salad") {
    return "Present it as a composed salad with realistic ingredient proportions and no unrelated side plate.";
  }

  if (mealTypeKey === "pasta" || starchKey === "pasta") {
    return "Present it as a pasta dish where the main sauce and protein are clearly visible on top of or integrated with the pasta, not buried underneath.";
  }

  if (starchKey === "rice" || mealTypeKey === "pilaf") {
    return "If rice is present, keep the protein or signature toppings clearly visible so the image reads as the full named dish, not just plain rice.";
  }

  if (cookingMethodKey === "fried" || cookingMethodKey === "grilled" || cookingMethodKey === "pan-seared") {
    return "Make the main cooked item visually obvious with realistic texture from the named cooking method.";
  }

  return "Present the dish in the serving style that best fits its real-world form and cuisine.";
}

function buildCompositionClause(mealTypeKey?: string) {
  if (mealTypeKey === "soup" || mealTypeKey === "salad") {
    return "Use a clean tabletop background and a tight square composition with the full bowl or plate clearly framed for a recipe card.";
  }

  return "Use a clean tabletop background and a tight square composition with the plated dish filling most of the frame for a recipe card.";
}

function extractImageUrlFromPredictionOutput(output: unknown): string | null {
  if (typeof output === "string") {
    return /^https?:\/\//i.test(output) ? output : null;
  }

  if (Array.isArray(output)) {
    for (const item of output) {
      const nestedUrl = extractImageUrlFromPredictionOutput(item);
      if (nestedUrl) return nestedUrl;
    }
    return null;
  }

  if (output && typeof output === "object") {
    for (const value of Object.values(output as Record<string, unknown>)) {
      const nestedUrl = extractImageUrlFromPredictionOutput(value);
      if (nestedUrl) return nestedUrl;
    }
  }

  return null;
}

function isCompletedReplicatePrediction(prediction: ReplicatePrediction) {
  return prediction.status === "succeeded" || prediction.status === "failed" || prediction.status === "canceled";
}

function parseReplicateImageInput(value: string | undefined) {
  if (!value?.trim()) return {};

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isFluxSchnellModel(model: string) {
  return /\bflux-schnell\b/i.test(model);
}
