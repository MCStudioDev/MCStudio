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

const KEBDA_VISUAL_PROMPT: DishVisualPrompt = {
  englishName: "Egyptian kebda eskandarani",
  visualDescription:
    "Egyptian kebda made from thin sliced liver strips or small irregular liver pieces, dark mahogany-brown with slightly firm flat cut surfaces and a glossy spicy garlic-chili-lemon sauce. It may include green pepper strips, parsley, cumin, coriander, and lemon. The liver pieces should look like sauteed or fried liver slices, not stew meat: some pieces are flat strips, some are uneven bite-size liver cuts with sharp edges and dense liver texture",
  plating:
    "served as one tight Egyptian street-food plate, skillet, foil tray, or sandwich filling only when bread is part of the recipe; the liver is the clear main subject with minimal garnish",
  avoid:
    "beef cubes, stew beef, kebab halla, diced steak, steak tips, lamb cubes, braised meat chunks, generic brown meat, meatballs, burger, kofta, shawarma, chicken, fish, pasta, spaghetti, noodles, rice, rice bowl, couscous, pilaf, soup, egg, yellow curry sauce",
  cuisineStyle: "authentic Egyptian kebda street food"
};

const MINCED_SKEWER_KEBAB_AVOID =
  "beef cubes, stew beef, diced steak, steak tips, lamb cubes, braised meat chunks, kebab halla, testi kebab clay pot stew, doner shawarma slices, meatballs, round kofta balls, burger patties, sausage links, loose ground meat hash, pasta, rice bowl, soup";

const KOFTA_KEBAB_VISUAL_PROMPT: DishVisualPrompt = {
  englishName: "grilled kofta kebab",
  visualDescription:
    "hand-minced beef or lamb kofta formed into long narrow kebab fingers or ridged logs around skewers, with uneven minced-meat texture, charred grill marks, browned edges, and juicy interior. The meat is molded from ground meat, not cut into cubes, and each kebab is elongated rather than round",
  plating:
    "served as parallel grilled kofta kebabs on a simple platter with minimal parsley, onion, lemon, grilled pepper, or flatbread only if they fit the recipe",
  avoid: MINCED_SKEWER_KEBAB_AVOID,
  cuisineStyle: "authentic grilled kofta kebab"
};

const ADANA_KEBAB_VISUAL_PROMPT: DishVisualPrompt = {
  englishName: "Turkish Adana kebab",
  visualDescription:
    "long spicy minced lamb or beef kebab hand-molded onto flat metal skewers, wide and slightly flattened with ridged uneven minced-meat texture, red-orange pepper seasoning, smoky char marks, and juicy browned surface. It is a continuous minced-meat skewer like real Adana kebab, not cubes of meat",
  plating:
    "served on or beside lavash with sumac onion, grilled tomato or pepper, and herbs only as small authentic sides; the long flat minced kebab skewer remains the main subject",
  avoid: MINCED_SKEWER_KEBAB_AVOID,
  cuisineStyle: "authentic Turkish charcoal-grilled Adana kebab"
};

const FUL_MEDAMES_VISUAL_PROMPT: DishVisualPrompt = {
  englishName: "Egyptian ful medames",
  visualDescription:
    "Egyptian ful medames made from mashed and partly whole fava beans, thick tan-brown and rustic, with glossy olive oil or hot chili oil pooled and drizzled on top, cumin, lemon, chopped parsley, tomato, onion, or green chili only as small authentic toppings. The texture should read as stewed fava beans in a shallow bowl, clay tagine, or small metal serving dish, not a smooth dip",
  plating:
    "served as one Egyptian breakfast bowl or shallow tagine with the ful as the clear main subject; baladi bread or lemon wedges may appear only as small supporting items when they fit the recipe",
  avoid:
    "smooth hummus swirl, chickpea hummus, beige tahini dip, lentil soup, bean soup, white bean stew, kidney bean chili, green beans, fasolia, loubia, salad bowl, rice, pasta, meat stew, beef, chicken, fish",
  cuisineStyle: "authentic Egyptian breakfast"
};

const FUL_WITH_EGGS_VISUAL_PROMPT: DishVisualPrompt = {
  ...FUL_MEDAMES_VISUAL_PROMPT,
  englishName: "Egyptian ful with eggs",
  visualDescription:
    "Egyptian ful medames made from mashed and partly whole fava beans, thick tan-brown and rustic, topped or mixed with visible cooked egg pieces, fried egg, boiled egg wedges, or soft scrambled egg. Glossy olive oil or hot chili oil, cumin, lemon, parsley, tomato, onion, or green chili may appear as small authentic toppings, but the fava beans remain the main subject",
  plating:
    "served as one Egyptian breakfast bowl, shallow plate, or small tagine with the ful and eggs together as one finished dish"
};

const MOLOKHIA_VISUAL_PROMPT: DishVisualPrompt = {
  englishName: "Egyptian molokhia",
  visualDescription:
    "Egyptian molokhia, a deep green jute-leaf soup or stew with a glossy slightly viscous texture, finely chopped leafy greens suspended in broth, and a visible garlic-coriander tasha or toasted garlic flecks on top. It should look like authentic molokhia: vibrant dark green, smooth but leafy, not a pale cream soup or spinach puree",
  plating:
    "served as one bowl or shallow soup dish of green molokhia, with white rice and the named protein only as supporting elements when the recipe includes them",
  avoid:
    "spinach cream soup, pesto pasta, green curry, pea soup, broccoli soup, salad, green smoothie, plain rice bowl, tomato stew, lentil soup, beef cubes without green soup, chicken plate without green soup",
  cuisineStyle: "authentic Egyptian home cooking"
};

