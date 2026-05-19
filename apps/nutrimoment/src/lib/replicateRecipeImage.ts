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

const ARABIC_FOOD_MEANINGS: Array<{ pattern: RegExp; promptMeaning: string; keywords: string[] }> = [
  {
    pattern: /\u064a\u062e\u0646(?:\u0629|\u0647|\u064a)/iu,
    promptMeaning:
      "يخنة / يخنه / yakhna means a savory stew or soup-like dish with broth or sauce and visible solids; it is never a dessert, sweet pudding, cake, custard, or candy",
    keywords: ["stew", "soup", "broth", "savory"]
  },
  {
    pattern: /\u0634\u0648\u0631\u0628(?:\u0629|\u0647)|\u062d\u0633\u0627\u0621|\u0645\u0631\u0642(?:\u0629|\u0647)?/iu,
    promptMeaning: "شوربة / حساء / مرقة means soup or broth served in a bowl with visible liquid",
    keywords: ["soup", "broth"]
  },
  {
    pattern: /\u0645\u0639?\u0643\u0631\u0648\u0646(?:\u0629|\u0647)?/iu,
    promptMeaning: "معكرونة / مكرونة / makarona means pasta or macaroni, usually short pasta or spaghetti depending on the recipe",
    keywords: ["pasta", "macaroni", "spaghetti"]
  }
];

const ARABIC_PROMPT_INGREDIENT_ALIASES: Array<{ pattern: RegExp; english: string }> = [
  { pattern: /\u0639\u062f\u0633/iu, english: "lentils" },
  { pattern: /\u062e\u0636(?:\u0627\u0631|\u0631\u0648\u0627\u062a)|\u062e\u0636\u0631/iu, english: "vegetables" },
  { pattern: /\u062c\u0632\u0631/iu, english: "carrot" },
  { pattern: /\u0637\u0645\u0627\u0637\u0645|\u0628\u0646\u062f\u0648\u0631(?:\u0629|\u0647)/iu, english: "tomato" },
  { pattern: /\u0635\u0644\u0635(?:\u0629|\u0647)/iu, english: "sauce" },
  { pattern: /\u0641\u0648\u0644/iu, english: "ful medames fava bean mash" },
  { pattern: /\u0628\u0635\u0644/iu, english: "onion" },
  { pattern: /\u062b\u0648\u0645/iu, english: "garlic" },
  { pattern: /\u0623?\u0631\u0632|\u0631\u0632/iu, english: "rice" },
  { pattern: /\u0628\u0637\u0627\u0637(?:\u0633|\u0627)/iu, english: "potato" },
  { pattern: /\u062f\u062c\u0627\u062c|\u0641\u0631\u0627\u062e/iu, english: "chicken" },
  { pattern: /\u062c\u0645\u0628\u0631\u064a|\u0631\u0648\u0628\u064a\u0627\u0646/iu, english: "shrimp" },
  { pattern: /\u0633\u0645\u0643/iu, english: "fish" }
];

