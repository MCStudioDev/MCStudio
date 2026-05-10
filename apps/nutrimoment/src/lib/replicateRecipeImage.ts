import { logger } from "@/lib/logger";
import { getDishById } from "@/lib/cuisineCatalogs/completeCatalogs";
import { buildRecipePhotoIdentity, getStrictRecipePhotoIdentityTokens, isStrictRecipePhotoIdentity } from "@/lib/recipePhotoIdentity";

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
const REPLICATE_WAIT_SECONDS = 40;
const REPLICATE_CANCEL_AFTER_SECONDS = 55;
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
      "a whole round Egyptian baladi flatbread or pita pocket stuffed internally with a thin layer of seasoned ground beef, onion, garlic, green pepper, hot pepper, parsley, tomato paste, and warm spices only when listed, then baked flat until the bread is crispy, golden brown, blistered, and slightly oily. The bread is sliced into triangular quarters or pita halves with the minced meat filling visible only at the cut edges, like real Egyptian hawawshi",
    plating:
      "served as flat crispy bread wedges on a simple plate, with small pickles, tahini sauce, and lemon wedges only if they fit the recipe",
    avoid:
      "burger bun, hamburger, open sandwich, pita pocket, shawarma wrap, tacos, pizza, quesadilla, cheese, pasta, rice bowl, kebab skewers, loose meatballs, thick bread loaf, random vegetables",
    cuisineStyle: "authentic Egyptian street food"
  },
  "macarona-bechamel": {
    englishName: "Egyptian macarona bechamel",
    visualDescription:
      "layered Egyptian baked pasta casserole with short pasta, a browned minced-meat layer, and creamy white bechamel, golden browned top crust, cut into a square slice so the pasta, meat layer, and bechamel are visible",
    plating: "served as one neat baked pasta square or casserole portion on a plain plate, with visible layers and a browned bechamel top",
    avoid: "lasagna sheets, spaghetti bowl, red sauce pasta, grilled kofta, meatballs in tomato sauce, soup, rice, kebab, sandwich, extra salad",
    cuisineStyle: "authentic Egyptian home cooking"
  },
  "ground-beef-penne": {
    englishName: "one-pan ground beef penne",
    visualDescription:
      "short penne pasta coated in a red tomato meat sauce with small browned crumbles of ground beef distributed through the sauce, glossy and skillet-style, with the penne tubes clearly visible and the ground meat visibly minced rather than sliced",
    plating:
      "served as one close recipe-card bowl or shallow skillet portion of penne and ground beef sauce; cheese or herbs only if they are listed in the recipe",
    avoid:
      "steak, beef strips, beef cubes, meatballs, burger patty, kofta, kebab, spaghetti, lasagna sheets, creamy white sauce, plain pasta, rice, bread, unrelated vegetables, extra side dishes",
    cuisineStyle: "weeknight American or Italian-American home cooking"
  },
  "ground-beef-pasta": {
    englishName: "ground beef pasta skillet",
    visualDescription:
      "small pasta such as elbow macaroni or short tubes cooked in a red tomato sauce with browned crumbled ground beef, diced zucchini or bell pepper only when listed, and a light melted mozzarella finish only when cheese is listed",
    plating:
      "served as one stovetop skillet-style pasta bowl where the pasta, red sauce, and crumbled beef are all visible; no separate side dishes",
    avoid:
      "steak, beef strips, beef cubes, meatballs, burger patty, kofta, kebab, spaghetti-only plate, lasagna, creamy white sauce, rice, bread, salad, unrelated vegetables",
    cuisineStyle: "weeknight American comfort food"
  },
  "hamburger-stew": {
    englishName: "hamburger stew",
    visualDescription:
      "a thick tomato-broth stew with visible browned crumbles of ground beef, cubed potatoes, sliced carrots, celery, onion, and tomato pieces only when those ingredients are listed; hearty spoonable texture, not a smooth soup",
    plating:
      "served in one deep bowl with the ground beef crumbles and chunky vegetables visible at the surface; no bread or cheese unless listed",
    avoid:
      "beef cubes, steak, roast beef, meatballs, burger patty, pasta, noodles, rice bowl, creamy soup, chili, smooth tomato soup, random side dishes",
    cuisineStyle: "American homestyle stew"
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
    englishName: "kofta kebab",
    visualDescription:
      "charred ground/minced meat kofta or kofte shaped as long kebab fingers, oval logs, or skewers, browned and juicy with visible grill marks and a fine minced-meat texture. The meat must look like compressed ground meat, not cubes, diced beef, chopped steak, or sliced meat",
    plating: "served on a simple platter with minimal parsley and optional flatbread only if it fits the recipe",
    avoid: "meatballs in tomato sauce, burger patty, steak, beef cubes, diced meat, chopped steak, sliced meat, pasta, spaghetti, soup, rice as the main subject",
    cuisineStyle: "authentic Egyptian, Turkish, or Middle Eastern grilled food"
  },
  "rice-kofta": {
    englishName: "Egyptian rice kofta",
    visualDescription:
      "deep-fried Egyptian rice kofta made from minced meat, crushed rice, parsley, dill, cilantro, onion, garlic, cumin, and coriander only when listed, shaped as medium fingers or oval balls, browned and crunchy, then simmered in a red tomato-garlic sauce",
    plating:
      "served in one shallow bowl or plate with red sauce around the kofta pieces; white rice, pasta, or bread only if listed",
    avoid:
      "grilled skewer kofta, kebab logs, burger patty, steak, beef cubes, pasta bed unless listed, plain rice bowl unless listed, dry meatballs without red sauce",
    cuisineStyle: "authentic Egyptian home cooking"
  },
  "dawood-basha": {
    englishName: "Egyptian Dawood Basha",
    visualDescription:
      "small round minced-meat kofta meatballs simmered in a red tomato-onion sauce with garlic and warm spices only when listed, glossy saucy surface, clearly meatballs and not grilled skewers or loose ground beef",
    plating:
      "served in one shallow bowl or plate with the red sauce around the small meatballs; rice may appear only if listed in the recipe and must not hide the meatballs",
    avoid:
      "grilled kofta skewers, kebab logs, burger patty, steak, beef cubes, loose minced meat, pasta, bechamel, bread sandwich, dry meatballs without sauce",
    cuisineStyle: "authentic Egyptian home cooking"
  },
  "taagen-kofta": {
    englishName: "Egyptian taagen kofta",
    visualDescription:
      "baked Egyptian kofta tray with shaped minced-meat kofta pieces cooked in red tomato sauce, often with potato slices, onion, garlic, pepper, or herbs only when listed; saucy oven-baked look, not a dry grill platter",
    plating:
      "served in or from a shallow oven tray or tagine-style dish with kofta pieces visible above the sauce and potatoes only if listed",
    avoid:
      "burger patty, steak, beef cubes, loose minced meat, spaghetti, macarona bechamel, grilled kebab platter, sandwich, plain rice bowl",
    cuisineStyle: "authentic Egyptian home cooking"
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
      "pan-fried sliced liver organ meat, cut into irregular strips or small 2-inch-ish pieces, dark brown and glossy, mixed with chopped green or red bell pepper, garlic, cumin, onion, lemon, and light parsley only when those ingredients are in the recipe; clearly recognizable as liver/kebda rather than beef steak, beef cubes, kofta, or generic meat pieces",
    plating:
      "served as one tight Alexandrian street-food plate, or sandwich-style filling only if bread is part of the recipe, or with rice only if rice is listed; no pasta bed, no noodles",
    avoid:
      "steak, beef strips, beef cubes, kebab, meatballs, chicken, fish, pate, paste, fried balls, pasta, spaghetti, noodles, rice, rice bowl, couscous, pilaf, soup, burger, plain grains, egg, yellow sauce",
    cuisineStyle: "authentic Alexandrian Egyptian street food"
  },
  "kebda-chermoula": {
    englishName: "North African kebda chermoula",
    visualDescription:
      "lamb liver pieces browned first, then coated or simmered in a red spiced chermoula-style sauce with garlic, caraway, paprika, cayenne, tomato paste, olive oil, and parsley only when listed; liver pieces remain clearly visible through the sauce",
    plating:
      "served as a saucy North African liver appetizer or side dish in a shallow plate or small pan; bread for dipping only if bread is listed",
    avoid:
      "plain steak, beef cubes, kofta, kebab, meatballs, chicken, fish, pate, paste, fried balls, creamy sauce, yellow curry, pasta, noodles, rice bed, burger, egg",
    cuisineStyle: "authentic Algerian or North African liver in chermoula sauce"
  },
  "moroccan-kebda": {
    englishName: "Moroccan kebda liver strips",
    visualDescription:
      "pan-browned liver strips or small pieces marinated with olive oil, garlic, coriander or cilantro, Moroccan liver spices, and lemon; dark glossy liver with green herb flecks, not steak or generic meat",
    plating:
      "served as a Moroccan liver plate with lemon wedges and Moroccan bread only when those ingredients are listed; liver remains the main subject",
    avoid:
      "beef steak, beef strips, beef cubes, kofta, kebab, meatballs, chicken, fish, pate, paste, fried balls, pasta, noodles, rice bowl, burger, egg",
    cuisineStyle: "authentic Moroccan home cooking"
  },
  "moroccan-liver-stew": {
    englishName: "Moroccan Kebda Mchermla liver stew",
    visualDescription:
      "Moroccan liver cubes or chunks cooked in a red tomato-based stew with onion, parsley, coriander or cilantro, olive oil, turmeric, paprika, and chili only when listed; the liver pieces must remain visible in the sauce",
    plating:
      "served as a red Moroccan liver stew in a shallow dish or oven dish; bread, rice, or salad may appear only if listed in the recipe",
    avoid:
      "plain steak, dry beef cubes, kofta, kebab, meatballs, chicken, fish, pate, paste, fried balls, creamy sauce, yellow curry, pasta, noodles, burger, egg",
    cuisineStyle: "authentic Moroccan Kebda Mchermla"
  },
  "kebda-bel-rada": {
    englishName: "Kebda Bel Rada fried bran liver",
    visualDescription:
      "deep-fried sliced liver pieces coated in wheat bran, crisp brown irregular slices with parsley, clearly liver slices and not balls, nuggets, patties, or fried chicken",
    plating:
      "served as one plate of crisp bran-coated liver slices, with parsley and lemon only when listed",
    avoid:
      "pate, paste, fried balls, croquettes, nuggets, chicken tenders, kofta, kebab, meatballs, steak, beef cubes, pasta, rice, burger, egg",
    cuisineStyle: "traditional Arabic or Egyptian fried liver"
  },
  "egyptian-liver-sandwiches": {
    englishName: "Egyptian kebda liver sandwiches",
    visualDescription:
      "small chopped liver pieces sauteed with peppers, onions, chilies, garlic, herbs, cumin, coriander, and vinegar, stuffed into long bread or rolls with tahini sauce only when listed",
    plating:
      "served as stuffed Egyptian street-food liver sandwiches with the chopped liver filling visible at the opening; no separate random plate unless the recipe is not a sandwich",
    avoid:
      "burger patty, steak sandwich, shawarma slices, kofta, kebab, meatballs, chicken, fish, pate, fried balls, pasta, rice bowl, egg",
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
      "very thin round Turkish flatbread topped edge-to-edge with a finely minced spiced meat mixture of ground meat, tomato, pepper, onion, and herbs only when listed, baked crisp with almost no thick crust",
    plating: "served flat or slightly folded with lemon and parsley only if they fit the recipe",
    avoid: "pizza with cheese, boat-shaped pide, thick bread, sandwich, kebab wrap, pasta, rice",
    cuisineStyle: "authentic Turkish bakery food"
  },
  "lahm-ajin": {
    englishName: "lahm bi ajin",
    visualDescription:
      "thin Middle Eastern flatbread topped edge-to-edge with a finely minced meat mixture, tomato, pepper, onion, parsley, and warm spices only when listed; the topping must look like spread minced meat, not beef cubes, steak pieces, sausage slices, or loose chunks",
    plating:
      "served as one thin round or oval meat flatbread, whole or cut into simple wedges, with lemon, parsley, or pickles only if they are listed or culturally implied by the exact recipe name",
    avoid:
      "pizza cheese, boat-shaped pide, burger, kebab cubes, steak pieces, shawarma strips, pasta, rice, thick bread loaf, unrelated salad, extra sauces",
    cuisineStyle: "authentic Levantine or Armenian bakery food"
  },
  "kiymali-pide": {
    englishName: "Turkish kiymali pide",
    visualDescription:
      "oval boat-shaped Turkish flatbread with folded raised edges and pointed ends, topped with a thin layer of ground beef or lamb mixed with onion, tomato, green pepper, and parsley only when listed, baked until the crust is golden and crisp",
    plating:
      "served as a whole boat-shaped pide or cut into long slices on a board or plate; salad, yogurt drink, egg, or cheese only if listed",
    avoid:
      "round lahmacun, pizza with cheese, pita pocket, sandwich, burger, kofta skewers, pasta, rice, thick bread loaf, loose meat sauce",
    cuisineStyle: "authentic Turkish bakery food"
  },
  "adana-kebab": {
    englishName: "Turkish Adana kebab",
    visualDescription:
      "long spicy ground/minced lamb or beef kebab molded tightly around flat skewers with char marks and a juicy fine-ground texture. The kebab surface should look like compressed minced meat paste with ridges, never beef cubes, diced meat, chopped steak, or sliced pieces",
    plating: "served on a simple kebab plate with minimal flatbread or grilled pepper only if they fit the recipe",
    avoid: "meatballs, burger, steak, beef cubes, diced meat, chopped steak pieces, sliced beef, shawarma strips, kebab cubes, pasta, soup, rice as the main subject",
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
      "whole eggplants roasted or fried until soft, split lengthwise down the center and generously filled with browned minced meat, tomato, onion, green pepper, and parsley only when listed, with the eggplant halves still intact and recognizable",
    plating: "served as stuffed eggplant halves on one plate or shallow tray with the meat filling visible in the slit",
    avoid: "eggplant dip, layered moussaka casserole, pasta, rice bowl, kebab, burger, pizza, plain beef sauce",
    cuisineStyle: "authentic Turkish home cooking"
  },
  "turkish-spiral-borek": {
    englishName: "Turkish spiral borek with ground beef",
    visualDescription:
      "golden flaky phyllo pastry rolled into a large spiral coil and filled with spiced ground beef, onion, paprika, cumin, black pepper, and parsley only when listed; crisp browned top with visible coiled pastry rings",
    plating:
      "served as a round spiral borek, whole or sliced into wedges, with yogurt only if listed",
    avoid:
      "flatbread, pide, lahmacun, pizza, pie crust, pasta, rice, burger, kofta skewers, loose meat filling without pastry",
    cuisineStyle: "authentic Turkish savory pastry"
  },
  "turkish-musakka": {
    englishName: "Turkish eggplant and ground beef musakka",
    visualDescription:
      "layered Turkish eggplant and ground beef casserole with fried eggplant slices, tomato sauce, browned ground beef, peppers, and a golden bechamel or cheese top only when listed",
    plating:
      "served as a square or spooned casserole portion with eggplant layers and crumbled beef visible",
    avoid:
      "stuffed whole eggplant, karniyarik, eggplant dip, pasta, rice bowl, kebab, burger, Greek-style decorative moussaka if the recipe is Turkish",
    cuisineStyle: "authentic Turkish home cooking"
  },
  sayadeya: {
    englishName: "Egyptian sayadeya",
    visualDescription:
      "Egyptian fish served with spiced brown onion rice, with the fish clearly visible as fried or seared pieces or a whole fish beside or over the rice. The rice should look seasoned and caramelized from onions, not plain white rice",
    plating:
      "served as one Egyptian fish-and-rice plate, with fish as the clear main subject and rice only if rice is listed in the recipe",
    avoid: "plain white rice, chicken rice, beef rice, generic seafood platter, pasta, noodles, sushi, salad bowl, unrelated vegetables",
    cuisineStyle: "authentic Alexandrian Egyptian seafood"
  },
  "seafood-sayadeya": {
    englishName: "Egyptian seafood sayadeya",
    visualDescription:
      "Egyptian seafood rice with shrimp, fish pieces, or mixed seafood clearly visible over spiced brown onion rice, optionally with tahini or lemon only when listed",
    plating:
      "served as one seafood-and-rice plate or shallow platter, with seafood visible and not buried under the rice",
    avoid: "plain rice, paella pan if not requested, pasta, noodles, chicken, beef, generic mixed grill, hidden seafood",
    cuisineStyle: "authentic Alexandrian Egyptian seafood"
  },
  "samak-singari": {
    englishName: "Egyptian samak singari",
    visualDescription:
      "a whole butterflied fish, commonly bouri or mullet, split open lengthwise and grilled or baked flat with a vivid topping of tomato, onion, pepper, garlic, herbs, lemon, and olive oil only when those ingredients are listed. The open butterflied fish shape must be obvious",
    plating:
      "served as one whole butterflied fish on a platter, skin or charred edges visible, with the stuffing or topping spread inside the opened fish",
    avoid: "fish fillet cubes, generic grilled fillet, fish sticks, sushi, pasta, rice bed, chicken, beef, shellfish-only plate",
    cuisineStyle: "authentic Egyptian coastal seafood"
  },
  "egyptian-fish-tagine": {
    englishName: "Egyptian fish tagine",
    visualDescription:
      "fish baked in a rustic Egyptian oven dish with tomato, onion, pepper, garlic, lemon, herbs, olives, potato slices, or sauce only when listed in the recipe. The fish should appear as pieces or a whole fish in a baked tray, not as a plain fillet",
    plating:
      "served in or from a shallow baked tray or clay-style dish, with fish clearly visible among the listed vegetables or potatoes",
    avoid: "plain steamed fish, sushi, pasta, rice bed, chicken, beef, generic soup, unrelated vegetable medley",
    cuisineStyle: "authentic Egyptian home-style baked fish"
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
  options: { alternateDishNames?: string[]; exactRecipeName?: string } = {}
): Promise<GeneratedRecipeImage | null> {
  if (!isReplicateConfigured()) return null;

  const input = buildReplicateImageInput(query, ingredients, options);
  logger.info("Replicate recipe image prompt prepared", {
    query,
    exactRecipeName: options.exactRecipeName ?? null,
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
      "Cancel-After": `${REPLICATE_CANCEL_AFTER_SECONDS}s`,
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
  options: { alternateDishNames?: string[]; exactRecipeName?: string } = {}
) {
  const normalizedIngredients = normalizePromptIngredients(ingredients);
  const baseInput = {
    aspect_ratio: "1:1",
    output_format: "jpg",
    output_quality: 70,
    prompt: buildRecipeImagePrompt(query, normalizedIngredients, options),
    negative_prompt: buildRecipeImageNegativePrompt(query, normalizedIngredients)
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
  options: { alternateDishNames?: string[]; exactRecipeName?: string } = {}
) {
  const dish = query
    .replace(/\b(prepared food|food plated|food|recipe|dish|meal)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const identity = buildRecipePhotoIdentity(dish || query);
  const ingredientList = normalizePromptIngredients(ingredients);
  const alternateDishNames = normalizeAlternateDishNames(options.alternateDishNames ?? []);
  const alternateDishNameClause = buildAlternateDishNameClause(alternateDishNames);
  const exactCardIdentityClause = buildExactCardIdentityClause(options.exactRecipeName, dish || query);
  const curatedPrompt = buildCuratedDishImagePrompt(dish || query, ingredientList, identity, alternateDishNameClause, exactCardIdentityClause);
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
    ? buildStrictIngredientWhitelistClause(ingredientList, identity, dish || query)
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
  const strictVisualClause = buildStrictVisualClause(identity, ingredientList);

  return [
    `Create a photorealistic editorial food photograph of ${dish || query}.`,
    exactCardIdentityClause,
    "The image must match this exact meal name and cuisine as closely as possible.",
    alternateDishNameClause,
    anchorClause,
    cuisineClause,
    servingClause,
    subjectClause,
    ingredientClause,
    starchClause,
    forbiddenIngredientClause,
    strictVisualClause,
    "If an ingredient, base, side, garnish, sauce, topping, grain, pasta, bread, noodle, vegetable, meat, cheese, or herb is not in the whitelist, it must not appear anywhere in the image.",
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
  alternateDishNameClause = "",
  exactCardIdentityClause = ""
) {
  const visualPrompt = findDishVisualPrompt(identity);
  if (!visualPrompt) return null;

  const ingredientClause = ingredients.length
    ? buildStrictIngredientWhitelistClause(ingredients, identity, query)
    : "Recipe ingredient guardrail: only show ingredients clearly implied by this exact dish.";
  const cuisineStyle = visualPrompt.cuisineStyle ?? "authentic regional cooking";
  const exactNameClause =
    query && query.toLowerCase() !== visualPrompt.englishName.toLowerCase()
      ? `The requested recipe name is "${query}"; keep the image faithful to that exact recipe while using the visual identity of ${visualPrompt.englishName}.`
      : `The requested recipe is ${visualPrompt.englishName}.`;
  const strictVisualClause = buildStrictVisualClause(identity, ingredients);

  return [
    `Create a photorealistic editorial food photograph of ${visualPrompt.englishName}.`,
    exactCardIdentityClause,
    exactNameClause,
    alternateDishNameClause,
    `Visual description: ${visualPrompt.visualDescription}.`,
    `Plating: ${visualPrompt.plating}.`,
    `Style: ${cuisineStyle}, realistic food photography, natural restaurant lighting, appetizing but not exaggerated.`,
    ingredientClause,
    `Do not show or imply: ${visualPrompt.avoid}.`,
    strictVisualClause,
    "If an ingredient, base, side, garnish, sauce, topping, grain, pasta, bread, noodle, vegetable, meat, cheese, or herb is not in the whitelist, it must not appear anywhere in the image.",
    "Do not add extra side dishes, extra bowls, sauces, vegetables, herbs, garnishes, toppings, bread, drinks, utensils, or ingredients unless they are explicitly part of the visual description or the recipe ingredient guardrail.",
    "Show exactly one finished plated dish only. No people, hands, packages, logos, labels, captions, text, or unrelated dishes.",
    "Use a clean tabletop background and a tight square composition with the plated food clearly framed for a recipe card."
  ].join(" ");
}

function buildStrictVisualClause(identity: ReturnType<typeof buildRecipePhotoIdentity>, ingredients: string[]) {
  const source = `${identity.cleanQuery} ${ingredients.join(" ")}`.toLowerCase();
  const allowsRice = /\b(rice|pilaf|couscous|bulgur)\b/.test(source);
  const allowsPasta = /\b(pasta|spaghetti|linguine|fettuccine|macaroni|noodle|noodles|vermicelli)\b/.test(source);
  const forbiddenStarches = [
    allowsRice ? "" : "rice, rice grains, pilaf, couscous, bulgur",
    allowsPasta ? "" : "pasta, spaghetti, noodles, macaroni, vermicelli"
  ].filter(Boolean);
  const strictTokens = getStrictRecipePhotoIdentityTokens(identity).slice(0, 6);
  const canonicalName = identity.canonicalDishKey?.replace(/-/g, " ") ?? identity.cleanQuery;

  if (isGroundMeatSource(source)) {
    return buildGroundMeatVisualClause(source, forbiddenStarches);
  }

  if (isSeafoodSource(source)) {
    return buildSeafoodVisualClause(source, forbiddenStarches);
  }

  if (!isStrictRecipePhotoIdentity(identity)) return "";

  if (identity.mainIngredientKey === "liver") {
    const liverIngredientClause = buildLiverIngredientVisualClause(ingredients);

    return [
      "Strict visual identity: the food must be visibly liver/kebda/cigeri, an organ-meat dish, not generic beef or red meat.",
      "Reference cue: for Egyptian/Alexandrian kebda, show pan-fried sliced liver pieces with bell pepper, garlic, onion, cumin, lemon, and optional parsley only when those items are listed.",
      "Reference cue: for Moroccan kebda, show pan-browned liver strips with garlic, coriander/cilantro, olive oil, Moroccan spice, lemon, and bread only when listed.",
      "Reference cue: for Moroccan Kebda Mchermla stew, show visible liver cubes in a red tomato-onion-herb sauce with turmeric, paprika, chili, parsley, and coriander only when listed.",
      "Reference cue: for North African kebda chermoula, show visible liver pieces in a red spiced tomato-garlic sauce with parsley only when listed.",
      "Reference cue: for Kebda Bel Rada, show crisp wheat-bran-coated fried liver slices, never balls, nuggets, patties, or pate.",
      "Reference cue: for Egyptian liver sandwiches, show chopped liver filling in bread with peppers, onion, chilies, herbs, and tahini only when those items are listed.",
      "Render the liver as thin sliced strips, chopped pieces, or minced fried liver with a dark brown glossy surface and irregular edges.",
      "The liver must be the largest and clearest subject in the frame, not beef steak, beef strips, beef cubes, ground beef, kofta, kebab, meatballs, burger, chicken, fish, egg, pate, fried balls, or a generic brown protein.",
      liverIngredientClause,
      forbiddenStarches.length
        ? `Hard negative: do not include ${forbiddenStarches.join("; ")} anywhere in the image.`
        : "Any starch present must be minor and must not dominate or hide the liver."
    ].join(" ");
  }

  return [
    `Strict visual identity: the image must read immediately as ${canonicalName}, not as a generic ${identity.cuisineKey ?? "regional"} plate.`,
    strictTokens.length
      ? `Required recognition cues include at least one of these canonical names or forms: ${strictTokens.join(", ")}.`
      : "",
    forbiddenStarches.length
      ? `Hard negative: do not include ${forbiddenStarches.join("; ")} anywhere in the image.`
      : "",
    "Avoid neighboring dish families, vague mixed plates, unrelated sides, and generic restaurant food."
  ].filter(Boolean).join(" ");
}

function buildStrictIngredientWhitelistClause(
  ingredients: string[],
  identity?: ReturnType<typeof buildRecipePhotoIdentity>,
  query = ""
) {
  const whitelist = ingredients.join(", ");
  const impliedComponents = getDishImpliedVisibleComponents(identity, query);
  const impliedClause = impliedComponents.length
    ? `Allowed because the exact dish name requires them: ${impliedComponents.join(", ")}. These are structural parts of the named dish, not optional extra sides.`
    : "No other visible food components are allowed unless they are directly named by the exact recipe-card identity.";

  return [
    `Recipe ingredient whitelist: ${whitelist}.`,
    "This whitelist is strict: every visible ingredient must be listed here or be a structural component required by the exact dish name.",
    impliedClause,
    "Do not add common food-photo extras such as random salad, herbs, lemon wedges, sauces, cheese, rice, pasta, bread, vegetables, pickles, seeds, nuts, or side dishes unless they are in the whitelist or explicitly required by the exact dish identity.",
    "Do not use a different visual base, filler food, side dish, or garnish just because it is common in food photography.",
    "Common seasonings, cooking oil, or water may be implied only if they are invisible or already listed; they must not become visible toppings, sauces, or side items."
  ].join(" ");
}

function getDishImpliedVisibleComponents(identity: ReturnType<typeof buildRecipePhotoIdentity> | undefined, query: string) {
  const source = `${query} ${identity?.cleanQuery ?? ""} ${identity?.canonicalDishKey ?? ""} ${identity?.familyKey ?? ""}`.toLowerCase();
  const components: string[] = [];

  if (/\b(lahm\s*(?:bi\s*)?ajin|lahm\s*b[iae]\s*ajeen|lahm\s*ajeen|lahmacun|kiymali\s+pide|pide|hawawshi)\b|\u0644\u062d\u0645\s+\u0628\u0639\u062c\u064a\u0646|\u062d\u0648\u0627\u0648\u0634\u064a/iu.test(source)) {
    components.push("thin flatbread or dough base");
  }
  if (/\b(adana|kebab|kabab|kofta|kafta|kofte|kefta)\b|\u0643\u0641\u062a(?:\u0629|\u0647)|\u0623\u0636\u0646\u0629|\u0627\u062f\u0646\u0629/iu.test(source)) {
    components.push("skewer marks or grill char");
  }
  if (/\b(karniyarik|musakka)\b/iu.test(source)) {
    components.push("eggplant base");
  }
  if (/\b(borek|boregi|yufka|phyllo|filo)\b/iu.test(source)) {
    components.push("pastry wrapper");
  }

  return Array.from(new Set(components));
}

function buildExactCardIdentityClause(exactRecipeName: string | undefined, query: string) {
  const cleanExactName = exactRecipeName?.trim();
  const cleanQuery = query.trim();
  const cardName = cleanExactName || cleanQuery;
  if (!cardName) return "";

  return [
    `Exact recipe-card identity: "${cardName}".`,
    "Use that exact named dish as the visual target, not a generic ingredient photo.",
    "If this is one card in a generated set, make it visually distinct by honoring its named form, base, starch, sauce, cooking method, and cuisine."
  ].join(" ");
}

function buildLiverIngredientVisualClause(ingredients: string[]) {
  const source = ingredients.join(" ").toLowerCase();
  const visibleDetails = [
    /\bonion|onions\b/i.test(source) ? "sliced or sauteed onions" : "",
    /\bgarlic\b/i.test(source) ? "small bits of garlic or garlic-seasoned glossy liver" : "",
    /\bpepper|peppers|bell pepper|chili|chilli|jalapeno|spicy\b/i.test(source) ? "green pepper or chili pieces" : "",
    /\blemon|lime\b/i.test(source) ? "a small lemon wedge or lemon squeeze" : "",
    /\bparsley|cilantro|coriander\b/i.test(source) ? "a light herb finish" : ""
  ].filter(Boolean);

  if (!visibleDetails.length) {
    return "Do not add onions, garlic pieces, peppers, chili, lemon wedges, or herbs unless they are listed in the ingredient whitelist.";
  }

  return `Allowed liver-dish visual details from the ingredient whitelist: ${visibleDetails.join(", ")}. Do not add other aromatics, vegetables, lemon, or garnish that are not listed.`;
}

function buildGroundMeatVisualClause(source: string, forbiddenStarches: string[]) {
  const styleHints = [
    /\b(kofta|kafta|kofte|kefta|adana|kebab|kabab)\b|\u0643\u0641\u062a\u0629/iu.test(source)
      ? "shape the ground meat as kofta, kebab fingers, or Adana-style minced meat skewers with charred ridges"
      : "",
    /\b(hawawshi|stuffed bread|stuffed flatbread|stuffed pita)\b|\u062d\u0648\u0627\u0648\u0634\u064a/iu.test(source)
      ? "show the minced meat as a thin stuffing inside crispy flatbread, visible at the cut edges"
      : "",
    /\b(kiymali\s+pide|pide)\b/iu.test(source)
      ? "for kiymali pide, show an oval boat-shaped flatbread with folded raised edges and a thin minced-meat topping"
      : "",
    /\b(lahmacun|lahm\s*(?:bi\s*)?ajin|lahm\s*b[iae]\s*ajeen|lahm\s*ajeen)\b|\u0644\u062d\u0645\s+\u0628\u0639\u062c\u064a\u0646/iu.test(source)
      ? "for lahmacun or lahm bi ajin, show a very thin round or oval flatbread with finely minced meat spread edge-to-edge, not cubes or sliced meat"
      : "",
    /\b(borek|boregi|yufka|phyllo|filo)\b/iu.test(source)
      ? "for Turkish borek, show ground meat inside a golden flaky spiral or rolled pastry, not as loose meat"
      : "",
    /\b(karniyarik)\b/iu.test(source)
      ? "for karniyarik, show whole split eggplants stuffed with minced meat, not a layered casserole"
      : "",
    /\b(musakka|moussaka|eggplant casserole)\b/iu.test(source)
      ? "for Turkish musakka, show a layered eggplant and ground beef casserole, not stuffed whole eggplant"
      : "",
    /\b(rice\s+kofta|koftet\s+roz|koftet\s+arroz)\b/iu.test(source)
      ? "for Egyptian rice kofta, show fried kofta fingers or oval balls simmered in red tomato-garlic sauce, not grilled skewers"
      : "",
    /\b(dawood\s+basha|daoud\s+basha|dawood\s+pasha|daoud\s+pasha)\b|\u062f\u0627(?:\u0648|\u0648\u0648)?\u062f\s+\u0628\u0627\u0634\u0627/iu.test(source)
      ? "for Dawood Basha, show small round minced-meat meatballs simmered in red tomato sauce, not grilled kofta skewers or loose mince"
      : "",
    /\b(taagen\s+kofta|tagine\s+kofta|kofta\s+tray|kofta\s+potato)\b|\u0637\u0627\u062c\u0646\s+\u0643\u0641\u062a/iu.test(source)
      ? "for Egyptian taagen kofta, show shaped kofta pieces baked in a red tomato tray with potato slices only if listed, not a dry grilled platter"
      : "",
    /\b(macarona\s+bechamel|macarona\s+bashamel|bechamel\s+pasta|bashamel)\b|\u0645\u0643\u0631\u0648(?:\u0646\u0629|\u0646\u0647).*(?:\u0628\u0634\u0627\u0645\u064a\u0644|\u0628\u0627\u0644\u0628\u0634\u0627\u0645\u064a\u0644)/iu.test(source)
      ? "for Egyptian macarona bechamel, show a baked pasta casserole square with visible pasta, minced-meat layer, and browned white bechamel top, not red sauce pasta"
      : "",
    /\b(hamburger\s+stew|hamburger\s+soup|ground\s+beef\s+stew)\b/iu.test(source)
      ? "for hamburger stew, show crumbled ground beef in a chunky tomato broth with vegetables, not beef cubes or meatballs"
      : "",
    /\b(penne|pasta|macaroni|rigatoni|fusilli)\b/iu.test(source)
      ? "if pasta is listed, show browned crumbled ground meat integrated into the pasta sauce, especially red tomato sauce for beef penne, with pasta clearly visible"
      : ""
  ].filter(Boolean);

  return [
    "Strict visual identity: the main protein is ground or minced meat, not whole beef cuts.",
    "Arabic ingredient mapping: مفروم, مفرومه, لحمة مفرومة, لحمه مفرومه, and لحم مفروم mean ground/minced meat and are valid for kofta, adana kebab, lahm bi ajin, lahmacun, pide, hawawshi, borek, and minced-meat fillings.",
    "Do not collapse all ground-meat recipes into the same generic browned-mince plate; the named dish form must control the image.",
    "Render it as small crumbled minced meat, a thin minced-meat stuffing, or shaped ground-meat kofta/kebab forms depending on the recipe name.",
    "The meat texture must be visibly minced: fine crumbles, compressed mince, or a smooth ground-meat kebab paste. It must not be diced beef, cube-shaped pieces, chopped steak, sliced meat, stew chunks, shawarma strips, or kebab cubes.",
    styleHints.length
      ? `Recipe-specific ground-meat form: ${styleHints.join("; ")}.`
      : "If no specific dish form is named, show browned crumbled ground meat or compact minced-meat patties, not steak or cubes.",
    "Hard negative: do not show beef steak, steak strips, roast beef, beef cubes, diced meat, chopped steak pieces, stew chunks, sliced whole meat, shawarma strips, kebab cubes, burger buns, or generic red-meat slabs.",
    forbiddenStarches.length
      ? `Hard negative: do not include ${forbiddenStarches.join("; ")} unless they are explicitly listed in the recipe ingredients.`
      : ""
  ].filter(Boolean).join(" ");
}

function buildSeafoodVisualClause(source: string, forbiddenStarches: string[]) {
  const seafoodForms = [
    /\b(shrimp|prawn|prawns)\b/iu.test(source) ? "shrimp should appear as whole curled pink-orange shrimp, not generic fish chunks" : "",
    /\b(calamari|squid)\b/iu.test(source) ? "calamari should appear as rings or squid pieces, either fried golden or grilled depending on the recipe" : "",
    /\b(mussel|mussels|clam|clams)\b/iu.test(source) ? "shellfish should appear in shells with visible seafood, not generic brown pieces" : "",
    /\b(fish|cod|tilapia|sea bass|snapper|salmon|tuna|samak|bori|bouri)\b|\u0633\u0645\u0643|\u0628\u0648\u0631\u064a/iu.test(source)
      ? buildFishRecognitionCue(source)
      : ""
  ].filter(Boolean);
  const fishCuisineForms = buildFishCuisineVisualCues(source);
  const presentationForms = [
    /\b(soup|broth|chowder|stew)\b/iu.test(source)
      ? "present it as a seafood soup or stew in a bowl with broth and visible seafood pieces"
      : "",
    /\b(fried|crispy|breaded|tempura)\b/iu.test(source)
      ? "present fried seafood with golden crisp coating and the seafood shape still recognizable"
      : "",
    /\b(grilled|chargrilled|seared|roasted|toasted)\b/iu.test(source)
      ? "show grilled, seared, toasted, or roasted seafood with browning and char marks"
      : "",
    /\b(skewer|skewers|kabob|kebab)\b/iu.test(source)
      ? "present seafood on skewers with distinct pieces separated and lightly charred"
      : "",
    /\b(pasta|spaghetti|linguine|linguini|fettuccine|noodle|noodles)\b/iu.test(source)
      ? "if pasta is listed, present seafood integrated with pasta, such as garlic shrimp linguine, with seafood clearly visible on top"
      : "",
    /\b(rice|paella|pilaf|risotto)\b/iu.test(source)
      ? "if rice is listed, present it as seafood rice, paella, pilaf, or risotto with seafood visible and not hidden"
      : ""
  ].filter(Boolean);

  return [
    "Strict visual identity: this is a seafood dish, not a generic mixed plate.",
    seafoodForms.length
      ? `Seafood recognition cues: ${seafoodForms.join("; ")}.`
      : "Show clearly recognizable seafood such as shrimp, fish, calamari, mussels, clams, or mixed seafood only when present in the recipe.",
    fishCuisineForms.length ? `Fish cuisine and dish-form cues: ${fishCuisineForms.join("; ")}.` : "",
    presentationForms.length
      ? `Recipe-specific seafood presentation: ${presentationForms.join("; ")}.`
      : "If no specific preparation is named, show the seafood as the main plated subject, cleanly cooked and clearly visible.",
    "Hard negative: do not replace seafood with chicken, beef, lamb, eggs, tofu, generic meat, or vague beige fried pieces.",
    forbiddenStarches.length
      ? `Hard negative: do not include ${forbiddenStarches.join("; ")} unless they are explicitly listed in the recipe ingredients.`
      : ""
  ].filter(Boolean).join(" ");
}

function buildFishRecognitionCue(source: string) {
  if (/\b(samak\s+singari|samak\s+sengari|fish\s+singari|fish\s+sengari|bori\s+singari|bori\s+sengari|bouri\s+singari|bouri\s+sengari)\b|\u0633\u0646\u062c\u0627\u0631\u064a/iu.test(source)) {
    return "fish should be a whole butterflied Egyptian bouri/mullet-style fish, split open with visible topping, not a plain fillet";
  }

  if (/\b(whole fish|bori|bouri|mullet)\b|\u0628\u0648\u0631\u064a/iu.test(source)) {
    return "fish should appear as a whole fish or large butterflied fish with head/tail or skin-on shape visible";
  }

  if (/\b(fried fish|crispy fish)\b/iu.test(source)) {
    return "fish should appear as golden fried whole fish or fried fillets with crisp edges, not steamed or boiled";
  }

  return "fish should appear as a recognizable fish fillet, steak, whole fish, or flakes matching the named fish, not generic beige protein pieces";
}

function buildFishCuisineVisualCues(source: string) {
  const cues = [
    /\b(sayadeya|sayadeyah|sayadieh|sayadiah)\b|\u0635\u064a\u0627\u062f(?:\u064a\u0629|\u064a\u0647)/iu.test(source)
      ? "for sayadeya, show fish with spiced brown onion rice; the fish must remain visible and the rice should not look plain"
      : "",
    /\b(samak\s+singari|samak\s+sengari|fish\s+singari|fish\s+sengari|bori\s+singari|bori\s+sengari|bouri\s+singari|bouri\s+sengari)\b|\u0633\u0646\u062c\u0627\u0631\u064a/iu.test(source)
      ? "for bouri/samak singari, show a whole butterflied fish split open with tomato-pepper-onion-herb topping only when those ingredients are listed"
      : "",
    /\b(alexandrian|iskandarani|eskandarani)\b|\u0627\u0633\u0643\u0646\u062f\u0631\u0627\u0646\u064a|\u0625\u0633\u0643\u0646\u062f\u0631\u0627\u0646\u064a/iu.test(source)
      ? "for Alexandrian fish, use a coastal Egyptian spicy presentation with pepper, garlic, lemon, and herbs only when listed"
      : "",
    /\b(tagine|tajine|oven|baked|tray)\b|\u0637\u0627\u062c\u0646/iu.test(source)
      ? "for oven or tagine fish, show fish baked in a tray or shallow dish, not an isolated generic fillet"
      : "",
    /\b(potato|potatoes)\b/iu.test(source)
      ? "if potato is listed, show sliced potatoes baked around or under the fish without hiding the fish"
      : "",
    /\b(onion|onions)\b/iu.test(source)
      ? "if onion is listed, show onion slices or caramelized onion as part of the fish preparation"
      : "",
    /\b(lemon|lime)\b/iu.test(source)
      ? "if lemon is listed, a small lemon wedge or lemony finish is allowed but must not dominate"
      : "",
    /\b(tahini|sesame)\b/iu.test(source)
      ? "if tahini is listed, show a modest tahini sauce accent, not a creamy unrelated sauce"
      : ""
  ].filter(Boolean);

  return cues;
}

function buildRecipeImageNegativePrompt(query: string, ingredients: string[]) {
  const source = `${query} ${ingredients.join(" ")}`.toLowerCase();
  const allow = (pattern: RegExp) => pattern.test(source);
  const isLiverDish = allow(/\b(liver|kebda|kibda|ciger|cigeri)\b/i);
  const isGroundMeatDish = isGroundMeatSource(source);
  const isSeafoodDish = isSeafoodSource(source);
  const isFlatbreadDish = isFlatbreadGroundMeatDishSource(source);
  const excludedFoods = [
    allow(/\b(pasta|spaghetti|linguine|fettuccine|macaroni|penne|noodle|noodles|vermicelli|ramen|udon|soba)\b/i)
      ? ""
      : "pasta, spaghetti, noodles, macaroni, penne, vermicelli, ramen, udon",
    allow(/\b(rice|pilaf|couscous|bulgur|burghul|quinoa)\b/i)
      ? ""
      : "rice, pilaf, couscous, bulgur, quinoa, grain bowl",
    allow(/\b(bread|toast|pita|flatbread|bun|roll|wrap|tortilla|dough)\b/i) || isFlatbreadDish
      ? ""
      : "bread, toast, pita, flatbread, bun, roll, wrap, tortilla",
    allow(/\b(potato|potatoes|fries)\b/i) ? "" : "potatoes, fries",
    allow(/\b(salad|lettuce|arugula|greens)\b/i) ? "" : "salad, lettuce, arugula, leafy greens",
    allow(/\b(cheese|feta|mozzarella|parmesan|cheddar)\b/i) ? "" : "cheese, feta, mozzarella, parmesan",
    allow(/\b(sauce|tomato sauce|cream|yogurt|tahini|pesto|gravy)\b/i) ? "" : "extra sauce, cream sauce, tomato sauce, gravy",
    allow(/\b(chicken|beef|lamb|fish|salmon|shrimp|prawn|tuna|liver|egg|eggs|tofu)\b/i)
      ? ""
      : "meat, chicken, beef, lamb, fish, shrimp, eggs, tofu",
    isLiverDish
      ? "beef steak, steak strips, beef cubes, roast beef, ground beef, minced beef, kofta, kebab, meatballs, burger patty, generic brown meat"
      : "",
    isGroundMeatDish
      ? "beef steak, steak strips, beef cubes, diced beef, cubed meat, meat chunks, chopped steak pieces, roast beef, stew meat chunks, sliced whole meat, shawarma strips, kebab cubes, generic beef plate"
      : "",
    isSeafoodDish
      ? "chicken, beef, lamb, steak, meatballs, burger, eggs, tofu, generic meat, vague mixed grill, unrecognizable seafood, fake seafood"
      : ""
  ].filter(Boolean);

  return [
    "extra ingredients",
    "unrelated food",
    "unlisted garnish",
    "unlisted sauce",
    "unlisted toppings",
    "side dishes",
    "multiple dishes",
    "wrong recipe",
    "fusion reinterpretation",
    "text",
    "labels",
    "packaging",
    "people",
    "hands",
    ...excludedFoods
  ].join(", ");
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

  if (identity.canonicalDishKey) {
    const dish = getDishById(identity.canonicalDishKey);
    if (dish) {
      const englishName = dish.names.english[0] ?? identity.canonicalDishKey.replace(/-/g, " ");
      return {
        englishName,
        visualDescription: `${dish.description}. The finished food should show the recognizable real-world form of ${englishName}, centered on ${dish.primaryIngredients.slice(0, 4).join(", ") || "its key ingredients"}`,
        plating: `served as an authentic ${dish.region} ${englishName} plate with the main dish clearly visible and no unrelated side dishes`,
        avoid: "generic bowl, vague mixed plate, fusion food, unrelated cuisine, extra side dishes, random garnish, wrong protein, wrong starch",
        cuisineStyle: `authentic ${dish.region} food photography`
      } satisfies DishVisualPrompt;
    }
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
        .map(normalizePromptIngredientAlias)
    )
  ).slice(0, 10);
}

function normalizePromptIngredientAlias(value: string) {
  if (isArabicGroundMeatIngredient(value)) {
    return "ground/minced meat (Arabic: lahma mafrouma)";
  }

  if (/\b(mince|minced|ground)\b/i.test(value) && /\b(meat|beef|lamb|veal)\b/i.test(value)) {
    return "ground/minced meat";
  }

  return value;
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
      /\b(fried liver|sauteed liver|sliced liver|chopped liver|alexandrian liver|kebda|kibda|cigeri|fried chicken|grilled chicken|roast chicken|chicken breast|chicken thigh|kofta|kebab|shawarma|shakshuka|koshary|lentil soup|chickpea salad|fish fillet|grilled fish|shrimp|prawns?|beef stew|meatballs?)\b/
    )?.[1] ?? "";
  if (explicitDishMatch) return explicitDishMatch;

  if (identity.mainIngredientKey === "liver" || /\b(liver|kebda|kibda|ciger|cigeri)\b/iu.test(source)) {
    return "sliced or chopped liver";
  }

  if (isGroundMeatSource(source)) {
    if (/\b(hawawshi|stuffed bread|stuffed flatbread|stuffed pita)\b|\u062d\u0648\u0627\u0648\u0634\u064a/iu.test(source)) {
      return "minced meat stuffed flatbread";
    }
    if (/\b(lahmacun|lahm\s*(?:bi\s*)?ajin|lahm\s*b[iae]\s*ajeen|lahm\s*ajeen)\b|\u0644\u062d\u0645\s+\u0628\u0639\u062c\u064a\u0646/iu.test(source)) {
      return "minced meat flatbread";
    }
    if (/\b(adana)\b/iu.test(source)) return "adana ground meat kebab";
    if (/\b(kofta|kafta|kofte|kefta|kebab|kabab)\b|\u0643\u0641\u062a\u0629/iu.test(source)) {
      return "ground meat kofta";
    }
    return "ground minced meat";
  }

  if (isSeafoodSource(source)) {
    if (/\b(sayadeya|sayadeyah|sayadieh|sayadiah)\b|\u0635\u064a\u0627\u062f(?:\u064a\u0629|\u064a\u0647)/iu.test(source)) return "egyptian sayadeya fish rice";
    if (/\b(samak\s+singari|samak\s+sengari|fish\s+singari|fish\s+sengari|bori\s+singari|bori\s+sengari|bouri\s+singari|bouri\s+sengari)\b|\u0633\u0646\u062c\u0627\u0631\u064a/iu.test(source)) {
      return "egyptian butterflied bouri fish singari";
    }
    if (/\b(alexandrian|iskandarani|eskandarani)\b|\u0627\u0633\u0643\u0646\u062f\u0631\u0627\u0646\u064a|\u0625\u0633\u0643\u0646\u062f\u0631\u0627\u0646\u064a/iu.test(source)) {
      return "alexandrian spicy fish";
    }
    if (/\b(tagine|tajine|oven|baked|tray)\b|\u0637\u0627\u062c\u0646/iu.test(source)) return "egyptian baked fish tagine";
    if (/\b(fried\s+fish|crispy\s+fish)\b/iu.test(source)) return "fried fish";
    if (/\b(garlic\s+shrimp|shrimp\s+linguine|shrimp\s+linguini)\b/iu.test(source)) return "garlic shrimp linguine";
    if (/\b(paella)\b/iu.test(source)) return "seafood paella";
    if (/\b(fried\s+calamari|calamari)\b/iu.test(source)) return "calamari";
    if (/\b(fried\s+shrimp)\b/iu.test(source)) return "fried shrimp";
    if (/\b(grilled\s+shrimp|shrimp\s+skewer|shrimp\s+skewers)\b/iu.test(source)) return "grilled shrimp skewers";
    if (/\b(seafood\s+soup|fish\s+soup|shrimp\s+soup)\b/iu.test(source)) return "seafood soup";
    if (/\b(shrimp|prawn|prawns)\b/iu.test(source)) return "shrimp";
    if (/\b(mussel|mussels|clam|clams)\b/iu.test(source)) return "shellfish";
    if (/\b(fish|cod|tilapia|sea bass|snapper|salmon|tuna)\b/iu.test(source)) return "fish fillet";
    return "seafood";
  }

  const proteinMatch =
    source.match(/\b(liver|kebda|kibda|ciger|cigeri|chicken|beef|lamb|fish|shrimp|prawn|egg|eggs|lentils?|chickpeas?)\b/)?.[1] ?? "";
  if (proteinMatch) return proteinMatch;

  const starchOnlyMatch =
    source.match(/\b(koshary|pasta|spaghetti|macarona bechamel|rice|bulgur|lentil soup|chickpea salad)\b/)?.[1] ?? "";
  return starchOnlyMatch || "";
}

function isGroundMeatSource(source: string) {
  return /\b(ground|minced|mince)\s+(beef|meat|lamb|veal|protein)\b|\b(beef|meat|lamb|veal)\s+(ground|minced|mince)\b|\bground\s+meat\b|\bminced\s+meat\b|\b(kofta|kafta|kofte|kefta|adana|lahmacun|kiymali\s+pide|pide|hawawshi|lahm\s*(?:bi\s*)?ajin|lahm\s*b[iae]\s*ajeen|lahm\s*ajeen)\b|(?:\u0627\u0644)?\u0644\u062d\u0645(?:\u0629|\u0647)?\s+(?:\u0627\u0644)?\u0645\u0641\u0631\u0648\u0645(?:\u0629|\u0647)?\u0648?|\u0645\u0641\u0631\u0648\u0645(?:\u0629|\u0647)?\u0648?|\u0643\u0641\u062a(?:\u0629|\u0647)|\u0644\u062d\u0645\s+\u0628\u0639\u062c\u064a\u0646|\u0623\u0636\u0646\u0629|\u0627\u062f\u0646\u0629/iu.test(
    source
  );
}

function isArabicGroundMeatIngredient(value: string) {
  return /(?:\u0627\u0644)?\u0644\u062d\u0645(?:\u0629|\u0647)?\s+(?:\u0627\u0644)?\u0645\u0641\u0631\u0648\u0645(?:\u0629|\u0647)?\u0648?|\u0645\u0641\u0631\u0648\u0645(?:\u0629|\u0647)?\u0648?/iu.test(
    value
  );
}

function isFlatbreadGroundMeatDishSource(source: string) {
  return /\b(lahmacun|lahm\s*(?:bi\s*)?ajin|lahm\s*b[iae]\s*ajeen|lahm\s*ajeen|kiymali\s+pide|pide|hawawshi|stuffed\s+(?:bread|flatbread|pita))\b|\u0644\u062d\u0645\s+\u0628\u0639\u062c\u064a\u0646|\u062d\u0648\u0627\u0648\u0634\u064a/iu.test(
    source
  );
}

function isSeafoodSource(source: string) {
  return /\b(seafood|shrimp|prawn|prawns|calamari|squid|mussel|mussels|clam|clams|fish|cod|tilapia|sea\s*bass|snapper|salmon|tuna|paella|linguine|linguini|sayadeya|sayadieh|sayadiah|samak|singari|sengari|bori|bouri|mullet)\b|\u0633\u0645\u0643|\u0635\u064a\u0627\u062f(?:\u064a\u0629|\u064a\u0647)|\u0633\u0646\u062c\u0627\u0631\u064a|\u0628\u0648\u0631\u064a/iu.test(
    source
  );
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
  const allowsDishFlatbread = isFlatbreadGroundMeatDishSource(source);

  if (!supportStarches.some((value) => /\b(pasta|spaghetti|linguine|fettuccine|macaroni|vermicelli|noodle|noodles)\b/i.test(value))) {
    forbiddenGroups.push("spaghetti, pasta, noodles, vermicelli");
  }

  if (!supportStarches.some((value) => /\b(rice|pilaf|bulgur|couscous)\b/i.test(value)) && identity.starchKey !== "rice") {
    forbiddenGroups.push("plain rice, pilaf, couscous, bulgur");
  }

  if (!allowsDishFlatbread && !supportStarches.some((value) => /\b(bread|pita|bun|roll|toast|dough|flatbread)\b/i.test(value)) && identity.starchKey !== "bread") {
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