const CHICKEN_MOLOKHIA_VISUAL_PROMPT: DishVisualPrompt = {
  ...MOLOKHIA_VISUAL_PROMPT,
  englishName: "Egyptian chicken molokhia",
  visualDescription:
    "Egyptian molokhia, a deep green jute-leaf soup or stew with glossy slightly viscous chopped greens, garlic-coriander tasha or toasted garlic flecks, served with clearly visible chicken pieces such as breast, thigh, or leg. The green molokhia remains the main identity and the chicken is a visible protein companion",
  plating:
    "served as one bowl or shallow dish of green molokhia with chicken visible in or beside the bowl; white rice may appear as a small supporting side when the recipe includes it"
};

const BEEF_MOLOKHIA_VISUAL_PROMPT: DishVisualPrompt = {
  ...MOLOKHIA_VISUAL_PROMPT,
  englishName: "Egyptian beef molokhia",
  visualDescription:
    "Egyptian molokhia, a deep green jute-leaf soup or stew with glossy slightly viscous chopped greens, garlic-coriander tasha or toasted garlic flecks, served with visible beef or lamb pieces as the protein. The meat supports the dish, but the green molokhia soup remains dominant",
  plating:
    "served as one bowl or shallow dish of green molokhia with beef or lamb pieces visible in or beside the bowl; white rice may appear as a small supporting side when the recipe includes it"
};

const SHRIMP_MOLOKHIA_VISUAL_PROMPT: DishVisualPrompt = {
  ...MOLOKHIA_VISUAL_PROMPT,
  englishName: "Egyptian shrimp molokhia",
  visualDescription:
    "Egyptian molokhia, a deep green jute-leaf soup or stew with glossy slightly viscous chopped greens, garlic-coriander tasha or toasted garlic flecks, served with visible shrimp as the protein. The shrimp should be recognizable and the green molokhia remains the dominant dish identity",
  plating: "served as one bowl or shallow dish of green molokhia with shrimp visible on top or partly submerged"
};

const MUSHROOM_MOLOKHIA_VISUAL_PROMPT: DishVisualPrompt = {
  ...MOLOKHIA_VISUAL_PROMPT,
  englishName: "Egyptian mushroom molokhia",
  visualDescription:
    "Egyptian molokhia, a deep green jute-leaf soup or stew with glossy slightly viscous chopped greens, garlic-coriander tasha or toasted garlic flecks, served with visible sauteed mushroom pieces. The mushrooms support the dish while the green molokhia remains dominant",
  plating: "served as one bowl or shallow dish of green molokhia with mushrooms visible on top or partly submerged"
};

const BAKED_FISH_VISUAL_PROMPT: DishVisualPrompt = {
  englishName: "baked fish",
  visualDescription:
    "a clearly recognizable fish dish: either a whole fish, fish fillet, or thick fish pieces with flaky white fish texture, lightly browned or baked with the recipe's seasonings. Lemon, herbs, tomato, rice, or vegetables may appear only when they are part of the recipe",
  plating:
    "served as one fish-centered plate or baking dish with the fish as the dominant subject; rice or lemon may be small supporting elements only when included in the recipe",
  avoid:
    "chicken, beef, liver, shrimp-only dish, crab-only dish, pasta unless listed, rice unless listed, salad-only plate, fish hidden under sauce, unrecognizable seafood mix, sushi unless requested",
  cuisineStyle: "realistic seafood food photography"
};

const GRILLED_FISH_VISUAL_PROMPT: DishVisualPrompt = {
  ...BAKED_FISH_VISUAL_PROMPT,
  englishName: "grilled fish",
  visualDescription:
    "a clearly recognizable grilled fish dish, either whole fish or fillets with char marks, browned skin or edges, and flaky fish texture. Lemon, herbs, tomato, rice, or vegetables may appear only when they are part of the recipe",
  plating:
    "served as one grilled fish-centered plate with the fish clearly visible and dominant"
};

const SHRIMP_VISUAL_PROMPT: DishVisualPrompt = {
  englishName: "shrimp dish",
  visualDescription:
    "a shrimp-centered dish with whole curled shrimp or prawns clearly visible, pink-orange and glossy, cooked in the recipe's sauce or seasoning. The shrimp must be recognizable and dominant, not minced or hidden",
  plating:
    "served as one shrimp-centered plate, skillet, bowl, or bake matching the recipe form; pasta, rice, bread, and lemon appear only when included in the recipe",
  avoid:
    "fish fillets, chicken, beef, liver, meatballs, tofu, pasta unless listed, rice unless listed, salad-only plate, unrecognizable seafood mix without visible shrimp",
  cuisineStyle: "realistic seafood food photography"
};