const DISH_VISUAL_PROMPTS: Record<string, DishVisualPrompt> = {
  hawawshi: {
    englishName: "Egyptian hawawshi",
    visualDescription:
      "closed Egyptian baladi bread or pita stuffed internally with spiced ground meat, onion, pepper, parsley, cumin, coriander, or chili only when listed, then baked or pan-toasted flat until the outside is crispy, golden brown, blistered, and slightly oily. Show the bread opened, cut in half, or cut into triangular wedges so the browned minced meat filling is clearly visible inside the bread. The meat must be enclosed inside the bread pocket and visible only through the opened cut seam, not spread on top like a pizza or flatbread",
    plating:
      "served as one opened stuffed baladi bread, pita halves, or stacked/fanned crispy stuffed bread wedges on a simple plate, similar to Egyptian street-food hawawshi. Pickles, tahini sauce, tomato, onion, or lemon wedges may appear only if listed or structurally required, and must stay secondary",
    avoid:
      "random flatbread with toppings, open-faced flatbread, pizza, lahmacun, pide, manakish, cheese flatbread, beef skewers, kebab skewers, kofta logs, adana kebab, grilled meat sticks, burger bun, hamburger, open sandwich, quesadilla, tacos, shawarma wrap, cheese, pasta, rice bowl, loose meatballs, loose ground beef, thick bread loaf, random vegetables, toppings sitting on top of bread",
    cuisineStyle: "authentic Egyptian street food"
  },
  "roast-chicken": {
    englishName: "roast chicken",
    visualDescription:
      "golden roasted chicken pieces or a whole roasted chicken with browned crisp skin, pan juices, and visible roasted texture. The chicken must be the hero, not hidden under rice or salad",
    plating: "served on a simple roasting pan or plate with only recipe-listed aromatics or vegetables",
    avoid: "rice bowl, plain boiled chicken, chicken cubes, fried chicken coating, curry sauce, pasta, unrelated salad, skewers",
    cuisineStyle: "editorial home-cooking"
  },
  "butter-chicken": {
    englishName: "butter chicken",
    visualDescription:
      "tender chicken pieces in a rich orange-red creamy makhani curry sauce, glossy and thick, with chicken chunks visible at the surface",
    plating: "served in one bowl or shallow dish; rice or naan only if listed and kept secondary",
    avoid: "dry grilled chicken, fried chicken, plain rice bowl, pasta, green curry, tomato soup, hidden chicken",
    cuisineStyle: "authentic Indian curry"
  },
  "garlic-butter-chicken": {
    englishName: "garlic butter chicken",
    visualDescription:
      "golden pan-seared chicken breast or cutlets in a glossy garlic butter pan sauce, with browned edges and visible sauce sheen",
    plating: "served as chicken cutlets or breast pieces in a skillet or plate with sauce; sides only if listed",
    avoid: "rice bowl, curry sauce, fried chicken, skewers, pasta unless listed, unrelated vegetables, hidden chicken",
    cuisineStyle: "weeknight skillet chicken"
  },
  "kung-pao-chicken": {
    englishName: "kung pao chicken",
    visualDescription:
      "bite-size chicken cubes in a glossy dark Chinese stir-fry sauce with peanuts, dried red chiles, scallions, and peppers only when listed",
    plating: "served in a wok-style bowl or shallow plate with chicken cubes clearly visible",
    avoid: "whole chicken breast, fried chicken drumsticks, curry, cream sauce, plain rice bowl hiding chicken, pasta",
    cuisineStyle: "Chinese stir-fry"
  },
  "southern-fried-chicken": {
    englishName: "southern buttermilk fried chicken",
    visualDescription:
      "crispy golden-brown fried chicken pieces with craggy seasoned crust, juicy chicken visible at an edge, clearly fried chicken not nuggets",
    plating: "served as fried chicken pieces on parchment or a plate; sides only if listed",
    avoid: "grilled chicken, curry, rice bowl, chicken cubes in sauce, pasta, skewers, breaded fish",
    cuisineStyle: "Southern American fried chicken"
  },
  "cilantro-lime-chicken": {
    englishName: "cilantro lime chicken",
    visualDescription:
      "grilled or pan-seared chicken pieces with lime and cilantro/coriander finish only when listed, bright green herb flecks and charred golden surface",
    plating: "served as sliced chicken, chunks, or cutlets on one plate with lime-herb finish; sides only if listed",
    avoid: "cream sauce, curry, fried chicken, plain rice bowl, pasta, unrelated salad, hidden chicken",
    cuisineStyle: "Mexican or fresh lime-herb chicken"
  },
  "creamy-spinach-chicken": {
    englishName: "creamy spinach chicken",
    visualDescription:
      "golden chicken cutlets or breast pieces in a pale creamy sauce with visible spinach leaves, sauce coating the chicken but not hiding it",
    plating: "served in one skillet or shallow plate with creamy spinach sauce and chicken clearly visible",
    avoid: "tomato curry, fried chicken, rice bowl, pasta unless listed, soup, hidden chicken, unrelated vegetables",
    cuisineStyle: "creamy skillet chicken"
  },
  "sumac-chicken": {
    englishName: "sumac chicken",
    visualDescription:
      "roasted or pan-seared chicken pieces with reddish-purple sumac seasoning, browned skin or edges, onion or herbs only when listed",
    plating: "served as a Middle Eastern chicken plate with the seasoned chicken as the clear hero",
    avoid: "rice bowl hiding chicken, curry, creamy sauce, fried chicken, pasta, unrelated salad, skewers unless listed",
    cuisineStyle: "Middle Eastern chicken"
  },
  "desi-gravy-chicken": {
    englishName: "desi gravy chicken",
    visualDescription:
      "chicken pieces in a deep orange-brown Indian-style onion-tomato gravy, with visible chunks of chicken and glossy spiced sauce",
    plating: "served in one bowl or shallow curry dish; rice or flatbread only if listed and secondary",
    avoid: "dry grilled chicken, fried chicken, cream-only sauce, pasta, plain rice bowl, hidden chicken",
    cuisineStyle: "Indian home-style chicken gravy"
  },
  "korean-fried-chicken": {
    englishName: "Korean fried chicken",
    visualDescription:
      "crispy bite-size or wing-style fried chicken pieces glazed in red or soy-garlic sauce, glossy and crunchy with sesame/scallion only when listed",
    plating: "served as a pile of glazed crispy chicken pieces on a plate or bowl, no unrelated sides",
    avoid: "plain roast chicken, curry, cream sauce, rice bowl, pasta, nuggets without glaze, hidden chicken",
    cuisineStyle: "Korean fried chicken"
  },
  "soy-garlic-chicken": {
    englishName: "soy garlic chicken",
    visualDescription:
      "chicken pieces or sliced chicken coated in a glossy soy-garlic glaze, browned and shiny, with scallion or sesame only when listed",
    plating: "served in one skillet-style plate or over a small supporting base only if listed; chicken remains dominant",
    avoid: "cream sauce, curry, plain boiled chicken, fried chicken crust unless requested, pasta, rice hiding chicken",
    cuisineStyle: "Asian soy-garlic chicken"
  },
  "chicken-rice-skillet": {
    englishName: "chicken and rice skillet",
    visualDescription:
      "seared chicken pieces nestled into seasoned rice in one skillet or tray, with rice integrated around the chicken and chicken still clearly visible on top",
    plating: "served in a skillet or shallow plate as a complete chicken-and-rice dish, not a plain rice bowl",
    avoid: "plain white rice bowl, curry, pasta, fried chicken, hidden chicken, unrelated salad, tiny chicken garnish",
    cuisineStyle: "home-style chicken and rice"
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
      "Egyptian mahshi as hollowed or rolled vegetables filled internally with seasoned rice, herbs, and optional minced meat only when listed. The stuffed item must be the main subject: zucchini cylinders, cabbage rolls, grape-leaf rolls, bell peppers, tomatoes, or eggplant with the filling packed inside, not rice or meat placed beside a vegetable",
    plating:
      "served as arranged stuffed vegetables on one plate or shallow tray, with at least one cut-open or open-topped piece showing the rice/herb/meat filling inside the vegetable or roll",
    avoid:
      "rice pile beside vegetables, meat on top of rice, unstuffed tomato rice, plain rice bowl, loose ground meat bowl, salad bowl, raw vegetables, pasta, kebab, burger, pizza, unrelated grilled meat",
    cuisineStyle: "authentic Egyptian home cooking"
  },
  "kousa-mahshi": {
    englishName: "kousa mahshi",
    visualDescription:
      "Middle Eastern or Egyptian stuffed zucchini: short pale-green zucchini or courgette cylinders hollowed out and filled internally with seasoned rice, herbs, tomato, and optional minced meat only when listed. The open ends should reveal the filling inside each zucchini",
    plating:
      "served as several stuffed zucchini cylinders in tomato sauce or light broth on one plate or shallow bowl, with at least one piece cut or angled so the filling is visible inside",
    avoid:
      "rice served beside zucchini, loose meat over rice, sliced zucchini stir-fry, unstuffed zucchini stew, pasta, kebab, burger, salad bowl",
    cuisineStyle: "authentic Egyptian or Levantine mahshi"
  },
  "stuffed-cabbage-rolls": {
    englishName: "stuffed cabbage rolls",
    visualDescription:
      "rolled cabbage leaves wrapped tightly around an internal rice, herb, and optional minced-meat filling only when listed. The rolls should look compact and cooked, with filling visible in one cut-open roll",
    plating:
      "served as a neat stack or circular arrangement of cabbage rolls in broth or tomato sauce, with no loose rice pile outside the rolls",
    avoid:
      "plain cabbage salad, unrolled cabbage stew, rice on the side, meat over rice, grape leaves if cabbage is named, pasta, kebab",
    cuisineStyle: "Egyptian or Middle Eastern stuffed cabbage"
  },
  "warak-enab": {
    englishName: "warak enab",
    visualDescription:
      "small grape leaves or vine leaves rolled tightly around seasoned rice and herbs, optionally with minced meat only when listed. The filling must be inside the green leaf rolls",
    plating:
      "served as compact grape-leaf rolls arranged in rows or a circular stack, with lemon or broth only when listed and one roll cut open if possible",
    avoid:
      "plain loose rice, meat over rice, cabbage rolls, salad leaves, unrolled green vegetables, pasta, kebab",
    cuisineStyle: "Egyptian or Levantine stuffed grape leaves"
  },
  "stuffed-bell-peppers": {
    englishName: "stuffed bell peppers",
    visualDescription:
      "whole bell peppers hollowed and filled internally with seasoned rice, herbs, tomato, and optional minced meat only when listed. The peppers should be upright or halved with the filling visibly inside",
    plating:
      "served as stuffed bell peppers in tomato sauce or a shallow baking dish, not as rice beside pepper pieces",
    avoid:
      "pepper slices on rice, loose rice bowl, unstuffed pepper stew, meat over rice, pasta, salad bowl",
    cuisineStyle: "Mediterranean or Middle Eastern stuffed peppers"
  },
  "tomato-mahshi": {
    englishName: "tomato mahshi",
    visualDescription:
      "whole tomatoes hollowed and filled internally with seasoned rice, herbs, tomato pulp, and optional minced meat only when listed. The filling should be inside the tomato shells, with tomato caps or open tops visible",
    plating:
      "served as stuffed tomatoes in a shallow plate or baking dish with sauce around them; do not show rice merely mixed with chopped tomatoes",
    avoid:
      "tomato rice pile, rice beside tomatoes, loose meat over rice, salad, pasta, unstuffed tomato stew, kebab",
    cuisineStyle: "Mediterranean or Middle Eastern tomato mahshi"
  },
  "stuffed-eggplant": {
    englishName: "stuffed eggplant",
    visualDescription:
      "eggplant halves, boats, or whole split eggplants filled internally with rice/herbs or minced meat mixture only when listed. The eggplant shell must cradle the filling visibly",
    plating:
      "served as stuffed eggplant boats or split eggplants in tomato sauce or a shallow tray, with the filling inside the eggplant and not as a side pile",
    avoid:
      "layered moussaka, eggplant dip, rice beside eggplant, loose meat bowl, kebab, pasta, salad",
    cuisineStyle: "Middle Eastern stuffed eggplant"
  },
  "sheikh-el-mahshi": {
    englishName: "sheikh el mahshi",
    visualDescription:
      "small eggplants or zucchini split and stuffed internally with minced meat, onions, pine nuts, tomato sauce, or yogurt only when listed. The vegetable shell should be clearly stuffed with meat inside",
    plating:
      "served as stuffed vegetable boats in sauce, with the minced-meat filling visible in the split opening and no loose meat pile on the side",
    avoid:
      "plain kofta, kebab, loose minced meat over rice, unstuffed eggplant stew, layered casserole, pasta, salad",
    cuisineStyle: "Levantine stuffed vegetable dish"
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
      "Egyptian ful medames: slow-cooked fava beans crushed into a coarse warm mash or thick puree, with some soft broken bean skins visible but not a bowl of separate whole beans. The texture should look creamy, spoonable, rustic, and mashed with olive oil, lemon, cumin, tahini, tomato, onion, pepper, or parsley only when listed",
    plating:
      "served in one small Egyptian breakfast bowl or deep plate as a thick ful puree/mash with oil sheen and shallow spoon swirls; optional listed toppings sit on the surface but the mashed fava base remains the clear subject",
    avoid:
      "plain whole beans, separate intact beans as the main texture, generic bean salad, chickpea hummus, smooth beige hummus dip, lentil soup, rice, pasta, meat stew, salad bowl",
    cuisineStyle: "authentic Egyptian breakfast"
  },
  "ful-bil-zeit": {
    englishName: "ful bil zeit",
    visualDescription:
      "ful bil zeit made from ful medames: crushed fava beans with a coarse mashed puree texture, dressed generously with olive oil, lemon, cumin, and simple herbs or vegetables only when listed. It should look glossy and spoonable, not like separate whole beans",
    plating: "served in one shallow bowl or deep plate, with olive oil pooling lightly over the mashed ful surface and no unrelated toppings",
    avoid: "plain whole beans, dry bean salad, hummus dip, lentil soup, rice, pasta, meat stew, eggs unless listed",
    cuisineStyle: "Levantine or Egyptian fava bean breakfast"
  },
  "spicy-ful-bil-zeit": {
    englishName: "spicy ful bil zeit",
    visualDescription:
      "spicy ful bil zeit made from coarse mashed ful medames, not whole beans. The mashed fava base is topped with hot oil or chili oil, tahini, lemon, cumin, and a small vegetable garnish only when listed. The surface should show red-orange spicy oil and creamy tahini streaks if tahini is listed",
    plating: "served in one breakfast bowl or deep plate with toppings visible on the mashed ful surface",
    avoid: "plain whole beans with no mash texture, hummus, lentil soup, rice, pasta, egg tray, meat stew",
    cuisineStyle: "Egyptian street-style spicy ful"
  },
  "alexandrian-ful": {
    englishName: "Alexandrian ful",
    visualDescription:
      "Egyptian Alexandrian ful with crushed ful medames fava bean mash mixed with tomato, green or red pepper, garlic, cumin, coriander, lemon, chili, and herbs only when listed. It should look colorful, saucy, rustic, and spoonable, with mashed fava texture rather than intact beans",
    plating: "served in one shallow bowl or plate with tomato-pepper topping visible over the mashed ful",
    avoid: "plain whole brown beans, generic bean salad, hummus, lentil soup, rice, pasta, unrelated salad bowl",
    cuisineStyle: "authentic Alexandrian Egyptian breakfast"
  },
  "ful-with-fried-egg": {
    englishName: "ful with fried egg",
    visualDescription:
      "Egyptian ful medames coarse fava bean mash topped with one or two fried eggs or visible cooked eggs only when eggs are listed, with the mashed ful underneath and cumin, lemon, oil, or vegetables only when listed",
    plating: "served as one breakfast plate or shallow bowl where both the mashed ful base and egg are clearly visible",
    avoid: "plain eggs without beans, shakshuka tomato sauce, omelette, rice, pasta, sausage unless listed",
    cuisineStyle: "Egyptian suhoor or breakfast plate"
  },
  "ful-eggs-cheese-tagine": {
    englishName: "ful tagine with eggs and cheese",
    visualDescription:
      "baked ful tagine with coarse mashed ful medames fava bean base, visible eggs, and melted or softened cheese only when cheese is listed. The dish should look like a warm baked tray or shallow casserole, not a plain bowl of whole beans",
    plating: "served in one small oven dish or shallow tray with eggs and cheese visible on top of the mashed ful",
    avoid: "plain ful bowl, omelette without beans, sausage, basterma, pasta, rice, soup",
    cuisineStyle: "Egyptian baked ful breakfast tray"
  },
  "ful-eggs-sausage-tray": {
    englishName: "ful tray with eggs and sausage",
    visualDescription:
      "Egyptian ful tray with coarse mashed ful medames fava bean base, visible eggs, and sliced sausage only when sausage is listed. The tray should look baked or skillet-cooked with mashed ful underneath",
    plating: "served in one shallow tray or skillet with mashed ful, egg, and sausage all visible",
    avoid: "plain sausage and eggs without ful, cheese unless listed, basterma, pasta, rice, soup",
    cuisineStyle: "Egyptian breakfast tray"
  },
  "ful-eggs-basterma-tagine": {
    englishName: "ful tagine with eggs and basterma",
    visualDescription:
      "Egyptian ful tagine with coarse mashed ful medames fava bean base, visible eggs, and thin reddish-brown basterma or pastrami slices only when basterma or pastrami is listed. The mashed ful should still be visible under the toppings",
    plating: "served in one shallow baked dish or skillet with mashed ful, eggs, and basterma clearly separated",
    avoid: "plain eggs and pastrami without ful, sausage, cheese unless listed, rice, pasta, soup",
    cuisineStyle: "Egyptian breakfast tagine"
  },
  "ful-sandwich": {
    englishName: "Egyptian ful sandwich",
    visualDescription:
      "Egyptian ful medames coarse fava bean mash stuffed in baladi bread, pita, or sandwich bread only when bread is listed, with the mashed ful filling visible and tomato, cucumber, pickles, tahini, or herbs only when listed",
    plating: "served as one sandwich or split bread pocket with thick mashed ful filling visible",
    avoid: "whole loose beans in bread, plain bowl of beans, hummus wrap, falafel sandwich, meat sandwich, rice, pasta",
    cuisineStyle: "Egyptian street-food breakfast sandwich"
  },
  "eggs-with-basterma": {
    englishName: "Egyptian eggs with basterma",
    visualDescription:
      "fried or baked eggs cooked with thin reddish-brown basterma or pastrami slices, with eggs and cured meat clearly visible. This is an egg dish, not a ful dish unless fava beans are listed",
    plating: "served in one skillet or breakfast plate with basterma around or under the eggs",
    avoid: "ful beans unless listed, sausage, bacon, plain omelette, shakshuka tomato sauce, rice, pasta",
    cuisineStyle: "Egyptian breakfast"
  },
  "turkish-sunny-side-eggs": {
    englishName: "Turkish sunny-side eggs",
    visualDescription:
      "Turkish-style sunny-side fried eggs with intact yolks, cooked in butter or olive oil with red pepper flakes, paprika, herbs, tomato, or pepper only when listed. The eggs should be the clear subject, not scrambled",
    plating: "served in one small skillet or breakfast plate with the yolks visible",
    avoid: "menemen scrambled eggs, shakshuka tomato sauce, omelette, boiled eggs, ful beans, rice, pasta",
    cuisineStyle: "Turkish breakfast"
  },
  "sunny-eggs-with-meat": {
    englishName: "sunny-side eggs with meat",
    visualDescription:
      "sunny-side fried eggs cooked with browned minced meat or small meat pieces only when meat is listed, with egg yolks visible and the meat clearly separate from the eggs",
    plating: "served in one skillet or breakfast plate with both eggs and meat visible",
    avoid: "plain eggs, sausage, basterma, ful beans, shakshuka, pasta, rice, burger",
    cuisineStyle: "Middle Eastern breakfast skillet"
  },
  "sunny-eggs-red-pepper": {
    englishName: "sunny-side eggs with red pepper",
    visualDescription:
      "sunny-side fried eggs with visible red pepper strips, chili, or red pepper flakes only when listed, bright pepper pieces around the eggs",
    plating: "served in one small skillet or breakfast plate with yolks and red pepper visible",
    avoid: "plain eggs, scrambled eggs, shakshuka sauce, meat, sausage, ful beans, pasta, rice",
    cuisineStyle: "simple breakfast eggs"
  },
  "sunny-eggs-with-sausage": {
    englishName: "sunny-side eggs with sausage",
    visualDescription:
      "sunny-side fried eggs cooked with sliced sausage only when sausage is listed, with visible yolks and sausage pieces browned around the eggs",
    plating: "served in one skillet or breakfast plate with egg and sausage clearly visible",
    avoid: "plain eggs, basterma, bacon, ful beans, shakshuka, pasta, rice",
    cuisineStyle: "breakfast egg skillet"
  },
  "sunny-eggs-avocado-toast": {
    englishName: "sunny-side eggs with avocado toast",
    visualDescription:
      "toast topped with mashed or sliced avocado and sunny-side fried egg only when avocado and bread or toast are listed, with the egg yolk visible and avocado green clearly present",
    plating: "served as one toast or open-faced breakfast plate",
    avoid: "plain eggs, ful beans, meat skillet, no bread, no avocado, rice, pasta",
    cuisineStyle: "modern breakfast toast"
  },
  "eggs-with-mushrooms": {
    englishName: "eggs with mushrooms",
    visualDescription:
      "eggs cooked with sliced mushrooms only when mushrooms are listed, as a skillet, omelet, or fried egg plate with mushrooms clearly visible",
    plating: "served as one breakfast plate or skillet with egg and mushroom both visible",
    avoid: "plain eggs, avocado toast, sausage, meat, ful beans, rice, pasta",
    cuisineStyle: "light breakfast eggs"
  },
  "egg-mushroom-sandwich": {
    englishName: "egg mushroom sandwich",
    visualDescription:
      "sandwich or toast filled with egg and sliced mushrooms only when bread or toast and mushrooms are listed, with the egg and mushrooms visible at the cut or open face",
    plating: "served as one sandwich, toast, or split bread with filling visible",
    avoid: "plain egg plate, no bread, avocado toast, meat sandwich, ful sandwich, rice, pasta",
    cuisineStyle: "breakfast sandwich"
  },
  "fried-eggs-with-onion": {
    englishName: "fried eggs with onion",
    visualDescription:
      "fried eggs or sunny-side eggs cooked with visible onion slices or caramelized onion only when onion is listed, with egg yolks or cooked egg clearly visible",
    plating: "served in one simple skillet or breakfast plate with onion and eggs visible",
    avoid: "plain eggs, mushroom eggs, avocado toast, sausage, meat, ful beans, rice, pasta",
    cuisineStyle: "simple Middle Eastern breakfast eggs"
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
      "long spicy ground/minced lamb or beef kebab hand-molded tightly around flat metal skewers, with visible ridged compressed-mince texture, red pepper/paprika color, juicy charred edges, and grill marks. The kebab must look like Adana-style minced meat paste on skewers, never beef cubes, diced meat, chopped steak, or sliced pieces",
    plating:
      "served on a Turkish kebab plate with the long kebabs laid over lavash or flatbread only if listed, grilled tomato and long green pepper only if listed, sumac onion and parsley garnish only if listed, and bulgur or salad only as a small side if listed",
    avoid: "meatballs, burger, steak, beef cubes, diced meat, chopped steak pieces, sliced beef, shawarma strips, kebab cubes, pasta, soup, rice as the main subject, generic kofta logs without skewers, thick burger-like patties",
    cuisineStyle: "authentic Turkish grilled food"
  },
  "adana-durum": {
    englishName: "Turkish Adana durum",
    visualDescription:
      "spicy Adana-style minced lamb or beef kebab wrapped in thin lavash as a durum, with the long ridged charred minced-meat strip visible at one open end or in a partially opened wrap. The meat should look like Adana kebab, not sliced doner or shawarma",
    plating:
      "served as one lavash wrap or cut durum on a plate or board, with sumac onion, parsley, grilled tomato, or long green pepper only if listed",
    avoid:
      "plain kebab plate without wrap, burrito, tortilla wrap, shawarma slices, doner shavings, burger, meatballs, beef cubes, lahmacun unless the recipe explicitly includes it",
    cuisineStyle: "authentic Turkish street food"
  },
  "adana-lahmacun-plate": {
    englishName: "Adana kebab with lahmacun",
    visualDescription:
      "Turkish combo plate showing both long ridged Adana minced-meat kebab skewers and a separate thin round lahmacun with a finely minced meat topping. Both the skewered kebab and the lahmacun flatbread must be visible and distinct",
    plating:
      "served as a mixed Turkish grill-and-flatbread plate with lemon, parsley, sumac onion, grilled tomato, or pepper only if listed",
    avoid:
      "only lahmacun, only kebab, pizza with cheese, pide boat, shawarma, meat cubes, burger, meatballs, generic mixed grill where lahmacun is missing",
    cuisineStyle: "authentic Turkish grill-house food"
  },
  "cag-kebap": {
    englishName: "Turkish cag kebap",
    visualDescription:
      "thin slices of marinated lamb cooked on a horizontal rotating spit or served on small skewers, with browned edges and juicy sliced meat texture. It should read as Erzurum-style cag kebap, not ground minced Adana kebab",
    plating:
      "served on flatbread or a simple Turkish plate with onion, tomato, pepper, or herbs only if listed",
    avoid:
      "ground meat logs, adana kebab, kofta, burger, beef cubes, shawarma wrap, chicken doner, pasta, rice bowl",
    cuisineStyle: "authentic Turkish kebab house food"
  },
  "doner-kebab": {
    englishName: "Turkish doner kebab",
    visualDescription:
      "thin shaved layers of seasoned lamb or beef doner with stacked sliced texture, browned edges, and Turkish street-food presentation. The meat must be sliced from a vertical roast, not ground meat skewers",
    plating:
      "served on flatbread, rice, or a plate only if listed; include tomato, onion, parsley, yogurt, or pickles only if listed",
    avoid:
      "adana kebab, kofta logs, meatballs, beef cubes, burger, lahmacun, pide, pasta, stew",
    cuisineStyle: "authentic Turkish street food"
  },
  "chicken-shawarma": {
    englishName: "chicken shawarma",
    visualDescription:
      "Middle Eastern chicken shawarma made from thin sliced, shaved, or chopped marinated chicken with golden-brown edges, shawarma spice color, and juicy roasted texture. The chicken must look like sliced shawarma pieces or a filled shawarma wrap, not kebab skewers, whole chicken breast, plain cubes, or fried chicken",
    plating:
      "served as a pita or lavash wrap with chicken visible at the open end, or as a shawarma plate/bowl with sliced chicken as the hero. Include garlic sauce, tahini, pickles, tomato, onion, lettuce, fries, rice, or bread only if listed or required by the exact shawarma form",
    avoid:
      "beef, lamb, doner cone, kofta, kebab skewers, shish tawook skewers, whole chicken breast, generic chicken cubes, fried chicken, taco, burrito, burger, random salad, plain rice bowl hiding the chicken",
    cuisineStyle: "authentic Middle Eastern shawarma street food"
  },
  "beef-shawarma": {
    englishName: "beef shawarma",
    visualDescription:
      "Middle Eastern beef shawarma made from thin sliced or shaved marinated beef strips with dark browned edges, warm spice color, and stacked sliced-meat texture. The beef must look like shawarma slices or filling, not ground beef, kofta, steak cubes, stew chunks, or kebab skewers",
    plating:
      "served as a pita or lavash wrap with beef slices visible at the open end, or as a shawarma plate/bowl with thin beef strips as the hero. Include tahini sauce, garlic sauce, pickles, onion, tomato, parsley, fries, rice, or bread only if listed or required by the exact shawarma form",
    avoid:
      "chicken, lamb-only plate, ground beef, minced meat, kofta, adana kebab, kebab skewers, steak cubes, stew chunks, burger, meatballs, doner cone, taco, burrito, plain rice bowl hiding the beef",
    cuisineStyle: "authentic Middle Eastern shawarma street food"
  },
  "lamb-shawarma": {
    englishName: "lamb shawarma",
    visualDescription:
      "Middle Eastern lamb shawarma made from thin sliced or shaved marinated lamb with browned roasted edges, tender layered texture, and warm shawarma spices. The lamb must read as sliced shawarma meat, not lamb chops, rack of lamb, kofta, Adana kebab, cubes, or stew",
    plating:
      "served as an open pita or lavash wrap with lamb slices visible, or as a shawarma plate/bowl with lamb strips clearly on top. Include yogurt, tahini, pickles, onion, tomato, parsley, rice, fries, or bread only if listed or required by the exact shawarma form",
    avoid:
      "chicken, beef-only plate, lamb chops, rack of lamb, ground lamb, kofta, adana kebab, kebab skewers, lamb cubes, stew, burger, doner cone, taco, burrito, plain rice bowl hiding the lamb",
    cuisineStyle: "authentic Middle Eastern shawarma street food"
  },
  "beef-lamb-shawarma": {
    englishName: "beef and lamb shawarma",
    visualDescription:
      "mixed beef and lamb shawarma with thin shaved marinated meat slices, browned roasted edges, and visible layered shawarma texture. It must look like sliced shawarma filling in a wrap or plate, not ground meat, kofta, kebab skewers, steak cubes, or stew chunks",
    plating:
      "served as a pita or lavash wrap with mixed shawarma meat visible at the open end, or as a shawarma plate/bowl with the sliced meat as the hero. Include sauces, pickles, salad vegetables, rice, fries, or bread only if listed or required by the exact shawarma form",
    avoid:
      "chicken-only shawarma, ground meat, minced meat, kofta, adana kebab, kebab skewers, meatballs, burger, steak cubes, stew chunks, doner cone, taco, burrito, plain rice bowl hiding the meat",
    cuisineStyle: "authentic Middle Eastern shawarma street food"
  },
  "iskender-kebab": {
    englishName: "Turkish Iskender kebab",
    visualDescription:
      "thin slices of doner lamb or beef served over torn pide bread, topped with tomato sauce and melted butter, with a spoonful of yogurt on the side only when listed. The dish should read as Bursa-style Iskender kebab, not ground meat skewers",
    plating:
      "served on one plate with sliced doner layered over bread pieces; tomato sauce, butter gloss, yogurt, grilled tomato, or pepper only if listed",
    avoid:
      "adana kebab, kofta logs, meatballs, lavash wrap, lahmacun, pide boat, burger, beef cubes, pasta, plain rice bowl",
    cuisineStyle: "authentic Turkish kebab house food"
  },
  "turkish-kofta": {
    englishName: "Turkish kofta",
    visualDescription:
      "Turkish-style ground beef or lamb kofta shaped as short oval logs or meatballs, browned and juicy, optionally served with yogurt sauce, tomato sauce, parsley, or sumac onion only when listed. It should look like kofte, not Adana's long flat skewers",
    plating:
      "served as a Turkish kofta plate with sauce, salad, bread, bulgur, or rice only if listed",
    avoid:
      "long flat Adana skewers, lavash wrap, lahmacun, pide, burger patties, beef cubes, sliced steak, shawarma, pasta",
    cuisineStyle: "authentic Turkish home or grill-house food"
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
  "kiymali-tepsi-boregi": {
    englishName: "Turkish kiymali tepsi boregi",
    visualDescription:
      "rectangular or tray-baked Turkish phyllo borek with spiced ground beef layered between thin pastry sheets, golden flaky top, and a cut piece showing the minced-meat filling inside",
    plating:
      "served as square or rectangular slices from a tray on a plate or board; yogurt or salad only if listed",
    avoid:
      "spiral borek coil, flatbread, pide, lahmacun, pizza, burger, kofta skewers, loose stew, pasta, rice",
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
  "turkish-ground-beef-stew": {
    englishName: "Turkish ground beef stew",
    visualDescription:
      "home-style Turkish ground beef and vegetable stew with crumbled browned meat in a tomato-rich sauce, potatoes, peas, carrots, peppers, or onion only when listed. The meat should be loose minced beef, not meatballs or kebab",
    plating:
      "served in a shallow bowl or plate as a rustic stew; rice, bread, yogurt, or herbs only if listed",
    avoid:
      "kofta logs, adana skewers, meatballs, burger patties, pasta sauce, chili con carne, dry rice bowl, sliced steak",
    cuisineStyle: "authentic Turkish home cooking"
  },
  "turkey-picadillo": {
    englishName: "Turkey picadillo",
    visualDescription:
      "Latin-style ground turkey picadillo with loose minced turkey simmered in tomato sauce with peppers, onion, olives, raisins, potatoes, or spices only when listed. This is turkey poultry, not Turkish cuisine",
    plating:
      "served as a saucy ground turkey dish in a bowl or over rice only if rice is listed",
    avoid:
      "Turkish kebab, adana, kofta, pide, lahmacun, shawarma, beef cubes, burger, pasta",
    cuisineStyle: "Latin home cooking"
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
  },
  "samak-bel-radah": {
    englishName: "Samak bel radah",
    visualDescription:
      "Egyptian fish coated or rubbed with wheat bran/rada and spices, cooked until browned with visible rustic bran crust or coating, with lemon, cumin, coriander, garlic, and herbs only when listed. The fish should remain recognizable as whole fish or large pieces",
    plating:
      "served as one Egyptian fish plate with the bran-coated fish prominent; bread, salad, or tahini only if listed",
    avoid: "plain white fillet, steamed fish, sushi, pasta, rice bowl, shrimp, chicken, beef, smooth breadcrumb crust if rada or bran is not listed",
    cuisineStyle: "authentic Egyptian fish with rada"
  },
  "egyptian-smoked-fish": {
    englishName: "Egyptian smoked fish",
    visualDescription:
      "Egyptian smoked fish such as ringa, feseekh, or smoked mullet presented as visible fish portions with smoky browned skin or flaky flesh, with onion, lemon, tahini, bread, tomato, or cucumber only when listed",
    plating:
      "served as one simple Egyptian smoked fish plate, not a modern salad bowl, with fish pieces clearly visible",
    avoid: "raw sushi, grilled fresh fish, generic salmon steak, pasta, rice bowl, shrimp, chicken, beef, hidden fish",
    cuisineStyle: "authentic Egyptian smoked fish plate"
  },
  "egyptian-fried-tilapia": {
    englishName: "Egyptian fried tilapia",
    visualDescription:
      "whole or large-piece Egyptian fried tilapia cooked golden and crisp, seasoned with cumin, coriander, garlic, lemon, or chili only when listed. The tilapia shape should be visible, not a generic breaded stick",
    plating:
      "served as one crisp fried fish plate with lemon or simple salad only if listed",
    avoid: "fish sticks, sushi, steamed fish, creamy fish, pasta, rice covering fish, shrimp, chicken, beef",
    cuisineStyle: "authentic Egyptian fried fish"
  },
  "egyptian-baked-fish-tray": {
    englishName: "Egyptian baked fish tray",
    visualDescription:
      "Egyptian oven-baked fish tray with whole fish, tilapia, or fish pieces baked with tomato, pepper, garlic, onion, lemon, cumin, coriander, herbs, potato slices, or tomato sauce only when listed. The tray form must be clear and the fish must not be hidden",
    plating:
      "served in one shallow baking tray or from a tray, with fish and listed vegetables visible",
    avoid: "plain isolated fillet, sushi, pasta, paella, shrimp-only dish, chicken, beef, unrelated roasted vegetables hiding the fish",
    cuisineStyle: "authentic Egyptian home-style oven fish"
  },
  "alexandrian-shrimp": {
    englishName: "Alexandrian shrimp",
    visualDescription:
      "Egyptian Alexandrian shrimp with whole curled pink-orange shrimp sauteed in a bright garlic, cumin, coriander, chili, lemon, tomato, pepper, and herb mixture only when those ingredients are listed. The shrimp must be the clear main subject and look coastal Egyptian, spicy, and saucy, not a generic shrimp cocktail",
    plating:
      "served as one shallow skillet or Egyptian seafood plate with shrimp visible on top, lemon and herbs only if listed, bread or rice only as a small support if listed",
    avoid:
      "plain boiled shrimp, shrimp cocktail, breaded fried shrimp, pasta, creamy sauce, curry sauce, generic Mediterranean salad, rice mound hiding shrimp, grass background, chicken, beef",
    cuisineStyle: "authentic Alexandrian Egyptian seafood"
  },
  "egyptian-shrimp-tagine": {
    englishName: "Egyptian shrimp tagine",
    visualDescription:
      "Egyptian shrimp tagine in a rustic baked dish or shallow clay-style pan with whole shrimp in tomato sauce, onion, garlic, peppers, cumin, coriander, parsley, cilantro, lemon, or chili only when listed. The tomato sauce should surround the shrimp without hiding them",
    plating:
      "served in one oven dish or shallow tagine-style pan, with shrimp clearly visible at the surface and sauce texture visible",
    avoid:
      "plain shrimp plate, shrimp cocktail, pasta, rice as the main view, paella pan, creamy soup, yellow curry, hidden shrimp, chicken, beef",
    cuisineStyle: "authentic Egyptian seafood tagine"
  },
  "mediterranean-garlic-shrimp": {
    englishName: "Mediterranean garlic shrimp",
    visualDescription:
      "whole curled pink-orange shrimp cooked in a light olive-oil garlic sauce with sliced red or green bell peppers, shallots or onion, small tomato pieces, parsley, and lemon only when listed. The shrimp must be the clear main subject, glossy and saucy, not breaded or hidden in rice",
    plating:
      "served in one shallow skillet, pan, or simple plate with the shrimp visible on top; rice, orzo, couscous, or bread may appear only as a small support if listed",
    avoid:
      "plain boiled shrimp, shrimp cocktail, breaded fried shrimp, pasta unless listed, rice mound hiding shrimp, grass background, generic white-plate takeout photo, random salad, heavy cream sauce, curry sauce, unrelated seafood mix",
    cuisineStyle: "Mediterranean coastal seafood"
  },
  "grilled-shrimp-kebabs": {
    englishName: "grilled shrimp kebabs",
    visualDescription:
      "whole shrimp threaded on skewers and grilled until pink-orange with light char marks, brushed with lime, garlic, olive oil, paprika or chili, and cilantro or parsley only when listed. The skewered form must be obvious",
    plating:
      "served as a few shrimp skewers on one clean platter or grill-style plate, with lime wedges or herbs only if listed",
    avoid:
      "loose shrimp in sauce, fried shrimp, shrimp cocktail, pasta, rice bowl, stew, curry, mixed grill with meat, vegetables dominating the shrimp, hands holding skewers, people, labels",
    cuisineStyle: "Mediterranean or coastal grilled seafood"
  },
  "mediterranean-shrimp-feta": {
    englishName: "Mediterranean shrimp with feta",
    visualDescription:
      "whole shrimp nestled in a red tomato sauce with olives, diced tomatoes, onion or garlic, parsley or oregano, and crumbled white feta only when listed. The feta should appear as small white crumbles, not a thick cream sauce",
    plating:
      "served in one shallow skillet, baking dish, or plate with tomato sauce visible around the shrimp and feta scattered on top",
    avoid:
      "plain shrimp, fried shrimp, cream sauce, yellow curry, pasta unless listed, rice mound, salad bowl, hidden shrimp, unrelated seafood platter, chicken, beef",
    cuisineStyle: "Mediterranean Greek-style seafood"
  },
  "turkish-prawns-feta": {
    englishName: "Turkish prawns with feta",
    visualDescription:
      "whole pink-orange prawns or shrimp cooked Turkish-style with tomato, red pepper paste or paprika, onion, garlic, green or red peppers, parsley, and crumbled feta or melted cheese only when listed; rustic red saucy surface with visible prawns",
    plating:
      "served in one small pan, shallow skillet, or earthenware-style dish with the prawns clearly visible and the tomato-pepper sauce around them",
    avoid:
      "plain boiled prawns, breaded fried shrimp, shrimp cocktail, pasta, rice mound hiding prawns, generic Greek salad, creamy Alfredo sauce, curry sauce, unrelated seafood mix",
    cuisineStyle: "authentic Turkish meyhane-style seafood"
  },
  "turkish-prawn-chickpea-stew": {
    englishName: "Turkish prawn and chickpea stew",
    visualDescription:
      "whole prawns or shrimp in a red tomato-based stew with visible chickpeas, onion, garlic, peppers, cumin, sumac, chili, parsley, or dill only when listed. The stew should look spoonable and rustic, with prawns and chickpeas both visible",
    plating:
      "served in one shallow bowl or pan with red sauce, chickpeas, and prawns visible at the surface; bread or rice only if listed",
    avoid:
      "plain shrimp plate, fried shrimp, shrimp cocktail, pasta, creamy sauce, yellow curry, hidden prawns, bean-only stew, chicken, beef, unrelated vegetables",
    cuisineStyle: "Turkish home-style seafood stew"
  },
  "karides-guvec": {
    englishName: "Karides Guvec Turkish shrimp casserole",
    visualDescription:
      "Turkish shrimp casserole baked in an earthenware guvec or small oven-safe dish with whole shrimp, onion, garlic, green and red peppers, mushrooms, diced tomatoes, and a golden melted cheese topping only when listed. The dish should look baked and rustic, not a raw salad or plain shrimp plate",
    plating:
      "served in one clay pot, small casserole, or shallow oven dish, with shrimp visible through the tomato-vegetable sauce and melted cheese on top if cheese is listed",
    avoid:
      "plain boiled shrimp, shrimp cocktail, fried shrimp, pasta, rice as the main view, cold salad, curry, cream soup, generic seafood platter, hidden shrimp, unrelated side dishes",
    cuisineStyle: "authentic Turkish guvec seafood casserole"
  },
  "kung-pao-shrimp": {
    englishName: "Kung Pao shrimp",
    visualDescription:
      "whole curled shrimp stir-fried in a glossy reddish-brown Chinese Kung Pao sauce with roasted peanuts, dried red chilies, scallions, garlic, ginger, and diced bell pepper, zucchini, or water chestnuts only when listed. The shrimp and peanuts must both be clearly visible",
    plating:
      "served as one wok-style stir-fry plate or shallow bowl with sauce clinging to the shrimp; rice may appear only as a small support if listed",
    avoid:
      "plain garlic shrimp, breaded fried shrimp, shrimp cocktail, pasta, cream sauce, curry sauce, random salad, peanut-free stir-fry, hidden shrimp, chicken, beef, unrelated vegetables",
    cuisineStyle: "Chinese Sichuan-inspired stir-fry"
  },
  "asian-garlic-shrimp": {
    englishName: "Asian garlic shrimp",
    visualDescription:
      "whole shrimp coated in a glossy garlic-soy sauce with visible minced garlic, ginger, sesame oil sheen, green onion, and sesame seeds only when listed. The sauce should cling to the shrimp, not look like soup",
    plating:
      "served as one close plate or shallow bowl of saucy shrimp; rice or noodles may appear only if listed and must not hide the shrimp",
    avoid:
      "plain boiled shrimp, breaded fried shrimp, shrimp cocktail, cream sauce, tomato sauce, curry, pasta unless listed, vegetables dominating the shrimp, hidden shrimp",
    cuisineStyle: "Chinese or Asian garlic-soy seafood"
  },
  "salt-and-pepper-shrimp": {
    englishName: "Chinese salt and pepper shrimp",
    visualDescription:
      "crispy shell-on or tail-on shrimp lightly coated and fried until golden, tossed dry with minced garlic, scallions, sliced green or red chili, salt, and cracked black pepper only when listed. The dish should look dry-crisp, not saucy",
    plating:
      "served as one plate of crisp shrimp with scattered garlic, scallions, and chili; no dipping sauces or sides unless listed",
    avoid:
      "saucy stir-fry, boiled shrimp, shrimp cocktail, pasta, rice bowl, cream sauce, curry sauce, tomato sauce, heavy vegetables, hidden shrimp, chicken, beef",
    cuisineStyle: "Chinese Cantonese-style fried seafood"
  },
  "chinese-shrimp-broccoli": {
    englishName: "Chinese shrimp and broccoli",
    visualDescription:
      "whole pink shrimp stir-fried with bright green broccoli florets in a glossy soy-garlic-ginger brown sauce. The shrimp and broccoli should be balanced and clearly visible, with sauce lightly coating both",
    plating:
      "served as one stir-fry plate or shallow bowl; steamed rice may appear underneath or beside it only if listed and must not dominate",
    avoid:
      "plain steamed broccoli, shrimp cocktail, fried breaded shrimp, pasta, cream sauce, tomato sauce, curry, random vegetable medley, hidden shrimp, chicken, beef",
    cuisineStyle: "Chinese-American shrimp stir-fry"
  },
  "ginger-garlic-seafood-stir-fry": {
    englishName: "Chinese ginger garlic seafood stir fry",
    visualDescription:
      "mixed seafood stir-fried over very high heat with julienned ginger, sliced garlic, soy sauce, and spring onions. Shrimp, scallops, squid, or mixed seafood pieces should be visible and lightly glossy, with green spring onion strips on top",
    plating:
      "served as one wok-style stir-fry plate or shallow bowl; jasmine rice or noodles may appear only if listed and should not hide the seafood",
    avoid:
      "seafood soup, creamy sauce, tomato sauce, curry, fried breaded seafood, pasta, salad, hidden seafood, chicken, beef, random vegetables dominating the seafood",
    cuisineStyle: "Chinese Cantonese-style seafood stir-fry"
  },
  "steamed-fish-oyster-sauce": {
    englishName: "Chinese steamed fish in oyster sauce",
    visualDescription:
      "a tender steamed white fish fillet or whole fish portion glazed with glossy dark oyster sauce, topped with thin ginger strips and spring onion, with light steam-cooked texture. The fish should be intact and clearly visible, not fried or breaded",
    plating:
      "served as one simple Chinese steamed fish plate with sauce pooled around the fish; rice may appear only if listed and must stay secondary",
    avoid:
      "fried fish, grilled char marks, fish sticks, sushi, creamy sauce, tomato sauce, curry, pasta, salad, shrimp-only dish, chicken, beef, heavy vegetables hiding the fish",
    cuisineStyle: "Chinese steamed seafood"
  },
  "sauteed-seafood-medley": {
    englishName: "sauteed seafood medley",
    visualDescription:
      "a mixed seafood skillet with clearly visible shrimp, scallops, crab pieces, squid rings, mussels, or clams only when listed, sauteed with garlic, butter or olive oil, herbs, and a light glossy sauce. The seafood should look varied but coherent, not like a rice dish",
    plating:
      "served as one skillet or shallow plate of mixed seafood, with herbs and lemon only if listed; no large starch base unless listed",
    avoid:
      "paella rice, pasta, seafood soup, seafood boil tray, breaded fried seafood, cream-heavy sauce, hidden seafood, chicken, beef, random vegetables dominating the seafood",
    cuisineStyle: "global seafood skillet"
  },
  "seafood-paella": {
    englishName: "Spanish seafood paella",
    visualDescription:
      "Spanish paella de marisco in a wide shallow pan with saffron-yellow rice, shrimp, mussels or clams in shells, squid or seafood pieces only when listed, with rice grains visible and lightly toasted edges. The seafood must sit visibly on top of the rice",
    plating:
      "served in one paella pan or wide shallow platter, rice as the base with seafood arranged on top; lemon wedges only if listed",
    avoid:
      "plain seafood medley without rice, risotto, biryani, pasta, soup, curry, seafood boil tray, chicken-only rice, hidden seafood, random salad",
    cuisineStyle: "authentic Spanish seafood paella"
  },
  "cajun-seafood-boil": {
    englishName: "Cajun seafood boil",
    visualDescription:
      "Cajun seafood boil spread with shrimp, crab legs or crawfish, corn on the cob, baby potatoes, and sausage only when listed, coated in orange-red Cajun garlic butter seasoning. It should look like a boil spread, not a plated entree",
    plating:
      "served as one abundant tray, sheet pan, or butcher-paper seafood boil pile with the seafood and vegetables visible; sauce may be drizzled or in one small cup only if listed",
    avoid:
      "single shrimp plate, paella rice, pasta, soup, cream sauce, Chinese stir-fry, plain boiled seafood without seasoning, hidden seafood, unrelated salad, white tablecloth fine-dining plating",
    cuisineStyle: "Cajun or Louisiana seafood boil"
  },
  cioppino: {
    englishName: "cioppino seafood stew",
    visualDescription:
      "Italian-American tomato-broth seafood stew with visible crab legs, shrimp, mussels or clams in shells, fish chunks, calamari, fennel, onion, garlic, herbs, and red tomato broth only when listed. The seafood should rise above the broth and look abundant",
    plating:
      "served in one deep bowl of red seafood stew with shellfish and fish visible; toasted bread may appear only if listed",
    avoid:
      "creamy chowder, paella rice, seafood boil tray, pasta, curry, fried seafood, hidden seafood, chicken, beef, mashed potatoes unless explicitly listed",
    cuisineStyle: "Italian-American San Francisco seafood stew"
  },
  "seafood-chowder": {
    englishName: "seafood chowder",
    visualDescription:
      "creamy seafood chowder with visible shrimp, fish chunks, scallops, mussels, or mixed seafood only when listed, in a pale cream broth with potato cubes, corn, celery, carrot, onion, parsley, or dill only when listed. The seafood should be visible at the surface, not hidden under a smooth soup",
    plating:
      "served in one deep bowl of creamy chowder with seafood pieces and vegetables visible; crackers or bread only if listed",
    avoid:
      "tomato cioppino, red fish soup, Cajun boil tray, paella rice, pasta, curry, clear broth, salad, fried seafood, hidden seafood, chicken, beef",
    cuisineStyle: "Western creamy seafood soup"
  },
  "mediterranean-fish-soup": {
    englishName: "Mediterranean fish soup",
    visualDescription:
      "Mediterranean fish soup with visible white fish chunks in a warm tomato or golden broth with tomato pieces, red pepper, celery, onion, garlic, herbs, lemon, cumin, coriander, or turmeric only when listed. The broth should be light and aromatic, not creamy",
    plating:
      "served in one bowl with fish pieces visible at the surface, herbs and lemon only if listed; no large rice or pasta base unless listed",
    avoid:
      "creamy chowder, paella, seafood boil, pasta, curry, fried fish, sushi, hidden fish, chicken, beef, heavy cream sauce, random salad",
    cuisineStyle: "Eastern Mediterranean fish soup"
  },
  "pla-pad-cha": {
    englishName: "Thai Pla Pad Cha fried fish",
    visualDescription:
      "crispy fried fish pieces or fillets tossed or topped with a spicy Thai chile sauce, garlic, fingerroot or young ginger, green peppercorns, Thai basil or holy basil, red chilies, and glossy fish sauce or oyster sauce only when listed. The fish should look crisp at the edges with vivid Thai aromatics",
    plating:
      "served as one Thai fried fish plate with spicy chile sauce on or around the fish; rice may appear only if listed and must not hide the fish",
    avoid:
      "plain fried fish, fish sticks, steamed fish, creamy sauce, tomato soup, curry bowl, sushi, pasta, hidden fish, chicken, beef, generic salad",
    cuisineStyle: "authentic Thai spicy fried fish"
  },
  "chilli-lime-fish": {
    englishName: "Thai chilli lime fish",
    visualDescription:
      "pan-seared or lightly fried white fish pieces coated in a glossy spicy chilli-lime sauce with garlic, red chili, lime juice, fish sauce, coriander or cilantro only when listed. The fish pieces should be saucy and caramelized at the edges",
    plating:
      "served as one Thai-style plate of saucy fish pieces; rice may appear only if listed and must not hide the fish",
    avoid:
      "plain fried fish, whole steamed fish, creamy sauce, tomato soup, curry bowl, sushi, pasta, hidden fish, chicken, beef, generic salad",
    cuisineStyle: "Thai spicy lime fish"
  },
  "fish-florentine": {
    englishName: "fish Florentine",
    visualDescription:
      "a seared white fish fillet resting on a bed of creamy spinach Florentine sauce with garlic, onion or shallot, cream, parmesan, and lemon only when listed. The fish should sit clearly on top of the green spinach cream",
    plating:
      "served as one plate or shallow bowl with the fish fillet over creamy spinach; no rice or pasta unless listed",
    avoid:
      "fried fish, tomato sauce, curry, soup, plain spinach salad, pasta unless listed, hidden fish, chicken, beef",
    cuisineStyle: "American or Italian-inspired fish Florentine"
  },
  "crispy-pan-fried-fish": {
    englishName: "crispy pan fried fish",
    visualDescription:
      "golden crispy white fish fillets lightly coated in flour or seasoning and pan-fried, with browned crisp edges and flaky white interior visible where cut. Lemon and parsley may appear only when listed",
    plating:
      "served as one simple plate of crispy fish fillets; vegetables, salad, or potatoes may appear only if listed and must stay secondary",
    avoid:
      "breaded fish sticks, whole fish, creamy sauce, tomato soup, curry, pasta, rice mound hiding fish, sushi, chicken, beef",
    cuisineStyle: "simple crispy pan-fried fish"
  },
  "mediterranean-baked-fish": {
    englishName: "Mediterranean baked fish with olives and capers",
    visualDescription:
      "baked white fish fillets or pieces with tomatoes, olives, capers, garlic, onion, lemon, herbs, and olive oil only when listed. The fish should be visible among the Mediterranean toppings, not buried",
    plating:
      "served in one baked dish or plate with fish, olives, capers, tomatoes, and herbs visible; no pasta or rice unless listed",
    avoid:
      "plain fried fish, creamy sauce, fish soup, paella, curry, salad bowl, hidden fish, chicken, beef",
    cuisineStyle: "Mediterranean baked seafood"
  },
  "egyptian-spiced-whole-snapper": {
    englishName: "roasted whole snapper with Egyptian spices",
    visualDescription:
      "a whole roasted snapper or similar whole fish, scored across the skin and rubbed with Egyptian spice paste of cumin, coriander, paprika, garlic, lemon, olive oil, and herbs only when listed. The whole fish shape and scored skin must be obvious",
    plating:
      "served as one whole fish on a platter with tomatoes, lemon, coriander, or parsley only if listed",
    avoid:
      "fish fillets, fish soup, paella, fried fish pieces, sushi, pasta, rice hiding the fish, chicken, beef, unrelated side dishes",
    cuisineStyle: "Egyptian spiced roasted whole fish"
  },
  "arabic-grilled-fish": {
    englishName: "Arabic charcoal grilled fish",
    visualDescription:
      "a whole grilled fish with charcoal marks and Arabic spice marinade of cumin, coriander, paprika, garlic, lemon, olive oil, and parsley only when listed. The fish should look grilled and smoky, with crisp skin and visible whole-fish form",
    plating:
      "served as one whole grilled fish on a simple platter; rice, salad, tahini, or lemon may appear only if listed",
    avoid:
      "fried fish, baked casserole, fish soup, fish fillet cubes, sushi, pasta, hidden fish, chicken, beef",
    cuisineStyle: "Arabic or Egyptian charcoal-grilled fish"
  },
  "egyptian-tilapia-khalta-tray": {
    englishName: "Egyptian tilapia tray bil khalta",
    visualDescription:
      "Egyptian baked tilapia tray with whole tilapia or large fish portions covered in a visible khalta spice mixture of garlic, peppers, tomato, cumin, coriander, lemon, herbs, and oil only when listed. The tray should look saucy and baked, not plain grilled",
    plating:
      "served in one oven tray or shallow platter with the fish visible under the spice mixture; vegetables appear only if listed",
    avoid:
      "plain fish fillet, fried fish, fish soup, paella, pasta, sushi, creamy sauce, hidden fish, chicken, beef",
    cuisineStyle: "Egyptian baked fish tray"
  },
  "barboon-maklee": {
    englishName: "Barboon Maklee Egyptian fried red mullet",
    visualDescription:
      "small whole red mullet fish fried golden and crisp after lemon, cumin, coriander, garlic, and flour or cornflour coating only when listed. The fish should be whole, small, and crisp with tails visible",
    plating:
      "served as a plate of fried whole red mullet with lemon and parsley only if listed; rice or tahini only if listed and secondary",
    avoid:
      "fish fillet, fish sticks, grilled fish, fish soup, paella, pasta, creamy sauce, hidden fish, chicken, beef",
    cuisineStyle: "Egyptian fried fish"
  },
  "egyptian-fried-fish-sandwich": {
    englishName: "Egyptian fried fish sandwich",
    visualDescription:
      "crispy fried fish fillets tucked into Egyptian pita or flatbread with tahini sauce, tomato, cucumber, pickles, arugula, parsley, or lemon only when listed. The bread pocket and fried fish filling must be visible",
    plating:
      "served as one Egyptian pita-style fish sandwich or halved sandwich, not a burger bun; sauce and vegetables only if listed",
    avoid:
      "burger bun, plain fish fillet plate, tacos, wrap tortilla, fried chicken sandwich, fish soup, pasta, rice bowl, hidden fish",
    cuisineStyle: "Egyptian street-food fried fish sandwich"
  },
  "parmesan-crusted-fish": {
    englishName: "lemon herb Parmesan crusted fish",
    visualDescription:
      "white fish fillets with a golden breadcrumb, herb, lemon zest, and parmesan crust only when listed, baked or pan-finished until the top is crisp and browned. The crumb crust should be clearly visible",
    plating:
      "served as one plate of crusted fish fillets with lemon and herbs only if listed; vegetables or potatoes only if listed and secondary",
    avoid:
      "plain fried fish, whole fish, creamy sauce, tomato soup, curry, paella, pasta, hidden fish, chicken, beef",
    cuisineStyle: "Western lemon herb crusted fish"
  },
  "garlic-butter-cod": {
    englishName: "baked cod with garlic butter",
    visualDescription:
      "flaky white cod fillets baked in garlic butter with lemon, parsley, paprika, and olive oil only when listed. The cod should look moist and flaky with a light golden top and butter sauce around it",
    plating:
      "served as one plate or baking dish of cod fillets with lemon and parsley only if listed; vegetables or potatoes only if listed",
    avoid:
      "whole fish, fried fish, fish soup, paella, pasta, curry, heavy cream sauce, hidden fish, chicken, beef",
    cuisineStyle: "simple baked cod"
  }
};

const VEGAN_SHAKSHUKA_VISUAL_PROMPT: DishVisualPrompt = {
  englishName: "vegan shakshuka",
  visualDescription:
    "a rustic red tomato, pepper, onion, and spice shakshuka-style skillet with visible vegetables, chickpeas, tofu pieces, beans, or other listed plant protein standing in for eggs. It must look like an eggless vegan tomato skillet, with no whole eggs, no egg whites, no egg yolks, and no dairy",
  plating:
    "served in a small skillet or shallow bowl as one finished tomato-based vegan shakshuka-style dish, with sauce and plant ingredients visible at the surface",
  avoid:
    "eggs, poached eggs, fried eggs, egg yolks, egg whites, omelette, cheese, yogurt, dairy, meat, chicken, beef, fish, shrimp, plain tomato soup, pasta, rice, pizza, burger",
  cuisineStyle: "vegan Middle Eastern breakfast"
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
  const languageMeaningClause = buildArabicFoodMeaningClause(dish || query, ingredientList);
  const visualSource = buildVisualMeaningSource(dish || query, ingredientList);
  const curatedPrompt = buildCuratedDishImagePrompt(
    dish || query,
    ingredientList,
    identity,
    alternateDishNameClause,
    exactCardIdentityClause,
    languageMeaningClause
  );
  if (curatedPrompt) {
    return curatedPrompt;
  }

  const primarySubject = inferPrimaryVisualSubject(visualSource, ingredientList, identity);
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
    languageMeaningClause,
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

export function buildRecipeImagePromptForTest(
  query: string,
  ingredients: string[] = [],
  options: { alternateDishNames?: string[]; exactRecipeName?: string } = {}
) {
  return buildRecipeImagePrompt(query, normalizePromptIngredients(ingredients), options);
}

export function buildRecipeImageNegativePromptForTest(query: string, ingredients: string[] = []) {
  return buildRecipeImageNegativePrompt(query, normalizePromptIngredients(ingredients));
}

function buildCuratedDishImagePrompt(
  query: string,
  ingredients: string[],
  identity: ReturnType<typeof buildRecipePhotoIdentity>,
  alternateDishNameClause = "",
  exactCardIdentityClause = "",
  languageMeaningClause = ""
) {
  const visualPrompt = findDishVisualPrompt(identity, query, ingredients);
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
    languageMeaningClause,
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
  const source = buildVisualMeaningSource(identity.cleanQuery, ingredients);
  const allowsRice = /\b(rice|pilaf|couscous|bulgur)\b/.test(source);
  const allowsPasta = hasPastaSource(source);
  const forbiddenStarches = [
    allowsRice ? "" : "rice, rice grains, pilaf, couscous, bulgur",
    allowsPasta ? "" : "pasta, spaghetti, noodles, macaroni, vermicelli"
  ].filter(Boolean);
  const strictTokens = getStrictRecipePhotoIdentityTokens(identity).slice(0, 6);
  const canonicalName = identity.canonicalDishKey?.replace(/-/g, " ") ?? identity.cleanQuery;

  if (isStuffedDishSource(source)) {
    return buildStuffedVisualClause(source, forbiddenStarches);
  }

  if (isShawarmaSource(source)) {
    return buildShawarmaVisualClause(source, forbiddenStarches);
  }

  if (isGroundMeatSource(source)) {
    return buildGroundMeatVisualClause(source, forbiddenStarches);
  }

  if (isSeafoodSource(source)) {
    return buildSeafoodVisualClause(source, forbiddenStarches);
  }

  if (isSoupSource(source, identity)) {
    return buildSoupVisualClause(source, identity, forbiddenStarches);
  }

  if (isPotatoSource(source)) {
    return buildPotatoVisualClause(source);
  }

  if (isVeganOrDairyFreeSource(source)) {
    const constraints = buildPlantBasedVisualConstraint(source);
    if (constraints) return constraints;
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

  if (isHawawshiSource(source)) {
    components.push("closed baladi bread or pita pocket");
    components.push("spiced ground meat filling visible inside an opened cut seam");
  } else if (/\b(lahm\s*(?:bi\s*)?ajin|lahm\s*b[iae]\s*ajeen|lahm\s*ajeen|lahmacun|kiymali\s+pide|pide)\b|\u0644\u062d\u0645\s+\u0628\u0639\u062c\u064a\u0646/iu.test(source)) {
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
  if (isStuffedDishSource(source)) {
    components.push("hollowed or rolled stuffed vegetable shell");
    components.push("internal rice, herb, or meat filling");
  }
  if (isShawarmaSource(source)) {
    components.push("thin sliced shawarma meat");
    components.push("pita, lavash, wrap, or shawarma plate structure required by the exact dish name");
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

function isStuffedDishSource(source: string) {
  return /\b(mahshi|kousa mahshi|koosa mahshi|stuffed zucchini|stuffed courgette|stuffed cabbage|cabbage rolls|malfouf|warak enab|waraq enab|stuffed grape leaves|stuffed vine leaves|stuffed peppers|stuffed bell peppers|stuffed tomatoes?|tomato mahshi|stuffed eggplant|stuffed aubergine|sheikh el mahshi|sheikh al mahshi|dolma|dolmades|sarma)\b|(?:\u0645\u062d\u0634\u064a|\u0645\u062d\u0634\u0649)|\u0643\u0648\u0633\u0627|\u0643\u0631\u0646\u0628|\u0645\u0644\u0641\u0648\u0641|\u0648\u0631\u0642\s*\u0639\u0646\u0628/iu.test(source);
}

function isShawarmaSource(source: string) {
  return /\b(shawarma|shwarma|shawerma|shawirma|chawarma|shawarma wrap|shawarma plate|shawarma bowl)\b|\u0634\u0627\u0648\u0631\u0645\u0627/iu.test(source);
}

function buildShawarmaVisualClause(source: string, forbiddenStarches: string[]) {
  const proteinCue = /\bchicken\b|\u062f\u062c\u0627\u062c|\u0641\u0631\u0627\u062e/iu.test(source)
    ? "Use chicken shawarma: golden-brown sliced or chopped marinated chicken, never beef, lamb, or whole chicken breast."
    : /\blamb\b|\u0636\u0627\u0646\u064a|\u062e\u0631\u0648\u0641/iu.test(source)
    ? "Use lamb shawarma: thin browned lamb slices, never lamb chops, rack of lamb, ground lamb, or stew chunks."
    : /\bbeef\b|\bmeat\b|\u0644\u062d\u0645/iu.test(source)
    ? "Use beef shawarma: thin browned beef slices, never ground beef, kofta, steak cubes, or stew chunks."
    : "Use the named shawarma protein as thin browned slices or chopped roasted shawarma pieces.";
  const servingCue = /\b(wrap|sandwich|pita|lavash)\b|\u0633\u0627\u0646\u062f\u0648\u064a\u062a\u0634|\u0631\u0627\u0628/iu.test(source)
    ? "Serving form: show a pita or lavash wrap with one open end or a cut half so the shawarma meat is clearly visible inside."
    : /\b(bowl|rice)\b|\u0631\u0632/iu.test(source)
    ? "Serving form: show a bowl or plate only if named, with shawarma slices clearly on top so rice or vegetables do not hide the meat."
    : "Serving form: a shawarma wrap, plate, or bowl is acceptable, but the thin sliced shawarma meat must be the most visible subject.";

  return [
    "Strict visual identity: this is shawarma, a Middle Eastern sliced roasted meat dish, not kebab skewers, kofta, doner cone, steak cubes, stew, or a generic wrap.",
    proteinCue,
    servingCue,
    "The meat texture must be thin sliced, shaved, or chopped from roasted marinated meat with browned edges and visible spice color.",
    "If sauce, pickles, tomato, onion, parsley, lettuce, fries, rice, or bread are visible, they must be listed in the recipe or structurally required by the exact shawarma wrap/plate/bowl identity.",
    "Hard negative: do not show Adana kebab, shish kebab, skewers, kofta logs, meatballs, burger, taco, burrito, doner cone, whole chicken breast, steak cubes, stew chunks, loose ground meat, or random salad as the main subject.",
    forbiddenStarches.length
      ? `Hard negative: do not include ${forbiddenStarches.join("; ")} as separate sides unless the exact shawarma identity or ingredient whitelist explicitly allows them.`
      : ""
  ].filter(Boolean).join(" ");
}

function buildStuffedVisualClause(source: string, forbiddenStarches: string[]) {
  const stuffedForms = [
    /\b(kousa|koosa|zucchini|courgette)\b|\u0643\u0648\u0633\u0627/iu.test(source)
      ? "for kousa mahshi, show short hollowed zucchini/courgette cylinders packed with filling inside, with open ends or one cut piece revealing the rice/herb/meat filling"
      : "",
    /\b(cabbage|malfouf|cabbage rolls)\b|\u0643\u0631\u0646\u0628|\u0645\u0644\u0641\u0648\u0641/iu.test(source)
      ? "for stuffed cabbage, show rolled cabbage leaves wrapped around the filling, arranged as compact rolls, not loose cabbage or rice"
      : "",
    /\b(grape leaves|vine leaves|warak enab|waraq enab|dolma|dolmades|sarma)\b|\u0648\u0631\u0642\s*\u0639\u0646\u0628/iu.test(source)
      ? "for warak enab or dolma, show small green grape-leaf rolls with rice/herb filling inside the rolls, not loose rice or salad leaves"
      : "",
    /\b(bell pepper|pepper|peppers)\b|\u0641\u0644\u0641\u0644/iu.test(source)
      ? "for stuffed peppers, show whole or halved peppers filled inside with rice/herb/meat mixture, upright or open-topped with visible filling"
      : "",
    /\b(tomato|tomatoes)\b|\u0637\u0645\u0627\u0637\u0645/iu.test(source)
      ? "for tomato mahshi, show hollowed tomato shells filled inside with seasoned rice, with open tops or tomato caps, not tomato rice on a plate"
      : "",
    /\b(eggplant|aubergine|sheikh el mahshi|sheikh al mahshi)\b|\u0628\u0627\u0630\u0646\u062c\u0627\u0646|\u0628\u062a\u0646\u062c\u0627\u0646/iu.test(source)
      ? "for stuffed eggplant or sheikh el mahshi, show split eggplant boats or small eggplants with filling inside the slit, not loose meat or a layered casserole"
      : ""
  ].filter(Boolean);

  return [
    "Strict visual identity: this is a stuffed dish. The filling must be inside the named vegetable, leaf roll, bread, or shell, not served as a random rice or meat side.",
    "The stuffed item must be the main subject. Show hollowed, rolled, split, or open-topped pieces that visibly contain rice, herbs, sauce, or minced meat inside them.",
    stuffedForms.length
      ? `Recipe-specific stuffed form: ${stuffedForms.join("; ")}.`
      : "For mixed mahshi, show a tray or plate of visibly stuffed zucchini, peppers, eggplant, cabbage rolls, grape leaves, or tomatoes, with at least one open or cut piece showing filling inside.",
    "At least one stuffed piece should be cut open, angled, or open-topped so the viewer can see the filling inside the vegetable or roll.",
    "Hard negative: do not show a pile of white rice with loose meat, tomato rice, meat over rice, plain rice bowl, unstuffed vegetables, vegetable stew, salad, kebab, pasta, burger, or random side dishes as the main image.",
    forbiddenStarches.length
      ? `Hard negative: do not include ${forbiddenStarches.join("; ")} as separate side dishes unless the exact stuffed dish identity requires the filling and the starch appears inside the stuffed item.`
      : ""
  ].filter(Boolean).join(" ");
}

function buildGroundMeatVisualClause(source: string, forbiddenStarches: string[]) {
  const styleHints = [
    /\b(kofta|kafta|kofte|kefta|adana|kebab|kabab)\b|\u0643\u0641\u062a\u0629/iu.test(source)
      ? "shape the ground meat as kofta, kebab fingers, or Adana-style minced meat skewers with charred ridges"
      : "",
    isHawawshiSource(source)
      ? "for Egyptian hawawshi, baladi hawawshi, Alexandrian hawawshi, arayes, or meat-stuffed baladi bread, show closed toasted baladi bread or pita opened or cut into crispy triangular wedges with spiced minced meat filling visible inside the bread at the opened cut seam; do not show meat sitting on top of flatbread"
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
    isHawawshiSource(source)
      ? "Hawawshi hard rule: this is not an open flatbread. The bread must be closed around the ground meat and then opened or cut so the filling is visible inside. No toppings should sit on top of the bread surface."
      : "",
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
  const source = buildVisualMeaningSource(query, ingredients);
  const allow = (pattern: RegExp) => pattern.test(source);
  const isLiverDish = allow(/\b(liver|kebda|kibda|ciger|cigeri)\b/i);
  const isGroundMeatDish = isGroundMeatSource(source);
  const isSeafoodDish = isSeafoodSource(source);
  const isFlatbreadDish = isFlatbreadGroundMeatDishSource(source);
  const isPlantBasedOrEggFree = /\b(vegan|plant[- ]?based|egg[- ]?free|without eggs?|no eggs?)\b/iu.test(source);
  const isDairyFree = /\b(vegan|plant[- ]?based|dairy[- ]?free|without dairy|no dairy)\b/iu.test(source);
  const excludedFoods = [
    hasPastaSource(source) || allow(/\b(penne|ramen|udon|soba)\b/i)
      ? ""
      : "pasta, spaghetti, noodles, macaroni, penne, vermicelli, ramen, udon",
    allow(/\b(rice|pilaf|couscous|bulgur|burghul|quinoa)\b/i)
      ? ""
      : "rice, pilaf, couscous, bulgur, quinoa, grain bowl",
    allow(/\b(bread|toast|pita|flatbread|bun|roll|wrap|tortilla|dough)\b/i) || isFlatbreadDish
      ? ""
      : "bread, toast, pita, flatbread, bun, roll, wrap, tortilla",
    allow(/\b(potato|potatoes|fries)\b/i) ? "" : "potatoes, fries",
    /\bpotato|potatoes|fries|kumpir|compir|kompir\b/i.test(source)
      ? buildWrongPotatoFormNegativePrompt(source)
      : "",
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
      : "",
    isPlantBasedOrEggFree
      ? "eggs, egg yolks, egg whites, poached egg, fried egg, boiled egg, omelette, mayonnaise, chicken, beef, lamb, fish, shrimp, seafood, meat"
      : "",
    isDairyFree ? "cheese, feta, mozzarella, parmesan, cream, yogurt, labneh, butter, ghee, dairy sauce" : "",
    isArabicStewSource(source) ? "dessert, sweets, sweet pudding, custard, cake, candy, pastry" : ""
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

function findDishVisualPrompt(
  identity: ReturnType<typeof buildRecipePhotoIdentity>,
  query = "",
  ingredients: string[] = []
) {
  const source = `${query} ${identity.cleanQuery} ${ingredients.join(" ")}`.toLowerCase();
  if (/\bshakshuka\b|\u0634\u0643\u0634\u0648\u0643\u0629/iu.test(source) && isVeganOrDairyFreeSource(source)) {
    return VEGAN_SHAKSHUKA_VISUAL_PROMPT;
  }

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
  if (/\(arabic:/i.test(value)) {
    return value;
  }

  if (isArabicGroundMeatIngredient(value)) {
    return "ground/minced meat (Arabic: lahma mafrouma)";
  }

  if (isArabicPastaSource(value)) {
    return "pasta/macaroni (Arabic: makarona)";
  }

  if (isArabicSoupOrBrothSource(value)) {
    return "soup/broth base (Arabic: shorba or maraq)";
  }

  if (isArabicStewSource(value)) {
    return "savory stew/soup (Arabic: yakhna)";
  }

  const arabicIngredientAlias = translateArabicPromptIngredientAlias(value);
  if (arabicIngredientAlias) {
    return arabicIngredientAlias;
  }

  if (/\b(mince|minced|ground)\b/i.test(value) && /\b(meat|beef|lamb|veal)\b/i.test(value)) {
    return "ground/minced meat";
  }

  return value;
}

function buildArabicFoodMeaningClause(query: string, ingredients: string[]) {
  const meanings = getArabicFoodMeanings(`${query} ${ingredients.join(" ")}`);
  if (!meanings.length) return "";

  return `Language meaning guardrail for Arabic food terms: ${meanings.map((entry) => entry.promptMeaning).join("; ")}. Use these meanings to choose the correct visual form before generating the image.`;
}

function buildVisualMeaningSource(query: string, ingredients: string[]) {
  const source = `${query} ${ingredients.join(" ")}`.toLowerCase();
  const keywords = getArabicFoodMeanings(source).flatMap((entry) => entry.keywords);
  return `${source} ${keywords.join(" ")}`.trim();
}

function getArabicFoodMeanings(source: string) {
  return ARABIC_FOOD_MEANINGS.filter((entry) => entry.pattern.test(source));
}

function translateArabicPromptIngredientAlias(value: string) {
  if (!/[\u0600-\u06FF]/.test(value)) return "";

  const aliases = ARABIC_PROMPT_INGREDIENT_ALIASES.filter((entry) => entry.pattern.test(value)).map(
    (entry) => entry.english
  );
  if (!aliases.length) return "";

  return `${Array.from(new Set(aliases)).join(", ")} (Arabic: ${value})`;
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

function isHawawshiSource(source: string) {
  return /\b(hawawshi|baladi\s+hawawshi|alexandrian\s+hawawshi|iskandarani\s+hawawshi|eskandarani\s+hawawshi|arayes|meat\s+stuffed\s+(?:baladi\s+)?(?:bread|pita|flatbread)|stuffed\s+(?:baladi\s+)?(?:bread|pita|flatbread))\b|\u062d\u0648\u0627\u0648\u0634\u064a|\u062e\u0628\u0632\s+\u0645\u062d\u0634\u0648|\u0639\u064a\u0634\s+\u0645\u062d\u0634\u0648/iu.test(
    source
  );
}

function isArabicGroundMeatIngredient(value: string) {
  return /(?:\u0627\u0644)?\u0644\u062d\u0645(?:\u0629|\u0647)?\s+(?:\u0627\u0644)?\u0645\u0641\u0631\u0648\u0645(?:\u0629|\u0647)?\u0648?|\u0645\u0641\u0631\u0648\u0645(?:\u0629|\u0647)?\u0648?/iu.test(
    value
  );
}

function isArabicPastaSource(source: string) {
  return /\u0645\u0639?\u0643\u0631\u0648\u0646(?:\u0629|\u0647)?/iu.test(source);
}

function isArabicSoupOrBrothSource(source: string) {
  return /\u0634\u0648\u0631\u0628(?:\u0629|\u0647)|\u062d\u0633\u0627\u0621|\u0645\u0631\u0642(?:\u0629|\u0647)?/iu.test(source);
}

function isArabicStewSource(source: string) {
  return /\u064a\u062e\u0646(?:\u0629|\u0647|\u064a)/iu.test(source);
}

function hasPastaSource(source: string) {
  return /\b(pasta|spaghetti|linguine|fettuccine|macaroni|noodle|noodles|vermicelli)\b/iu.test(source) || isArabicPastaSource(source);
}

function isFlatbreadGroundMeatDishSource(source: string) {
  return /\b(lahmacun|lahm\s*(?:bi\s*)?ajin|lahm\s*b[iae]\s*ajeen|lahm\s*ajeen|kiymali\s+pide|pide|hawawshi|baladi\s+hawawshi|alexandrian\s+hawawshi|stuffed\s+(?:bread|flatbread|pita))\b|\u0644\u062d\u0645\s+\u0628\u0639\u062c\u064a\u0646|\u062d\u0648\u0627\u0648\u0634\u064a/iu.test(
    source
  );
}

function isSoupSource(source: string, identity?: ReturnType<typeof buildRecipePhotoIdentity>) {
  return (
    /\b(soup|broth|stew|chowder|bisque|consomme|ramen|pho|harira|chorba|corbasi|lentil soup|bean soup|vegetable soup|tomato soup)\b/iu.test(source) ||
    isArabicSoupOrBrothSource(source) ||
    isArabicStewSource(source) ||
    identity?.mealTypeKey === "soup" ||
    identity?.mealTypeKey === "stew"
  );
}

function isPotatoSource(source: string) {
  return /\b(potato|potatoes|fries|french fries|chips|wedges|smashed potatoes|mashed potatoes|baked potato|loaded potato|kumpir|compir|kompir|hash browns?|potato hash|potato salad|potato soup|potato casserole|potato gratin|scalloped potatoes)\b/iu.test(source);
}

function buildPotatoVisualClause(source: string) {
  const forms = [
    /\b(french fries|fries|chips)\b/iu.test(source)
      ? "For fries: show long thin potato sticks, deep-fried golden with crisp browned edges, piled together like French fries; not wedges, cubes, mash, or roasted chunks."
      : "",
    /\b(smashed potatoes|smashed potato)\b/iu.test(source)
      ? "For smashed potatoes: show small whole potatoes pressed flat into irregular discs, roasted until craggy and crisp at the edges with soft centers; not smooth mashed potatoes."
      : "",
    /\b(mashed potatoes|mashed potato|mash)\b/iu.test(source)
      ? "For mashed potatoes: show a soft creamy mound or scoop of smooth mashed potato with swirls or spoon marks; not fries, wedges, or cubes."
      : "",
    /\b(baked potato|loaded potato|jacket potato)\b/iu.test(source)
      ? "For baked potato: show a whole potato split open lengthwise with fluffy white interior visible and toppings placed inside the cut, not potato cubes or fries."
      : "",
    /\b(kumpir|compir|kompir)\b/iu.test(source)
      ? "For Turkish kumpir: show a very large baked potato split open and mashed inside its skin, visibly stuffed with listed toppings such as corn, olives, pickles, peas, vegetables, cheese, yogurt sauce, or salad only when listed; it must look like a stuffed baked potato, not fries or potato salad."
      : "",
    /\b(wedges|potato wedges)\b/iu.test(source)
      ? "For potato wedges: show thick wedge-shaped potato pieces with skin-on curved backs, roasted or fried golden; not long thin fries or cubes."
      : "",
    /\b(hash browns?|potato hash)\b/iu.test(source)
      ? "For hash browns or potato hash: show shredded or small diced potatoes browned together in a skillet-style mass with crisp golden surface; not fries or mashed potato."
      : "",
    /\b(potato soup|potato chowder)\b/iu.test(source)
      ? "For potato soup: show a bowl of creamy or brothy soup with potato pieces visible in liquid; not a dry plate of potatoes."
      : "",
    /\b(casserole|gratin|scalloped|bechamel|bechamel)\b/iu.test(source)
      ? "For potato casserole, gratin, scalloped potatoes, or bechamel: show layered sliced potatoes baked in a dish with browned top and visible layers; not loose fries or potato cubes."
      : "",
    /\b(stew|tagine|tray|baked tray|roasted tray)\b/iu.test(source)
      ? "For potato stew or tray bakes: show potato chunks or slices integrated into the named stew or oven tray, but keep the main named protein or sauce visible."
      : ""
  ].filter(Boolean);

  return [
    "Strict potato visual identity: potato must appear in the exact physical form named by the recipe, not as generic beige chunks.",
    forms.length
      ? `Recipe-specific potato form: ${forms.join(" ")}`
      : "If no exact potato form is named, show clearly identifiable potato pieces that match the cooking method: roasted chunks for roasted potatoes, boiled cubes for salad, thin slices for a bake, or golden pieces for fried potatoes.",
    "Hard negative: do not substitute a different potato form. Fries, smashed potatoes, mashed potatoes, baked potato/kumpir, wedges, hash browns, soup, and casserole are visually different and must not be confused.",
    "Hard negative: avoid generic brown cubes, random beige side dishes, bread, rice, pasta, or unrelated vegetables unless listed in the recipe."
  ].join(" ");
}

function buildWrongPotatoFormNegativePrompt(source: string) {
  const wrongForms = [
    /\b(french fries|fries|chips)\b/iu.test(source) ? "" : "french fries, thin fries, chips",
    /\b(smashed potatoes|smashed potato)\b/iu.test(source) ? "" : "smashed potatoes, flattened potato rounds",
    /\b(mashed potatoes|mashed potato|mash)\b/iu.test(source) ? "" : "mashed potatoes, smooth potato puree",
    /\b(baked potato|loaded potato|jacket potato|kumpir|compir|kompir)\b/iu.test(source) ? "" : "whole baked potato, loaded potato, kumpir",
    /\b(wedges|potato wedges)\b/iu.test(source) ? "" : "potato wedges",
    /\b(hash browns?|potato hash)\b/iu.test(source) ? "" : "hash browns, potato hash",
    /\b(potato soup|potato chowder)\b/iu.test(source) ? "" : "potato soup, potato chowder",
    /\b(casserole|gratin|scalloped|bechamel|bechamel)\b/iu.test(source) ? "" : "potato gratin, scalloped potatoes, potato casserole"
  ].filter(Boolean);

  if (!wrongForms.length) return "";
  return `wrong potato form, ${wrongForms.join(", ")}`;
}

function buildSoupVisualClause(
  source: string,
  identity: ReturnType<typeof buildRecipePhotoIdentity>,
  forbiddenStarches: string[]
) {
  const soupName = identity.canonicalDishKey?.replace(/-/g, " ") || identity.cleanQuery || "the named soup";
  const textureCue = /\b(chowder|cream|creamy|bisque)\b/iu.test(source)
    ? "The liquid should read as creamy soup or chowder only when cream or dairy is listed or the exact dish name requires it."
    : /\b(lentil|dal|split pea|bean|fava|besara)\b/iu.test(source)
    ? "The liquid should read as thick legume soup with spoonable body, not dry beans on a plate."
    : /\b(noodle|ramen|pho)\b/iu.test(source)
    ? "The bowl may include noodles only when named or listed, but the broth must remain clearly visible."
    : "The liquid should read as broth or soup base, with visible spoonable liquid around the solids.";
  const visibleSolids = [
    /\b(mushroom|mushrooms)\b/iu.test(source) ? "mushroom pieces or slices" : "",
    /\b(lentils?|dal)\b/iu.test(source) ? "lentils suspended in the soup" : "",
    /\b(bean|beans|chickpea|chickpeas|fava)\b/iu.test(source) ? "beans or chickpeas in the soup" : "",
    /\b(tomato)\b/iu.test(source) ? "red tomato soup or tomato pieces" : "",
    /\b(vegetable|carrot|celery|zucchini|squash|cauliflower|broccoli)\b/iu.test(source) ? "listed vegetables visible in the broth" : "",
    /\b(chicken|beef|fish|shrimp|seafood)\b/iu.test(source) ? "the named protein visible in the soup liquid" : ""
  ].filter(Boolean);

  return [
    `Strict visual identity: this is ${soupName}, a soup served in a bowl with visible liquid, not a dry plate of the main ingredient.`,
    "The image must immediately read as soup: use a deep bowl or soup crock, spoonable liquid surface, and ingredients partly submerged in broth or soup base.",
    textureCue,
    visibleSolids.length
      ? `Visible soup contents should match the recipe: ${visibleSolids.join(", ")}.`
      : "Show the named ingredients as contents inside the soup liquid, not plated separately.",
    "Hard negative: do not show dry sauteed vegetables, a salad, pasta plate, rice bowl, roasted tray, grilled plate, curry plate, or the main ingredient sitting alone without liquid.",
    "Hard negative: do not show a sauce-coated plate and call it soup; the vessel and liquid must make it unmistakably soup.",
    forbiddenStarches.length
      ? `Hard negative: do not include ${forbiddenStarches.join("; ")} as side dishes unless listed; if a starch belongs in the soup, it must appear inside the bowl and not dominate.`
      : ""
  ].filter(Boolean).join(" ");
}

function isVeganOrDairyFreeSource(source: string) {
  return /\b(vegan|dairy[- ]?free|egg[- ]?free|plant[- ]?based|without eggs?|no eggs?|no dairy)\b/iu.test(source);
}

function buildPlantBasedVisualConstraint(source: string) {
  const constraints: string[] = [];
  if (/\b(vegan|egg[- ]?free|plant[- ]?based|without eggs?|no eggs?)\b/iu.test(source)) {
    constraints.push(
      "Plant-based visual constraint: do not show eggs, egg yolks, egg whites, poached eggs, fried eggs, boiled eggs, omelette, mayonnaise, meat, poultry, fish, shrimp, or seafood."
    );
  }
  if (/\b(vegan|dairy[- ]?free|plant[- ]?based|without dairy|no dairy)\b/iu.test(source)) {
    constraints.push(
      "Dairy-free visual constraint: do not show cheese, feta, mozzarella, parmesan, cream, yogurt, labneh, butter, ghee, creamy dairy sauce, or dairy garnish."
    );
  }

  if (!constraints.length) return "";

  return [
    ...constraints,
    "Use only plant-based visual substitutes that are named or implied by the exact recipe, such as chickpeas, beans, tofu, lentils, mushrooms, vegetables, nuts, seeds, tomato sauce, tahini, or herbs.",
    "Hard negative: do not use the standard non-vegan version of the dish if it would add eggs, dairy, meat, fish, or seafood."
  ].join(" ");
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
  const source = buildVisualMeaningSource(identity.cleanQuery, ingredients);
  const forbiddenGroups: string[] = [];
  const allowsDishFlatbread = isFlatbreadGroundMeatDishSource(source);

  if (
    !supportStarches.some((value) => hasPastaSource(value)) &&
    identity.starchKey !== "pasta" &&
    identity.mealTypeKey !== "pasta"
  ) {
    forbiddenGroups.push("spaghetti, pasta, noodles, vermicelli");
  }

  if (!supportStarches.some((value) => /\b(rice|pilaf|bulgur|couscous)\b/i.test(value)) && identity.starchKey !== "rice") {
    forbiddenGroups.push("plain rice, pilaf, couscous, bulgur");
  }

  if (!allowsDishFlatbread && !supportStarches.some((value) => /\b(bread|pita|bun|roll|toast|dough|flatbread)\b/i.test(value)) && identity.starchKey !== "bread") {
    forbiddenGroups.push("bread, toast, buns, pita");
  }

  if (!/\bsoup|stew|broth\b/i.test(source) && !isArabicSoupOrBrothSource(source) && !isArabicStewSource(source) && identity.mealTypeKey !== "soup" && identity.mealTypeKey !== "stew") {
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