const MIXED_SEAFOOD_VISUAL_PROMPT: DishVisualPrompt = {
  englishName: "mixed seafood dish",
  visualDescription:
    "a mixed seafood dish with recognizable seafood pieces such as shrimp, fish, mussels, clams, squid, crab, or scallops according to the recipe. The seafood must be visibly identifiable and not replaced by chicken, beef, or anonymous protein",
  plating:
    "served as one seafood-centered plate, bake, soup, stew, rice dish, or pasta dish matching the recipe form; pasta, rice, lemon, or vegetables appear only when included in the recipe",
  avoid:
    "chicken, beef, liver, meatballs, tofu, vegetarian plate, pasta unless listed, rice unless listed, seafood hidden completely under sauce, unrelated side dishes",
  cuisineStyle: "realistic seafood food photography"
};

const SAYADEYA_VISUAL_PROMPT: DishVisualPrompt = {
  ...BAKED_FISH_VISUAL_PROMPT,
  englishName: "Egyptian sayadeya",
  visualDescription:
    "Egyptian sayadeya with fish as the clear main subject, caramelized onion-spiced brown rice or coastal rice only when included, and tahini or tomato-onion sauce only when included. The fish should be visible as a whole fish, fillet, or fish pieces, not hidden by rice",
  plating:
    "served as one Egyptian coastal fish plate with fish visible and rice/lemon as supporting elements only when part of the recipe",
  cuisineStyle: "authentic Egyptian coastal seafood"
};

const EGYPTIAN_FISH_TAGINE_VISUAL_PROMPT: DishVisualPrompt = {
  ...BAKED_FISH_VISUAL_PROMPT,
  englishName: "Egyptian fish tagine",
  visualDescription:
    "Egyptian fish tagine with visible fish pieces or fillets baked in tomato, peppers, garlic, onion, herbs, and sauce when those ingredients are in the recipe. The fish remains visible above or within the sauce",
  plating: "served as one shallow clay tagine, baking dish, or plate with the fish clearly visible",
  cuisineStyle: "authentic Egyptian seafood tagine"
};

const SAMAK_SINGARI_VISUAL_PROMPT: DishVisualPrompt = {
  ...GRILLED_FISH_VISUAL_PROMPT,
  englishName: "Egyptian samak singari",
  visualDescription:
    "Egyptian samak singari, a whole fish split open butterfly-style and grilled or baked with herbs, garlic, lemon, chili, tomato, or peppers when included. The open whole fish shape must be clear",
  plating:
    "served as one split-open whole fish on a plate or tray, with lemon or rice only as small supporting elements when listed",
  cuisineStyle: "authentic Egyptian grilled fish"
};

const ALEXANDRIAN_SHRIMP_VISUAL_PROMPT: DishVisualPrompt = {
  ...SHRIMP_VISUAL_PROMPT,
  englishName: "Alexandrian shrimp",
  visualDescription:
    "Alexandrian shrimp with whole curled shrimp clearly visible in garlic, tomato, chili, pepper, lemon, cumin, coriander, or herbs when those ingredients are in the recipe. The shrimp should be the dominant visible protein",
  plating: "served as one Egyptian coastal shrimp plate, skillet, or shallow bowl with the shrimp clearly visible",
  cuisineStyle: "authentic Alexandrian Egyptian seafood"
};

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
    ...KOFTA_KEBAB_VISUAL_PROMPT,
    englishName: "Egyptian kofta kebab",
    cuisineStyle: "authentic Egyptian or Middle Eastern grilled kofta"
  },
  "kofta-kebab": {
    ...KOFTA_KEBAB_VISUAL_PROMPT,
    englishName: "Egyptian kofta kebab",
    cuisineStyle: "authentic Egyptian or Middle Eastern grilled kofta"
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
  "ful-medames": FUL_MEDAMES_VISUAL_PROMPT,
  "ful-bel-bayd": FUL_WITH_EGGS_VISUAL_PROMPT,
  "ful-bel-tahina": {
    ...FUL_MEDAMES_VISUAL_PROMPT,
    englishName: "Egyptian ful with tahini",
    visualDescription:
      "Egyptian ful medames made from mashed and partly whole fava beans, thick tan-brown and rustic, mixed or topped with a visible tahini-lemon drizzle, olive oil, cumin, and small authentic toppings like parsley, tomato, onion, lemon, or green chili. The fava bean texture remains visible and should not become smooth hummus"
  },
  "foul-bil-tahina": {
    ...FUL_MEDAMES_VISUAL_PROMPT,
    englishName: "Egyptian ful with tahini",
    visualDescription:
      "Egyptian ful medames made from mashed and partly whole fava beans, thick tan-brown and rustic, mixed or topped with a visible tahini-lemon drizzle, olive oil, cumin, and small authentic toppings like parsley, tomato, onion, lemon, or green chili. The fava bean texture remains visible and should not become smooth hummus"
  },
  "foul-iskandarani": {
    ...FUL_MEDAMES_VISUAL_PROMPT,
    englishName: "Alexandrian ful",
    visualDescription:
      "Alexandrian-style ful medames made from mashed and partly whole fava beans, thick tan-brown and rustic, with tomato, onion, green pepper or chili, lemon, cumin, garlic, and glossy olive oil or hot chili oil. It should look like an Egyptian fava bean bowl with visible bean texture and bright Alexandrian toppings"
  },
  "fava-bean-sandwich": {
    ...FUL_MEDAMES_VISUAL_PROMPT,
    englishName: "Egyptian ful sandwich",
    plating:
      "served as Egyptian baladi bread or pita filled with ful medames, with the mashed fava bean filling visibly spilling at the cut edge; the ful filling remains the main subject"
  },
  molokhia: MOLOKHIA_VISUAL_PROMPT,
  mulookhiyah: MOLOKHIA_VISUAL_PROMPT,
  "chicken-molokhia": CHICKEN_MOLOKHIA_VISUAL_PROMPT,
  "molokhia-chicken": CHICKEN_MOLOKHIA_VISUAL_PROMPT,
  "molokhia-beef": BEEF_MOLOKHIA_VISUAL_PROMPT,
  "beef-molokhia": BEEF_MOLOKHIA_VISUAL_PROMPT,
  "molokhia-shrimp": SHRIMP_MOLOKHIA_VISUAL_PROMPT,
  "shrimp-molokhia": SHRIMP_MOLOKHIA_VISUAL_PROMPT,
  "molokhia-mushroom": MUSHROOM_MOLOKHIA_VISUAL_PROMPT,
  "mushroom-molokhia": MUSHROOM_MOLOKHIA_VISUAL_PROMPT,
  "baked-fish": BAKED_FISH_VISUAL_PROMPT,
  "grilled-fish": GRILLED_FISH_VISUAL_PROMPT,
  "fish-rice-pilaf": {
    ...BAKED_FISH_VISUAL_PROMPT,
    englishName: "fish and rice",
    visualDescription:
      "a fish and rice dish with visible fish as the main protein and rice as a supporting base or side. The fish must remain clearly visible, not buried under rice"
  },
  "salmon-salad": {
    ...BAKED_FISH_VISUAL_PROMPT,
    englishName: "salmon salad",
    visualDescription:
      "a salad with a clearly visible salmon fillet or salmon pieces as the main protein, with salad vegetables only if included in the recipe",
    plating: "served as one composed salmon salad with the salmon clearly visible and dominant"
  },
  shrimp: SHRIMP_VISUAL_PROMPT,
  "shrimp-dish": SHRIMP_VISUAL_PROMPT,
  seafood: MIXED_SEAFOOD_VISUAL_PROMPT,
  "mixed-seafood": MIXED_SEAFOOD_VISUAL_PROMPT,
  sayadeya: SAYADEYA_VISUAL_PROMPT,
  "seafood-sayadeya": {
    ...MIXED_SEAFOOD_VISUAL_PROMPT,
    englishName: "Egyptian seafood sayadeya",
    visualDescription:
      "Egyptian seafood sayadeya with visible mixed seafood such as shrimp and fish over or beside onion-spiced rice only when rice is in the recipe. The seafood remains clearly visible and dominant",
    cuisineStyle: "authentic Egyptian coastal seafood"
  },
  "egyptian-fish-tagine": EGYPTIAN_FISH_TAGINE_VISUAL_PROMPT,
  "fish-tagine": EGYPTIAN_FISH_TAGINE_VISUAL_PROMPT,
  "samak-singari": SAMAK_SINGARI_VISUAL_PROMPT,
  "fish-singari": SAMAK_SINGARI_VISUAL_PROMPT,
  "alexandrian-shrimp": ALEXANDRIAN_SHRIMP_VISUAL_PROMPT,
  "seafood-soup": {
    ...MIXED_SEAFOOD_VISUAL_PROMPT,
    englishName: "seafood soup",
    visualDescription:
      "a seafood soup with recognizable seafood pieces such as shrimp, fish, mussels, clams, squid, or crab in broth according to the recipe. The seafood should be visible above the broth, not hidden",
    plating: "served as one soup bowl with seafood clearly visible"
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
    ...KEBDA_VISUAL_PROMPT,
    englishName: "Egyptian Alexandrian liver"
  },
  "kebda-eskandarani": KEBDA_VISUAL_PROMPT,
  "egyptian-liver-sandwiches": {
    ...KEBDA_VISUAL_PROMPT,
    englishName: "Egyptian liver sandwiches",
    plating:
      "served as Egyptian liver sandwich filling inside baladi bread or a tight street-food plate beside bread, with the liver strips clearly visible"
  },
  "liver-sandwich": {
    ...KEBDA_VISUAL_PROMPT,
    englishName: "Egyptian liver sandwich",
    plating:
      "served as Egyptian liver sandwich filling inside baladi bread or a tight street-food plate beside bread, with the liver strips clearly visible"
  },
  "fried-liver": {
    ...KEBDA_VISUAL_PROMPT,
    englishName: "fried kebda liver slices",
    visualDescription:
      "deep-fried beef liver slices or strips, dark brown with crisp bran or flour coating, irregular flat liver pieces served with parsley and lemon. The pieces are thin liver slices, not beef cubes or stew chunks"
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
      "soft scrambled eggs cooked with tomatoes, green peppers, and spices, rustic and slightly saucy, with visible yellow egg curds integrated into the red tomato-pepper mixture",
    plating: "served in a small pan or shallow dish with egg and tomato clearly visible as one breakfast dish",
    avoid: "plain omelette, shakshuka with whole poached eggs, pasta, rice, burger, soup",
    cuisineStyle: "authentic Turkish breakfast"
  },
  "sucuklu-yumurta": {
    englishName: "Turkish sucuklu yumurta",
    visualDescription:
      "eggs cooked in a small pan with slices of Turkish sucuk sausage, glossy butter, set whites and visible yolks or softly cooked eggs, with the red-brown sucuk slices clearly visible around the eggs",
    plating: "served as one Turkish breakfast pan or shallow plate with eggs and sucuk as the clear main subject",
    avoid: "plain boiled eggs, omelette without sausage, hot dog, burger, pasta, rice, soup, unrelated breakfast buffet",
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
    ...ADANA_KEBAB_VISUAL_PROMPT
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
      "Turkish poached eggs set over thick garlicky yogurt with red pepper butter or chili oil drizzled across the eggs and yogurt, white yogurt base visible, runny or soft yolks visible, no tomato sauce",
    plating: "served in one shallow bowl or plate with the poached eggs, yogurt, and red pepper butter clearly visible",
    avoid: "plain boiled eggs, omelette, tomato shakshuka, menemen, pasta, rice, soup, salad, hummus",
    cuisineStyle: "authentic Turkish breakfast"
  },
  eggah: {
    englishName: "Egyptian eggah",
    visualDescription:
      "thick Egyptian baked eggah, a golden egg-and-herb frittata-like dish with parsley, onion, and vegetables set into the eggs, cut into a wedge or square so the firm egg interior is visible",
    plating: "served as one thick baked egg slice or compact round eggah portion on a simple plate",
    avoid: "plain omelette, scrambled eggs, shakshuka tomato sauce, boiled eggs, pasta, rice, soup, cake",
    cuisineStyle: "authentic Egyptian breakfast or lunch"
  },
  "vegetable-omelet": {
    englishName: "vegetable omelet",
    visualDescription:
      "folded or open omelet with set yellow eggs and visible vegetables such as peppers, onions, spinach, herbs, or tomato, with egg clearly dominant",
    plating: "served as one omelet on a simple plate with no unrelated side dishes unless listed in the recipe",
    avoid: "pancake, flatbread, pasta, rice, soup, salad-only plate, meat stew, dessert",
    cuisineStyle: "realistic breakfast food photography"
  },
  "egg-scramble": {
    englishName: "scrambled eggs",
    visualDescription:
      "soft scrambled eggs with visible yellow curds, lightly glossy and cooked with the recipe vegetables or herbs, with the eggs clearly dominant",
    plating: "served as one compact egg plate or shallow bowl, not a full breakfast buffet",
    avoid: "omelet, boiled eggs, shakshuka, pasta, rice, soup, salad-only plate, dessert",
    cuisineStyle: "realistic breakfast food photography"
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
  const closedIngredientClause = buildClosedRecipeIngredientClause(dish || query, ingredientList);
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
  const proteinVisualClause = buildProteinVisualClause(identity, dish || query, ingredientList);

  return [
    `Create a photorealistic editorial food photograph of ${dish || query}.`,
    "The image must match this exact meal name and cuisine as closely as possible.",
    alternateDishNameClause,
    anchorClause,
    cuisineClause,
    servingClause,
    subjectClause,
    proteinVisualClause,
    closedIngredientClause,
    ingredientClause,
    starchClause,
    forbiddenIngredientClause,
    strictVisualClause,
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
  const supportStarches = ingredients.filter((ingredient) =>
    /\b(rice|pasta|spaghetti|linguine|fettuccine|macaroni|vermicelli|bulgur|bread|pita|bun|potato|potatoes)\b/i.test(
      ingredient
    )
  );
  const closedIngredientClause = buildClosedRecipeIngredientClause(query, ingredients);
  const forbiddenIngredientClause = buildForbiddenIngredientClause(identity, ingredients, supportStarches);
  const cuisineStyle = visualPrompt.cuisineStyle ?? "authentic regional cooking";
  const exactNameClause =
    query && query.toLowerCase() !== visualPrompt.englishName.toLowerCase()
      ? `The requested recipe name is "${query}"; keep the image faithful to that exact recipe while using the visual identity of ${visualPrompt.englishName}.`
      : `The requested recipe is ${visualPrompt.englishName}.`;
  const strictVisualClause = buildStrictVisualClause(identity, ingredients);

  return [
    `Create a photorealistic editorial food photograph of ${visualPrompt.englishName}.`,
    exactNameClause,
    alternateDishNameClause,
    `Visual description: ${visualPrompt.visualDescription}.`,
    `Plating: ${visualPrompt.plating}.`,
    `Style: ${cuisineStyle}, realistic food photography, natural restaurant lighting, appetizing but not exaggerated.`,
    closedIngredientClause,
    ingredientClause,
    forbiddenIngredientClause,
    `Do not show or imply: ${visualPrompt.avoid}.`,
    strictVisualClause,
    "If the visual description mentions a garnish, side, sauce, bread, starch, vegetable, or protein that is not in the recipe ingredient list and is not essential to the named canonical dish, omit it completely.",
    "Do not add extra side dishes, extra bowls, sauces, vegetables, herbs, garnishes, toppings, bread, drinks, utensils, or ingredients unless they are explicitly part of the actual recipe ingredient guardrail.",
    "Show exactly one finished plated dish only. No people, hands, packages, logos, labels, captions, text, or unrelated dishes.",
    "Use a clean tabletop background and a tight square composition with the plated food clearly framed for a recipe card."
  ].join(" ");
}

function buildClosedRecipeIngredientClause(query: string, ingredients: string[]) {
  const source = `${query} ${ingredients.join(" ")}`.toLowerCase();
  const normalizedIngredients = ingredients.length ? ingredients.join(", ") : "the exact named dish only";
  const forbiddenGroups = [
    /\b(pasta|spaghetti|linguine|fettuccine|macaroni|noodle|noodles|vermicelli)\b/.test(source)
      ? ""
      : "no pasta, spaghetti, macaroni, noodles, or vermicelli",
    /\b(rice|pilaf|couscous|bulgur)\b/.test(source) ? "" : "no rice, pilaf, couscous, or bulgur",
    /\b(bread|pita|baladi|bun|roll|toast|flatbread)\b/.test(source) ? "" : "no bread, pita, buns, toast, or flatbread",
    /\b(potato|potatoes)\b/.test(source) ? "" : "no potatoes or fries",
    /\b(chicken|farakh|ferekh)\b/.test(source) ? "" : "no chicken",
    /\b(beef|lamb|meat|steak|veal)\b/.test(source) ? "" : "no beef, lamb, steak, or meat chunks",
    /\b(shrimp|prawn|fish|salmon|tuna)\b/.test(source) ? "" : "no fish, shrimp, tuna, or seafood",
    /\b(egg|eggs|بيض)\b/u.test(source) ? "" : "no eggs",
    /\b(cheese|feta|mozzarella|parmesan|جبن|جبنة)\b/u.test(source) ? "" : "no cheese",
    /\b(tomato|pepper|onion|parsley|cilantro|coriander|mushroom|vegetable|vegetables)\b/.test(source)
      ? ""
      : "no extra vegetables or herbs as garnish"
  ].filter(Boolean);
  const hasGroundMeat = /\b(ground beef|ground meat|ground lamb|minced beef|minced meat|beef mince|lamb mince|mince(?:d)? meat)\b/.test(source);

  return [
    `Closed recipe ingredient boundary: compose the image from the actual recipe ingredients only: ${normalizedIngredients}.`,
    "The named dish identity may guide shape, texture, vessel, and cooking style, but it must not introduce visible ingredients that are absent from the recipe.",
    hasGroundMeat
      ? "Protein form boundary: ground/minced meat must be shown only as loose minced meat, patties, meatballs, kofta/kofte logs, meatloaf, or minced filling. Never show steak, beef cubes, stew chunks, sliced beef, or braised meat pieces for ground meat."
      : "",
    forbiddenGroups.length ? `Hard negative for absent ingredients: ${forbiddenGroups.join("; ")}.` : ""
  ].filter(Boolean).join(" ");
}

function buildStrictVisualClause(identity: ReturnType<typeof buildRecipePhotoIdentity>, ingredients: string[]) {
  if (!isStrictRecipePhotoIdentity(identity)) return "";

  const source = `${identity.cleanQuery} ${ingredients.join(" ")}`.toLowerCase();
  const allowsRice = /\b(rice|pilaf|couscous|bulgur)\b/.test(source);
  const allowsPasta = /\b(pasta|spaghetti|linguine|fettuccine|macaroni|noodle|noodles|vermicelli)\b/.test(source);
  const forbiddenStarches = [
    allowsRice ? "" : "rice, rice grains, pilaf, couscous, bulgur",
    allowsPasta ? "" : "pasta, spaghetti, noodles, macaroni, vermicelli"
  ].filter(Boolean);
  const strictTokens = getStrictRecipePhotoIdentityTokens(identity).slice(0, 6);
  const canonicalName = identity.canonicalDishKey?.replace(/-/g, " ") ?? identity.cleanQuery;

  if (identity.mainIngredientKey === "liver") {
    return [
      "Strict visual identity: the food must be visibly liver/kebda/cigeri as dark brown sauteed or fried liver strips, thin slices, or irregular liver pieces with dense liver texture.",
      "The liver must be the largest and clearest subject in the frame, not a beef cube stew, kebab halla, steak tip, diced meat chunk, meatball, kofta, chicken piece, fish, egg, or generic brown protein.",
      "Hard negative: no cubed beef, no stew meat chunks, no braised beef cubes, no smooth generic meat cubes.",
      forbiddenStarches.length
        ? `Hard negative: do not include ${forbiddenStarches.join("; ")} anywhere in the image.`
        : "Any starch present must be minor and must not dominate or hide the liver."
    ].join(" ");
  }

  if (isMincedKebabVisualRequest(identity)) {
    return [
      "Strict visual identity: the food must be visibly made from minced or ground meat formed into long grilled kebab logs, fingers, or flat skewers with char marks and ridged minced texture.",
      "Hard negative: no beef cubes, no meat cubes, no lamb cubes, no diced steak, no sliced beef strips, no shish kebab chunks, no stew meat chunks, no meatballs, no burger patties, no sausage links, no doner or shawarma slices.",
      "The kebab must look molded from ground/minced meat, not cut from whole muscle meat. Use a ridged minced texture across the full skewer or log."
    ].join(" ");
  }

  if (isFulVisualRequest(identity)) {
    const hasEgg = /\b(egg|eggs)\b/.test(source) || /بيض/u.test(source);
    return [
      "Strict visual identity: the food must be Egyptian ful/fool medames, a thick rustic fava bean bowl with mashed and partly whole tan-brown fava beans, glossy oil, cumin, and simple Egyptian toppings.",
      "The fava beans must be the largest and clearest subject in the frame; the dish must not become a smooth hummus dip, lentil soup, white bean stew, chili, bean salad, fasolia, or generic mixed beans.",
      hasEgg
        ? "Because eggs are part of this recipe, show visible cooked egg pieces or egg topping integrated with the ful while keeping the fava beans dominant."
        : "Do not add eggs unless they are explicitly in the recipe name or ingredient list.",
      forbiddenStarches.length
        ? `Hard negative: do not include ${forbiddenStarches.join("; ")} anywhere in the image.`
        : "Any starch present must be minor and must not dominate or hide the ful."
    ].join(" ");
  }

  if (isMolokhiaVisualRequest(identity)) {
    const proteinClause = inferMolokhiaProteinClause(source);
    return [
      "Strict visual identity: the food must be Egyptian molokhia, a deep green glossy jute-leaf soup or stew with finely chopped leafy texture and garlic-coriander tasha or toasted garlic flecks.",
      "The green molokhia must be the dominant visual identity, not a pale spinach cream soup, pesto pasta, green curry, pea soup, broccoli soup, salad, smoothie, or plain protein plate.",
      proteinClause,
      forbiddenStarches.length
        ? `Hard negative: do not include ${forbiddenStarches.join("; ")} anywhere in the image.`
        : "Rice may appear only as a supporting side and must not hide the green molokhia."
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

function isMincedKebabVisualRequest(identity: ReturnType<typeof buildRecipePhotoIdentity>) {
  const key = `${identity.canonicalDishKey ?? ""} ${identity.familyKey ?? ""} ${identity.cleanQuery}`.toLowerCase();
  if (/\b(kebab halla|testi kebab|testi kebabi|pottery kebab|cig kofte|çig kofte|çiğ köfte|patlican kebab)\b/.test(key)) {
    return false;
  }
  return /\b(adana kebab|kafta|kofta|kofte|kefta|kufta|kofta kebab|kofte kebab)\b/.test(key);
}

function isFulVisualRequest(identity: ReturnType<typeof buildRecipePhotoIdentity>) {
  const key = `${identity.canonicalDishKey ?? ""} ${identity.familyKey ?? ""} ${identity.cleanQuery}`.toLowerCase();
  return /\b(ful|fool|foul|medames|fava bean|fava beans|ful-bel|foul-bil|foul-iskandarani)\b/u.test(key) || /فول/u.test(key);
}

function isMolokhiaVisualRequest(identity: ReturnType<typeof buildRecipePhotoIdentity>) {
  const key = `${identity.canonicalDishKey ?? ""} ${identity.familyKey ?? ""} ${identity.cleanQuery}`.toLowerCase();
  return /\b(molokhia|molokia|mulukhiyah|mulookhiyah|jute leaves?|jute mallow)\b/u.test(key) || /ملوخ/u.test(key);
}

function inferMolokhiaProteinClause(source: string) {
  if (/\b(shrimp|prawn)\b/.test(source)) {
    return "Because shrimp is part of this recipe, show recognizable shrimp with the green molokhia.";
  }

  if (/\b(mushroom|mushrooms)\b/.test(source)) {
    return "Because mushrooms are part of this recipe, show visible mushroom pieces with the green molokhia.";
  }

  if (/\b(beef|lamb|meat|veal)\b/.test(source) || /لحمة|لحم/u.test(source)) {
    return "Because beef or meat is part of this recipe, show visible beef or lamb pieces with the green molokhia.";
  }

  if (/\b(chicken|farakh|ferekh)\b/.test(source) || /دجاج|فراخ/u.test(source)) {
    return "Because chicken is part of this recipe, show recognizable chicken pieces with the green molokhia.";
  }

  return "If a protein is present, it must be a small supporting element and the green molokhia must remain dominant.";
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

function buildProteinVisualClause(
  identity: ReturnType<typeof buildRecipePhotoIdentity>,
  query: string,
  ingredients: string[]
) {
  const source = `${query} ${identity.cleanQuery} ${ingredients.join(" ")}`.toLowerCase();

  if (identity.mainIngredientKey === "chicken" || /\bchicken|poultry|farakh|ferekh\b/.test(source)) {
    const form = inferChickenVisualForm(source, identity.cookingMethodKey, identity.mealTypeKey);
    return [
      `Chicken visual identity: ${form}`,
      "The chicken must be visibly chicken through its shape, fibers, skin, bone, cutlet edge, or white-meat interior, not anonymous brown protein hidden under sauce.",
      "Do not substitute beef, lamb, liver, fish, shrimp, tofu, meatballs, burger patties, or pasta-only plating."
    ].join(" ");
  }

  if (identity.mainIngredientKey === "ground-meat" || /\b(ground beef|ground meat|ground lamb|minced beef|minced meat|beef mince|lamb mince|mince(?:d)? meat)\b/.test(source)) {
    return [
      "Ground meat visual identity: show the protein as visibly minced or ground meat, such as kofta/kofte logs, meatballs, burger-style patties, meatloaf slices, loose minced meat, or minced filling depending on the recipe.",
      "Hard negative: no beef cubes, no steak, no diced beef, no stew chunks, no sliced beef strips, no braised whole-meat pieces, and no kebab halla-style cubed meat."
    ].join(" ");
  }

  if (identity.mainIngredientKey === "shrimp" || /\bshrimp|prawn\b/.test(source)) {
    return [
      "Shrimp visual identity: show whole curled shrimp or prawns clearly visible as the dominant seafood, pink-orange and cooked in the recipe's sauce or seasoning.",
      "Do not substitute fish fillets, chicken, beef, tofu, or anonymous mixed protein. Pasta, rice, bread, and lemon may appear only if included in the recipe."
    ].join(" ");
  }

  if (identity.mainIngredientKey === "fish" || /\bfish|salmon|cod|tilapia|sea bass|snapper\b/.test(source)) {
    const form = inferFishVisualForm(source, identity.cookingMethodKey, identity.mealTypeKey);
    return [
      `Fish visual identity: ${form}`,
      "Do not substitute chicken, beef, shrimp-only seafood, tofu, or anonymous mixed protein. Pasta, rice, bread, and lemon may appear only if included in the recipe."
    ].join(" ");
  }

  if (identity.mainIngredientKey === "seafood" || /\bseafood|shellfish|mussels?|clams?|calamari|squid|crab|lobster|scallops?\b/.test(source)) {
    return [
      "Seafood visual identity: show the specific seafood from the recipe as recognizable pieces, such as shrimp, fish, mussels, clams, squid, crab, or scallops.",
      "Do not substitute chicken, beef, tofu, or a generic sauce with hidden protein. Pasta, rice, bread, and lemon may appear only if included in the recipe."
    ].join(" ");
  }

  return "";
}

function inferChickenVisualForm(source: string, cookingMethodKey?: string, mealTypeKey?: string) {
  if (/\bschnitzel|cutlet|breaded|crispy\b/.test(source)) {
    return "show a flattened breaded chicken cutlet with crisp golden crumb coating and a visible chicken edge or sliced interior.";
  }

  if (/\bwing|wings\b/.test(source)) {
    return "show recognizable chicken wings or wing pieces with skin, joints, and sauce or seasoning that matches the recipe.";
  }

  if (/\bthigh|drumstick|leg\b/.test(source)) {
    return "show bone-in or boneless chicken thigh, drumstick, or leg pieces with browned skin or seared edges matching the recipe.";
  }

  if (/\bwhole chicken|roast chicken|roasted chicken|spatchcock|butterflied\b/.test(source)) {
    return "show a whole, half, or butterflied roasted chicken with browned skin and recognizable poultry form.";
  }

  if (/\bskewer|shish|sis|kebab\b/.test(source)) {
    return "show grilled chicken pieces threaded on skewers, clearly poultry pieces rather than minced meat or beef cubes.";
  }

  if (mealTypeKey === "stew" || /\bstew|curry|tagine|braise|one-pot|one pot\b/.test(source)) {
    return "show distinct chicken pieces in the sauce or stew, with white meat or browned chicken skin visible above the sauce.";
  }

  if (cookingMethodKey === "fried" || /\bfried|crispy\b/.test(source)) {
    return "show crisp fried chicken pieces with golden crust and recognizable poultry shape.";
  }

  if (cookingMethodKey === "grilled" || cookingMethodKey === "pan-seared" || /\bgrilled|seared|charred\b/.test(source)) {
    return "show seared or grilled chicken breast, thigh, or pieces with browned surface and visible chicken texture.";
  }

  if (/\bcream|creamy|sauce|honey garlic|marry me|caprese|tomato\b/.test(source)) {
    return "show chicken breast, thigh, or sliced chicken pieces as the main subject with sauce coating the chicken while leaving the poultry shape visible.";
  }

  return "show chicken breast, thigh, roast pieces, or sliced cooked chicken as the dominant visible protein.";
}

function inferFishVisualForm(source: string, cookingMethodKey?: string, mealTypeKey?: string) {
  if (/\bwhole fish|samak|singari|masala fish\b/.test(source)) {
    return "show a recognizable whole fish or split-open whole fish with skin, head or tail shape where appropriate, and flaky fish texture visible.";
  }

  if (/\bfillet|filet|feta|lemon\b/.test(source)) {
    return "show fish fillets with flaky white fish texture, sauce or topping from the recipe, and the fish clearly visible.";
  }

  if (mealTypeKey === "stew" || mealTypeKey === "soup" || /\bstew|soup|curry|tagine|broth\b/.test(source)) {
    return "show visible fish pieces or fillets in the soup, curry, tagine, or stew, with fish texture visible above the sauce or broth.";
  }

  if (cookingMethodKey === "grilled" || /\bgrilled|charred\b/.test(source)) {
    return "show grilled fish with char marks, browned skin or edges, and recognizable fish shape.";
  }

  if (cookingMethodKey === "fried" || /\bfried|crispy\b/.test(source)) {
    return "show fried fish pieces or fillets with crisp browned exterior and visible fish shape.";
  }

  if (cookingMethodKey === "baked" || /\bbaked|roasted\b/.test(source)) {
    return "show baked fish as fillets, pieces, or whole fish with flaky texture and lightly browned surface.";
  }

  return "show fish as a visible fillet, whole fish, or fish pieces with flaky seafood texture as the dominant protein.";
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
