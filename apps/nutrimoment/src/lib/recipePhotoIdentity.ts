import { getAllDishes, getDishById } from "@/lib/cuisineCatalogs/completeCatalogs";
import type { CuisineDish } from "@/lib/cuisineCatalogs/types";

export interface RecipePhotoIdentity {
  alternateSignatures: string[];
  beanTypeKey?: string;
  canonicalDishKey?: string;
  cleanQuery: string;
  cookingMethodKey?: string;
  coreTokens: string[];
  cuisineKey?: string;
  familyKey?: string;
  mainIngredientKey?: string;
  mealTypeKey?: string;
  sauceKey?: string;
  searchQueries: string[];
  starchKey?: string;
  signature: string;
}

export interface KnownDishDefinition {
  aliases: RegExp[];
  canonicalName: string;
  cuisineKey?: string;
  imageUrl?: string;
  key: string;
}

const ARABIC = {
  balila: "\u0628\u0644\u064a\u0644\u0629",
  bean: "\u0641\u0627\u0635\u0648\u0644\u064a\u0627",
  besara: "\u0628\u0635\u0627\u0631\u0629",
  egg: "\u0628\u064a\u0636",
  egypt: "\u0645\u0635\u0631\u064a",
  egyptAdj: "\u0645\u0635\u0631\u064a\u0629",
  fava: "\u0641\u0648\u0644",
  loubia: "\u0644\u0648\u0628\u064a\u0627",
  middleEast: "\u0634\u0631\u0642 \u0623\u0648\u0633\u0637\u064a\u0629",
  middleEastAlt: "\u0634\u0631\u0642 \u0627\u0648\u0633\u0637\u064a\u0629",
  chickpea: "\u062d\u0645\u0635",
  lentil: "\u0639\u062f\u0633",
  liver: "\u0643\u0628\u062f\u0629",
  liverAlt: "\u0643\u0628\u062f\u0647",
  rice: "\u0631\u0632",
  shakshuka: "\u0634\u0643\u0634\u0648\u0643\u0629",
  yogurt: "\u0632\u0628\u0627\u062f\u064a"
} as const;

const TOKEN_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bkposhary\b/gi, "koshary"],
  [/\bkoshari\b/gi, "koshary"],
  [/\bkushari\b/gi, "koshary"],
  [/\bborghol\b/gi, "bulgur"],
  [/\bburghul\b/gi, "bulgur"],
  [/\bburghol\b/gi, "bulgur"],
  [/\bkofta\b/gi, "kafta"],
  [/\bkofte\b/gi, "kafta"],
  [/\bkefta\b/gi, "kafta"],
  [/\bkufta\b/gi, "kafta"],
  [/\bfoul\b/gi, "ful"],
  [/\bfuul\b/gi, "ful"],
  [/\bshakshouka\b/gi, "shakshuka"],
  [/\bfasoulia\b/gi, "fasolia"],
  [/\bfasoolia\b/gi, "fasolia"],
  [/\blubia\b/gi, "loubia"],
  [/\bbessara\b/gi, "besara"]
];

const QUERY_NOISE_PATTERNS = [
  /\b(food plated|prepared food|prepared|recipe|dish|meal|food)\b/gi,
  /\b\d+(?:\/\d+)?\s*(?:g|gram|grams|kg|lb|lbs|oz|cup|cups|tbsp|tsp|large|small|medium|can|cans)\b/gi,
  /[()[\]"]/g
];

export const KNOWN_DISHES: KnownDishDefinition[] = [
  {
    aliases: [/\b(rice (?:kofta|kafta)|koftet roz|koftet arroz|egyptian rice (?:kofta|kafta))\b/i],
    canonicalName: "egyptian rice kofta",
    cuisineKey: "egyptian",
    key: "rice-kofta"
  },
  {
    aliases: [
      /\b(dawood basha|daoud basha|dawood pasha|daoud pasha|kofta dawood basha|egyptian meatballs tomato sauce)\b/i,
      /\u062f\u0627(?:\u0648|\u0648\u0648)?\u062f\s+\u0628\u0627\u0634\u0627/iu,
      /\u0643\u0641\u062a(?:\u0629|\u0647)\s+\u062f\u0627(?:\u0648|\u0648\u0648)?\u062f\s+\u0628\u0627\u0634\u0627/iu
    ],
    canonicalName: "dawood basha",
    cuisineKey: "egyptian",
    key: "dawood-basha"
  },
  {
    aliases: [
      /\b(taagen kofta|tagine kofta|egyptian kofta tagine|kofta potato tray|kofta with potatoes)\b/i,
      /\u0637\u0627\u062c\u0646\s+\u0643\u0641\u062a(?:\u0629|\u0647)/iu,
      /\u0643\u0641\u062a(?:\u0629|\u0647).*\u0628\u0627\u0644\u0628\u0637\u0627\u0637\u0633/iu
    ],
    canonicalName: "taagen kofta",
    cuisineKey: "egyptian",
    key: "taagen-kofta"
  },
  {
    aliases: [/\b(kafta|kebab|kabab)\b/i, /\u0643\u0641\u062a(?:\u0629|\u0647)/iu],
    canonicalName: "kafta kebab",
    cuisineKey: "middle-eastern",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Oriental_food_including_beef_kabab%2C_shish_tawoook%2C_and_kafta_kabab_%28Orlando%29_May_2023.jpg/960px-Oriental_food_including_beef_kabab%2C_shish_tawoook%2C_and_kafta_kabab_%28Orlando%29_May_2023.jpg",
    key: "kafta"
  },
  {
    aliases: [
      /\bhawawshi\b/i,
      /\bmeat stuffed (?:bread|pita|flatbread)\b/i,
      /\bstuffed (?:baladi )?(?:bread|pita|flatbread)\b/i,
      /\u062d\u0648\u0627\u0648\u0634\u064a/iu,
      /\u062e\u0628\u0632\s+\u0645\u062d\u0634\u0648/iu,
      /\u0639\u064a\u0634\s+\u0645\u062d\u0634\u0648/iu,
      /\u0645\u062d\u0634\u0648\s+\u0628\u0627\u0644\u0644\u062d\u0645\s+\u0627\u0644\u0645\u0641\u0631\u0648\u0645/iu
    ],
    canonicalName: "hawawshi",
    cuisineKey: "egyptian",
    key: "hawawshi"
  },
  {
    aliases: [/\bmercimek corbasi\b/i, /\bturkish lentil soup\b/i],
    canonicalName: "mercimek corbasi",
    cuisineKey: "turkish",
    key: "mercimek-corbasi"
  },
  {
    aliases: [/\bpogaca\b/i, /\bpoaca\b/i],
    canonicalName: "pogaca",
    cuisineKey: "turkish",
    key: "pogaca"
  },
  {
    aliases: [/\bsucuklu yumurta\b/i, /\beggs? with sucuk\b/i],
    canonicalName: "sucuklu yumurta",
    cuisineKey: "turkish",
    key: "sucuklu-yumurta"
  },
  {
    aliases: [/\bcilbir\b/i, /\bçılbır\b/i, /\b(poached eggs? with yogurt|eggs? with yogurt|yogurt eggs?)\b/i],
    canonicalName: "cilbir",
    cuisineKey: "turkish",
    key: "cilbir"
  },
  {
    aliases: [/\bmenemen\b/i],
    canonicalName: "menemen",
    cuisineKey: "turkish",
    key: "menemen"
  },
  {
    aliases: [/\bgozleme\b/i, /\bgözleme\b/i],
    canonicalName: "gozleme",
    cuisineKey: "turkish",
    key: "gozleme"
  },
  {
    aliases: [/\b(ispanakli pide|spinach pide)\b/i],
    canonicalName: "ispanakli pide",
    cuisineKey: "turkish",
    key: "ispanakli-pide"
  },
  {
    aliases: [/\b(turkish pide with beef|beef pide|turkish beef pide)\b/i],
    canonicalName: "kiymali pide",
    cuisineKey: "turkish",
    key: "kiymali-pide"
  },
  {
    aliases: [/\b(kiymali pide|kıymalı pide|minced meat pide)\b/i],
    canonicalName: "kiymali pide",
    cuisineKey: "turkish",
    key: "kiymali-pide"
  },
  {
    aliases: [/\blahmacun\b/i, /\u0644\u062d\u0645\s+\u0628\u0639\u062c\u064a\u0646/iu],
    canonicalName: "lahmacun",
    cuisineKey: "turkish",
    key: "lahmacun"
  },
  {
    aliases: [
      /\b(lahm\s*(?:bi\s*)?ajin|lahm\s*b[iae]\s*ajeen|lahm\s*ajeen|lahmajun|lahmajoun|meat flatbread)\b/i,
      /\u0644\u062d\u0645\s+\u0628\u0639\u062c\u064a\u0646/iu
    ],
    canonicalName: "lahm bi ajin",
    cuisineKey: "middle-eastern",
    key: "lahm-ajin"
  },
  {
    aliases: [/\btavuk sis\b/i, /\bchicken shish\b/i, /\bchicken sis\b/i],
    canonicalName: "tavuk sis",
    cuisineKey: "turkish",
    key: "tavuk-sis"
  },
  {
    aliases: [/\badana kebab\b/i, /\u0623\u0636\u0646\u0629\s+(?:\u0643\u0628\u0627\u0628|\u0643\u0641\u062a(?:\u0629|\u0647))|\u0627\u062f\u0646\u0629\s+(?:\u0643\u0628\u0627\u0628|\u0643\u0641\u062a(?:\u0629|\u0647))/iu],
    canonicalName: "adana kebab",
    cuisineKey: "turkish",
    key: "adana-kebab"
  },
  {
    aliases: [/\btesti kebabi\b/i, /\bpottery kebab\b/i],
    canonicalName: "testi kebabi",
    cuisineKey: "turkish",
    key: "testi-kebabi"
  },
  {
    aliases: [/\bmanti\b/i],
    canonicalName: "manti",
    cuisineKey: "turkish",
    key: "manti"
  },
  {
    aliases: [/\bcig kofte\b/i, /\bçiğ köfte\b/i],
    canonicalName: "cig kofte",
    cuisineKey: "turkish",
    key: "cig-kofte"
  },
  {
    aliases: [/\bkumpir\b/i],
    canonicalName: "kumpir",
    cuisineKey: "turkish",
    key: "kumpir"
  },
  {
    aliases: [/\bhamsili pilav\b/i, /\banchovy rice\b/i],
    canonicalName: "hamsili pilav",
    cuisineKey: "turkish",
    key: "hamsili-pilav"
  },
  {
    aliases: [/\bkarniyarik\b/i, /\bkarniyarık\b/i],
    canonicalName: "karniyarik",
    cuisineKey: "turkish",
    key: "karniyarik"
  },
  {
    aliases: [/\b(turkish spiral borek|spiral borek|ground beef borek|spiced ground beef borek|kol boregi|kol borek)\b/i],
    canonicalName: "turkish spiral borek",
    cuisineKey: "turkish",
    key: "turkish-spiral-borek"
  },
  {
    aliases: [/\b(turkish musakka|turkish moussaka|eggplant ground beef casserole|eggplant and ground beef casserole)\b/i],
    canonicalName: "turkish musakka",
    cuisineKey: "turkish",
    key: "turkish-musakka"
  },
  {
    aliases: [/\bpatlican kebabi\b/i, /\bpatlıcan kebabı\b/i, /\beggplant kebab\b/i],
    canonicalName: "patlican kebabi",
    cuisineKey: "turkish",
    key: "patlican-kebabi"
  },
  {
    aliases: [/\b(dolma|sarma)\b/i],
    canonicalName: "sarma and dolma",
    cuisineKey: "turkish",
    key: "sarma-dolma"
  },
  {
    aliases: [
      /\bmacarona bechamel\b/i,
      /\bmacarona bashamel\b/i,
      /\begyptian bechamel pasta\b/i,
      /\bbaked macarona bechamel\b/i,
      /\u0645\u0643\u0631\u0648(?:\u0646\u0629|\u0646\u0647).*(?:\u0628\u0634\u0627\u0645\u064a\u0644|\u0628\u0627\u0644\u0628\u0634\u0627\u0645\u064a\u0644)/iu,
      /\u0645\u0639\u0643\u0631\u0648(?:\u0646\u0629|\u0646\u0647).*(?:\u0628\u0634\u0627\u0645\u064a\u0644|\u0628\u0627\u0644\u0628\u0634\u0627\u0645\u064a\u0644)/iu
    ],
    canonicalName: "macarona bechamel",
    cuisineKey: "egyptian",
    key: "macarona-bechamel"
  },
  {
    aliases: [
      /\b(ground beef penne|beef penne|one[-\s]pan beef penne|one[-\s]pan ground beef penne)\b/i,
      /\b(tomato beef penne)\b/i,
      /\bpenne\s+(?:with|and)\s+(?:ground beef|minced beef|meat sauce)\b/i
    ],
    canonicalName: "one-pan ground beef penne",
    cuisineKey: "american",
    key: "ground-beef-penne"
  },
  {
    aliases: [
      /\b(ground beef pasta|beef pasta skillet|beef tomato pasta|hamburger pasta)\b/i,
      /\b(elbow macaroni|macaroni)\s+(?:with|and)\s+(?:ground beef|minced beef|meat sauce)\b/i
    ],
    canonicalName: "ground beef pasta skillet",
    cuisineKey: "american",
    key: "ground-beef-pasta"
  },
  {
    aliases: [/\b(hamburger stew|hamburger soup|ground beef stew|ground beef vegetable stew)\b/i],
    canonicalName: "hamburger stew",
    cuisineKey: "american",
    key: "hamburger-stew"
  },
  {
    aliases: [/\bkebab halla\b/i, /\begyptian meat stew\b/i],
    canonicalName: "kebab halla",
    cuisineKey: "egyptian",
    key: "kebab-halla"
  },
  {
    aliases: [
      /\b(alexandrian liver|kibda iskandarani|kibda eskandarani|kebda iskandarani|kebda eskandarani|iskandarani liver)\b/i,
      /\begyptian liver sandwiches?\b/i,
      /\u0643\u0628\u062f[ةه]\s+(?:\u0625\u0633\u0643\u0646\u062f\u0631\u0627\u0646\u064a|\u0627\u0633\u0643\u0646\u062f\u0631\u0627\u0646\u064a)/iu
    ],
    canonicalName: "alexandrian liver",
    cuisineKey: "egyptian",
    key: "alexandrian-liver"
  },
  {
    aliases: [/\b(kebda|kibda)\s+chermoula\b/i, /\bkebda\s+mchermla\b/i, /\bnorth african\s+liver\s+chermoula\b/i, /\balgerian\s+liver\b/i],
    canonicalName: "kebda chermoula",
    cuisineKey: "north-african",
    key: "kebda-chermoula"
  },
  {
    aliases: [/\bmoroccan\s+kebda\b/i, /\bmoroccan\s+liver\s+strips?\b/i, /\b(kebda|liver)\s+moroccan\b/i],
    canonicalName: "moroccan kebda",
    cuisineKey: "moroccan",
    key: "moroccan-kebda"
  },
  {
    aliases: [/\bmoroccan\s+liver\s+stew\b/i, /\bkebda\s+mchermla\b/i, /\bkebda\s+mchermoula\b/i, /\bmoroccan\s+kebda\s+stew\b/i],
    canonicalName: "moroccan liver stew",
    cuisineKey: "moroccan",
    key: "moroccan-liver-stew"
  },
  {
    aliases: [/\bkebda\s+bel\s+rada\b/i, /\bfried\s+bran\s+liver\b/i, /\bbran[-\s]coated\s+liver\b/i],
    canonicalName: "kebda bel rada",
    cuisineKey: "egyptian",
    key: "kebda-bel-rada"
  },
  {
    aliases: [/\bkebda\s+sandwiches?\b/i, /\bliver\s+sandwiches?\b/i],
    canonicalName: "egyptian liver sandwiches",
    cuisineKey: "egyptian",
    key: "egyptian-liver-sandwiches"
  },
  {
    aliases: [/\bmahshi\b/i, /\bmixed mahshi\b/i],
    canonicalName: "mixed mahshi",
    cuisineKey: "egyptian",
    key: "mahshi"
  },
  {
    aliases: [/\b(koshary|koshari|kushari)\b/i],
    canonicalName: "koshary",
    cuisineKey: "egyptian",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Egyptian_food_Koshary.jpg/960px-Egyptian_food_Koshary.jpg",
    key: "koshary"
  },
  {
    aliases: [/\b(roz bel ads|ruz bel ads|rice with lentils|lentils and rice)\b/i],
    canonicalName: "mujadara",
    cuisineKey: "middle-eastern",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Mujaddara.jpg/960px-Mujaddara.jpg",
    key: "mujadara"
  },
  {
    aliases: [/\b(macarona bel ads|macarona bel adas|pasta and lentils)\b/i],
    canonicalName: "koshary",
    cuisineKey: "egyptian",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Egyptian_food_Koshary.jpg/960px-Egyptian_food_Koshary.jpg",
    key: "koshary"
  },
  {
    aliases: [/\b(sayadeya|sayadeyah|sayadieh|sayadiah|egyptian fish rice)\b/i, /\u0635\u064a\u0627\u062f(?:\u064a\u0629|\u064a\u0647)/iu],
    canonicalName: "sayadeya",
    cuisineKey: "egyptian",
    key: "sayadeya"
  },
  {
    aliases: [
      /\b(samak singari|samak sengari|fish singari|fish sengari|bori singari|bori sengari|bouri singari|bouri sengari)\b/i,
      /\b(butterflied egyptian fish|egyptian butterflied fish)\b/i,
      /\u0633\u0645\u0643\s+\u0633\u0646\u062c\u0627\u0631\u064a/iu,
      /\u0628\u0648\u0631\u064a\s+\u0633\u0646\u062c\u0627\u0631\u064a/iu,
      /\u0633\u0646\u062c\u0627\u0631\u064a/iu
    ],
    canonicalName: "samak singari",
    cuisineKey: "egyptian",
    key: "samak-singari"
  },
  {
    aliases: [
      /\b(egyptian fish tagine|fish tagine|alexandrian fish|samak iskandarani|samak eskandarani|alexandrian baked fish)\b/i,
      /\b(baked fish with potato|baked fish with potatoes|oven fish with potato|oven fish with potatoes)\b/i,
      /\u0637\u0627\u062c\u0646\s+\u0633\u0645\u0643/iu,
      /\u0633\u0645\u0643\s+\u0627\u0633\u0643\u0646\u062f\u0631\u0627\u0646\u064a/iu,
      /\u0633\u0645\u0643\s+\u0625\u0633\u0643\u0646\u062f\u0631\u0627\u0646\u064a/iu
    ],
    canonicalName: "egyptian fish tagine",
    cuisineKey: "egyptian",
    key: "egyptian-fish-tagine"
  },
  {
    aliases: [/\b(ful|medames)\b/i, /\bfava bean/i, new RegExp(ARABIC.fava, "iu")],
    canonicalName: "ful medames",
    cuisineKey: "egyptian",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/b/bf/Ful_medames_%28arabic_meal%29.jpg",
    key: "ful-medames"
  },
  {
    aliases: [/\bmujadara\b/i, /\bmujaddara\b/i],
    canonicalName: "mujadara",
    cuisineKey: "middle-eastern",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Mujaddara.jpg/960px-Mujaddara.jpg",
    key: "mujadara"
  },
  {
    aliases: [/\bshakshuka\b/i, new RegExp(ARABIC.shakshuka, "iu")],
    canonicalName: "shakshuka",
    cuisineKey: "middle-eastern",
    imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Shakshuka%202025.jpg",
    key: "shakshuka"
  },
  {
    aliases: [/\bbesara\b/i, new RegExp(ARABIC.besara, "iu")],
    canonicalName: "besara",
    cuisineKey: "egyptian",
    key: "besara"
  },
  {
    aliases: [/\bfattah\b/i, /\bfatta\b/i],
    canonicalName: "fattah",
    cuisineKey: "egyptian",
    key: "fattah"
  },
  {
    aliases: [/\bhamam mahshi\b/i, /\bstuffed pigeon\b/i],
    canonicalName: "hamam mahshi",
    cuisineKey: "egyptian",
    key: "hamam-mahshi"
  },
  {
    aliases: [/\bbalila\b/i, new RegExp(ARABIC.balila, "iu")],
    canonicalName: "balila",
    cuisineKey: "middle-eastern",
    key: "balila"
  },
  {
    aliases: [/\bfasolia\b/i, new RegExp(ARABIC.bean, "iu")],
    canonicalName: "fasolia",
    cuisineKey: "middle-eastern",
    key: "fasolia"
  },
  {
    aliases: [/\bloubia\b/i, new RegExp(ARABIC.loubia, "iu")],
    canonicalName: "loubia bzeit",
    cuisineKey: "middle-eastern",
    key: "loubia-bzeit"
  }
];

const CUISINE_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
  { key: "egyptian", pattern: new RegExp(`\\begyptian\\b|${ARABIC.egyptAdj}|${ARABIC.egypt}`, "iu") },
  { key: "turkish", pattern: /\bturkish\b/iu },
  {
    key: "middle-eastern",
    pattern: new RegExp(`\\bmiddle eastern\\b|${ARABIC.middleEast}|${ARABIC.middleEastAlt}`, "iu")
  },
  { key: "mediterranean", pattern: /\bmediterranean\b/iu },
  { key: "indian", pattern: /\bindian\b/iu },
  { key: "italian", pattern: /\bitalian\b/iu },
  { key: "thai", pattern: /\bthai\b/iu },
  { key: "asian", pattern: /\basian\b/iu },
  { key: "mexican", pattern: /\bmexican\b|tex[- ]?mex|southwestern/iu },
  { key: "american", pattern: /\bamerican\b/iu },
  { key: "international", pattern: /\binternational\b/iu },
  { key: "general", pattern: /\bgeneral\b/iu }
];

const MAIN_INGREDIENT_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
  { key: "chicken", pattern: /\bchicken\b/iu },
  { key: "mussels", pattern: /\bmussel|mussels\b/iu },
  { key: "shrimp", pattern: /\bshrimp|prawn\b/iu },
  { key: "liver", pattern: new RegExp(`\\bliver|kebda|kibda|ciger|cigeri\\b|${ARABIC.liver}|${ARABIC.liverAlt}`, "iu") },
  { key: "lamb", pattern: /\blamb\b/iu },
  { key: "beef", pattern: /\bbeef|steak|meat\b/iu },
  { key: "veal", pattern: /\bveal\b/iu },
  { key: "fish", pattern: /\bwhite fish|fish|cod|tilapia|sea bass|snapper|salmon\b/iu },
  { key: "tuna", pattern: /\btuna\b/iu },
  { key: "tofu", pattern: /\btofu\b/iu },
  { key: "yogurt", pattern: new RegExp(`\\byogurt|labneh\\b|${ARABIC.yogurt}`, "iu") },
  { key: "egg", pattern: new RegExp(`\\begg\\b|${ARABIC.egg}`, "iu") },
  { key: "chickpea", pattern: new RegExp(`\\bchickpea|chickpeas\\b|${ARABIC.chickpea}`, "iu") },
  { key: "lentil", pattern: new RegExp(`\\blentil|lentils\\b|${ARABIC.lentil}`, "iu") },
  { key: "bean", pattern: new RegExp(`\\bbean|beans|fava\\b|${ARABIC.fava}|${ARABIC.bean}|${ARABIC.loubia}`, "iu") },
  { key: "rice", pattern: new RegExp(`\\brice\\b|${ARABIC.rice}`, "iu") }
];

const BEAN_TYPE_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
  { key: "white-bean", pattern: /\bwhite bean|white beans|cannellini|navy bean|navy beans\b/iu },
  { key: "green-bean", pattern: /\bgreen bean|green beans\b/iu },
  { key: "black-bean", pattern: /\bblack bean|black beans\b/iu },
  { key: "fava-bean", pattern: new RegExp(`\\bfava|fava bean|fava beans\\b|${ARABIC.fava}`, "iu") },
  { key: "chickpea", pattern: new RegExp(`\\bchickpea|chickpeas\\b|${ARABIC.chickpea}`, "iu") }
];

const SAUCE_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
  { key: "red-sauce", pattern: /\bred sauce|tomato sauce|marinara|pomodoro|tomato basil\b/iu },
  { key: "white-sauce", pattern: /\bwhite sauce|alfredo|cream sauce|creamy sauce|creamy\b/iu },
  { key: "tahini", pattern: /\btahini|sesame sauce\b/iu },
  { key: "pesto", pattern: /\bpesto\b/iu },
  { key: "soy-garlic", pattern: /\bsoy garlic|garlic soy|soy sauce\b/iu },
  { key: "curry", pattern: /\bcurry sauce|curry\b/iu }
];

const STARCH_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
  { key: "pasta", pattern: /\bpasta|spaghetti|penne|fettuccine|macaroni\b/iu },
  { key: "noodles", pattern: /\bnoodle|noodles|ramen|udon|soba\b/iu },
  { key: "rice", pattern: new RegExp(`\\brice\\b|${ARABIC.rice}`, "iu") },
  { key: "bulgur", pattern: /\bbulgur|burghul|borghol\b/iu },
  { key: "potato", pattern: /\bpotato|potatoes\b/iu },
  { key: "bread", pattern: /\bbread|toast|bun|roll|wrap\b/iu }
];

const COOKING_METHOD_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
  { key: "grilled", pattern: /\bgrilled|chargrilled\b/iu },
  { key: "fried", pattern: /\bfried|crispy|breaded|crunchy\b/iu },
  { key: "baked", pattern: /\bbaked\b/iu },
  { key: "roasted", pattern: /\broasted\b/iu },
  { key: "stir-fry", pattern: /\bstir[- ]?fry\b/iu },
  { key: "pan-seared", pattern: /\bpan[- ]seared|seared\b/iu }
];

const MEAL_TYPE_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
  { key: "pasta", pattern: /\bpasta|spaghetti|penne|fettuccine|macaroni\b/iu },
  { key: "noodles", pattern: /\bnoodle|noodles|ramen|udon|soba\b/iu },
  { key: "salad", pattern: /\bsalad\b/iu },
  { key: "soup", pattern: /\bsoup\b/iu },
  { key: "stew", pattern: /\bstew\b/iu },
  { key: "skillet", pattern: /\bskillet\b/iu },
  { key: "stir-fry", pattern: /\bstir[- ]?fry\b/iu },
  { key: "chili", pattern: /\bchili\b/iu },
  { key: "dip", pattern: /\bdip\b/iu },
  { key: "pilaf", pattern: /\bpilaf\b|\bplov\b/iu },
  { key: "bowl", pattern: /\bbowl\b/iu },
  { key: "omelet", pattern: /\bomelet|omelette\b/iu },
  { key: "scramble", pattern: /\bscramble|scrambled\b/iu },
  { key: "tagine", pattern: /\btagine\b/iu },
  { key: "grill", pattern: /\bgrilled|grill\b/iu },
  { key: "kofta", pattern: /\bkafta\b|كفتة/iu },
  { key: "shakshuka", pattern: new RegExp(`\\bshakshuka\\b|${ARABIC.shakshuka}`, "iu") }
];

const CORE_TOKEN_STOP_WORDS = new Set([
  "adapted",
  "and",
  "baked",
  "bowl",
  "food",
  "general",
  "healthy",
  "inspired",
  "international",
  "lighter",
  "meal",
  "middle",
  "eastern",
  "mediterranean",
  "prepared",
  "recipe",
  "roasted",
  "sauteed",
  "simple",
  "spiced",
  "style",
  "traditional",
  "with"
]);

export function buildRecipePhotoIdentity(query: string): RecipePhotoIdentity {
  const cleanQuery = normalizeRecipePhotoQuery(query);
  const knownDish = findKnownDish(cleanQuery);
  const cuisineKey = knownDish?.cuisineKey ?? detectCuisine(cleanQuery);
  const mainIngredientKey = detectMainIngredient(cleanQuery);
  const beanTypeKey = detectBeanType(cleanQuery);
  const sauceKey = detectSauce(cleanQuery);
  const starchKey = detectStarch(cleanQuery);
  const cookingMethodKey = detectCookingMethod(cleanQuery);
  const mealTypeKey = detectMealType(cleanQuery);
  const familyKey =
    knownDish?.key ??
    detectRecipePhotoFamily(cleanQuery, {
      beanTypeKey,
      cuisineKey,
      mainIngredientKey,
      mealTypeKey,
      starchKey
    });
  const coreTokens = getCoreTokens(cleanQuery, knownDish?.canonicalName);
  const searchQueries = buildSearchQueries(cleanQuery, {
    beanTypeKey,
    canonicalName: knownDish?.canonicalName,
    cookingMethodKey,
    cuisineKey,
    familyKey,
    mainIngredientKey,
    mealTypeKey,
    sauceKey,
    starchKey
  });
  const signature = buildRecipePhotoSignature({
    canonicalDishKey: knownDish?.key,
    cookingMethodKey,
    coreTokens,
    cuisineKey,
    familyKey,
    mainIngredientKey,
    mealTypeKey,
    sauceKey,
    starchKey
  });
  const alternateSignatures = buildAlternateRecipePhotoSignatures({
    beanTypeKey,
    canonicalDishKey: knownDish?.key,
    cookingMethodKey,
    cuisineKey,
    familyKey,
    mainIngredientKey,
    mealTypeKey,
    sauceKey,
    starchKey
  }).filter((candidate) => candidate !== signature);

  return {
    alternateSignatures,
    beanTypeKey,
    canonicalDishKey: knownDish?.key,
    cleanQuery,
    cookingMethodKey,
    coreTokens,
    cuisineKey,
    familyKey,
    mainIngredientKey,
    mealTypeKey,
    sauceKey,
    searchQueries,
    starchKey,
    signature
  };
}

export function findKnownDish(query: string) {
  const normalized = normalizeRecipePhotoQuery(query);
  return KNOWN_DISHES.find((dish) => dish.aliases.some((alias) => alias.test(normalized))) ?? findCatalogKnownDish(normalized);
}

export function normalizeRecipePhotoQuery(query: string) {
  const replaced = TOKEN_REPLACEMENTS.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), query);
  const clean = QUERY_NOISE_PATTERNS.reduce((value, pattern) => value.replace(pattern, " "), replaced)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  return clean || "food";
}

function findCatalogKnownDish(normalizedQuery: string): KnownDishDefinition | null {
  if (!normalizedQuery || normalizedQuery === "food") return null;

  const matches = getAllDishes()
    .map((dish) => ({ dish, score: scoreCatalogDishNameMatch(dish, normalizedQuery) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || right.dish.iconicScore - left.dish.iconicScore);

  const best = matches[0]?.dish;
  if (!best) return null;

  return {
    aliases: [],
    canonicalName: normalizeRecipePhotoQuery(best.names.english[0]),
    cuisineKey: toRecipePhotoCuisineKey(best.cuisine),
    key: best.id
  };
}

function scoreCatalogDishNameMatch(dish: CuisineDish, normalizedQuery: string) {
  const names = [...dish.names.english, ...dish.names.native, ...(dish.names.other ?? [])]
    .map(normalizeRecipePhotoQuery)
    .filter((name) => name.length >= 4);
  let bestScore = 0;

  for (const name of names) {
    if (normalizedQuery === name) {
      bestScore = Math.max(bestScore, 100 + dish.iconicScore);
      continue;
    }

    if (includesWholePhrase(normalizedQuery, name)) {
      bestScore = Math.max(bestScore, 80 + dish.iconicScore);
      continue;
    }

    if (name.includes(normalizedQuery) && normalizedQuery.split(/\s+/).length >= 2) {
      bestScore = Math.max(bestScore, 45 + dish.iconicScore);
    }
  }

  return bestScore;
}

function includesWholePhrase(haystack: string, phrase: string) {
  return new RegExp(`(^|\\s)${escapeRegExp(phrase)}($|\\s)`, "iu").test(haystack);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toRecipePhotoCuisineKey(cuisine: CuisineDish["cuisine"]) {
  if (cuisine === "middleEastern") return "middle-eastern";
  return cuisine;
}

function detectCuisine(query: string) {
  return CUISINE_PATTERNS.find((entry) => entry.pattern.test(query))?.key;
}

function detectMainIngredient(query: string) {
  return MAIN_INGREDIENT_PATTERNS.find((entry) => entry.pattern.test(query))?.key;
}

function detectBeanType(query: string) {
  return BEAN_TYPE_PATTERNS.find((entry) => entry.pattern.test(query))?.key;
}

function detectSauce(query: string) {
  return SAUCE_PATTERNS.find((entry) => entry.pattern.test(query))?.key;
}

function detectStarch(query: string) {
  return STARCH_PATTERNS.find((entry) => entry.pattern.test(query))?.key;
}

function detectCookingMethod(query: string) {
  return COOKING_METHOD_PATTERNS.find((entry) => entry.pattern.test(query))?.key;
}

function detectMealType(query: string) {
  return MEAL_TYPE_PATTERNS.find((entry) => entry.pattern.test(query))?.key;
}

function getCoreTokens(query: string, canonicalName?: string) {
  const source = canonicalName ? `${canonicalName} ${query}` : query;
  const tokens = source
    .split(/\s+/)
    .map((token) => token.replace(/[^\p{L}\p{N}-]/gu, ""))
    .filter((token) => token.length >= 3 && !CORE_TOKEN_STOP_WORDS.has(token));

  return Array.from(new Set(tokens)).slice(0, 6);
}

function detectRecipePhotoFamily(
  cleanQuery: string,
  details: {
    beanTypeKey?: string;
    cuisineKey?: string;
    mainIngredientKey?: string;
    mealTypeKey?: string;
    starchKey?: string;
  }
) {
  if (details.mealTypeKey === "shakshuka") return "shakshuka";
  if (/\bbesara\b/i.test(cleanQuery) || cleanQuery.includes(ARABIC.besara)) return "besara";
  if (/\bbalila\b/i.test(cleanQuery) || cleanQuery.includes(ARABIC.balila)) return "balila";
  if (/\bfasolia\b/i.test(cleanQuery) || cleanQuery.includes(ARABIC.bean)) return "fasolia";
  if (/\bloubia\b/i.test(cleanQuery) || cleanQuery.includes(ARABIC.loubia)) return "loubia-bzeit";
  if (details.mealTypeKey === "kofta") return "kafta";
  if (
    ((details.mainIngredientKey === "egg" || /\begg|eggs\b/iu.test(cleanQuery) || cleanQuery.includes(ARABIC.egg)) &&
      (details.mainIngredientKey === "yogurt" || /\byogurt|labneh\b/iu.test(cleanQuery) || cleanQuery.includes(ARABIC.yogurt)))
  ) {
    return "cilbir";
  }
  if (/\blabneh\b/iu.test(cleanQuery)) return "labneh-bowl";
  if (/\bgreek yogurt\b/iu.test(cleanQuery) || (details.mainIngredientKey === "yogurt" && /\bberries|walnuts|chia\b/iu.test(cleanQuery))) {
    return "yogurt-bowl";
  }
  if (details.mainIngredientKey === "egg" && details.mealTypeKey === "omelet") return "vegetable-omelet";
  if (details.mainIngredientKey === "egg" && (details.mealTypeKey === "scramble" || /\bscramble|scrambled\b/iu.test(cleanQuery))) {
    return "egg-scramble";
  }
  if (/\bshawarma\b/iu.test(cleanQuery) && details.mainIngredientKey === "chicken") return "chicken-shawarma-bowl";
  if (details.mainIngredientKey === "chicken" && details.mealTypeKey === "tagine") return "chicken-tagine";
  if (details.mainIngredientKey === "chicken" && details.mealTypeKey === "grill") return "grilled-chicken";
  if (details.mainIngredientKey === "fish" && details.mealTypeKey === "salad") return "salmon-salad";
  if (details.mainIngredientKey === "fish") return "baked-fish";
  if (details.mealTypeKey === "pilaf" && details.mainIngredientKey === "chicken") return "chicken-rice-pilaf";
  if (details.mealTypeKey === "pilaf" && (details.mainIngredientKey === "fish" || details.mainIngredientKey === "tuna")) {
    return "fish-rice-pilaf";
  }
  if (details.mealTypeKey === "pilaf") return "rice-pilaf";
  if (
    details.mainIngredientKey === "lentil" &&
    details.mealTypeKey === "pasta" &&
    (details.cuisineKey === "egyptian" || /\b(macarona bel ads|pasta and lentils)\b/iu.test(cleanQuery))
  ) {
    return "koshary";
  }
  if (
    details.mainIngredientKey === "lentil" &&
    (details.starchKey === "rice" || details.mealTypeKey === "pilaf" || /\b(rice with lentils|lentils and rice|roz bel ads)\b/iu.test(cleanQuery))
  ) {
    return "mujadara";
  }
  if (details.mainIngredientKey === "tuna" && details.mealTypeKey === "salad") return "tuna-rice-salad";
  if (details.mainIngredientKey === "chicken" && details.mealTypeKey === "salad") {
    return "chicken-rice-salad";
  }
  if (details.mainIngredientKey === "liver" && details.cuisineKey === "egyptian") return "alexandrian-liver";

  if (details.beanTypeKey === "white-bean" && details.mealTypeKey === "salad") return "white-bean-salad";
  if (details.beanTypeKey === "white-bean" && ["soup", "stew", "skillet", "stir-fry"].includes(details.mealTypeKey ?? "")) {
    return "white-bean-stew";
  }

  if (details.mainIngredientKey === "bean" && details.mealTypeKey === "salad") return "bean-salad";
  if (details.mainIngredientKey === "bean" && details.mealTypeKey === "soup") return "bean-soup";
  if (details.mainIngredientKey === "bean" && ["stew", "skillet", "stir-fry"].includes(details.mealTypeKey ?? "")) {
    return "bean-stew";
  }
  if (details.mainIngredientKey === "bean" && details.mealTypeKey === "chili") return "bean-chili";
  if (details.mainIngredientKey === "chickpea" && details.mealTypeKey === "salad") return "chickpea-salad";

  return undefined;
}

function buildSearchQueries(
  cleanQuery: string,
  details: {
    beanTypeKey?: string;
    canonicalName?: string;
    cookingMethodKey?: string;
    cuisineKey?: string;
    familyKey?: string;
    mainIngredientKey?: string;
    mealTypeKey?: string;
    sauceKey?: string;
    starchKey?: string;
  }
) {
  const familySearchQueries = getFamilySearchQueries(details.familyKey, details.cuisineKey);
  const detailedVariant = [details.cookingMethodKey, details.mainIngredientKey, details.sauceKey, details.starchKey ?? details.mealTypeKey]
    .filter(Boolean)
    .join(" ");
  const proteinVariant = [details.mainIngredientKey, details.sauceKey, details.starchKey ?? details.mealTypeKey]
    .filter(Boolean)
    .join(" ");
  const cuisineVariant = [details.cuisineKey, details.mainIngredientKey, details.sauceKey, details.starchKey ?? details.mealTypeKey]
    .filter(Boolean)
    .join(" ");

  const candidates = [
    details.canonicalName ? [details.canonicalName, details.cuisineKey].filter(Boolean).join(" ") : "",
    details.canonicalName || "",
    ...familySearchQueries,
    cleanQuery,
    cleanQuery.replace(/\s+with\s+.+$/i, ""),
    detailedVariant,
    proteinVariant,
    cuisineVariant,
    [details.cuisineKey, details.beanTypeKey ?? details.mainIngredientKey, details.familyKey ?? details.canonicalName]
      .filter(Boolean)
      .join(" "),
    cleanQuery
      .split(/\s+/)
      .filter((token) => token.length >= 3)
      .slice(0, 6)
      .join(" ")
  ]
    .map((candidate) => candidate.trim().replace(/\s+/g, " "))
    .filter((candidate) => candidate.length >= 3);

  return Array.from(new Set(candidates));
}

function getFamilySearchQueries(familyKey?: string, cuisineKey?: string) {
  const withCuisine = (value: string) => [value, cuisineKey].filter(Boolean).join(" ").trim();

  switch (familyKey) {
    case "white-bean-salad":
      return [withCuisine("white bean salad"), withCuisine("bean salad")];
    case "white-bean-stew":
      return [withCuisine("white bean stew"), withCuisine("bean stew"), withCuisine("fasolia")];
    case "bean-salad":
      return [withCuisine("bean salad")];
    case "bean-soup":
      return [withCuisine("bean soup")];
    case "bean-stew":
      return [withCuisine("bean stew"), withCuisine("bean tomato stew")];
    case "bean-chili":
      return [withCuisine("bean chili"), withCuisine("chili")];
    case "chickpea-salad":
      return [withCuisine("chickpea salad")];
    case "yogurt-bowl":
      return [withCuisine("greek yogurt berries"), withCuisine("yogurt bowl"), withCuisine("breakfast yogurt bowl")];
    case "labneh-bowl":
      return [withCuisine("labneh"), withCuisine("labneh cucumber zaatar"), withCuisine("middle eastern yogurt dip")];
    case "cilbir":
      return [withCuisine("cilbir"), withCuisine("turkish poached eggs yogurt"), withCuisine("eggs with garlic yogurt")];
    case "vegetable-omelet":
      return [withCuisine("vegetable omelet"), withCuisine("spinach omelet"), withCuisine("bell pepper omelet")];
    case "egg-scramble":
      return [withCuisine("scrambled eggs spinach"), withCuisine("egg scramble"), withCuisine("breakfast eggs")];
    case "chicken-shawarma-bowl":
      return [
        withCuisine("chicken shawarma"),
        withCuisine("chicken shawarma bowl"),
        withCuisine("shawarma plate"),
        withCuisine("shawarma wrap")
      ];
    case "chicken-tagine":
      return [withCuisine("chicken tagine"), withCuisine("moroccan chicken"), withCuisine("chicken vegetable tagine")];
    case "grilled-chicken":
      return [withCuisine("grilled chicken plate"), withCuisine("grilled chicken breast"), withCuisine("roasted chicken vegetables")];
    case "salmon-salad":
      return [withCuisine("salmon salad"), withCuisine("fish salad"), withCuisine("grilled salmon salad")];
    case "baked-fish":
      return [withCuisine("baked fish plate"), withCuisine("white fish vegetables"), withCuisine("roasted fish")];
    case "rice-pilaf":
      return [withCuisine("rice pilaf"), withCuisine("pilaf"), withCuisine("plov")];
    case "chicken-rice-pilaf":
      return [withCuisine("chicken rice pilaf"), withCuisine("chicken and rice"), withCuisine("pilaf")];
    case "fish-rice-pilaf":
      return [withCuisine("fish rice"), withCuisine("fish and rice"), withCuisine("pilaf")];
    case "tuna-rice-salad":
      return [withCuisine("tuna salad"), withCuisine("rice salad"), withCuisine("tuna rice")];
    case "chicken-rice-salad":
      return [withCuisine("chicken rice salad"), withCuisine("salad with rice"), withCuisine("chicken salad")];
    case "shakshuka":
      return [withCuisine("shakshuka")];
    case "mujadara":
      return [withCuisine("mujadara"), withCuisine("lentils and rice"), withCuisine("roz bel ads")];
    case "koshary":
      return [withCuisine("koshary"), withCuisine("egyptian pasta lentils"), withCuisine("macarona bel ads")];
    case "ground-beef-penne":
      return [withCuisine("ground beef penne"), withCuisine("beef tomato penne"), withCuisine("one pan beef penne")];
    case "ground-beef-pasta":
      return [withCuisine("ground beef pasta"), withCuisine("beef macaroni skillet"), withCuisine("hamburger pasta")];
    case "hamburger-stew":
      return [withCuisine("hamburger stew"), withCuisine("ground beef vegetable stew"), withCuisine("hamburger soup potatoes carrots")];
    case "rice-kofta":
      return [withCuisine("egyptian rice kofta"), withCuisine("koftet roz"), withCuisine("rice kofta tomato sauce")];
    case "dawood-basha":
      return [withCuisine("dawood basha"), withCuisine("egyptian meatballs tomato sauce"), withCuisine("kofta dawood basha")];
    case "taagen-kofta":
      return [withCuisine("egyptian kofta tagine"), withCuisine("taagen kofta potatoes"), withCuisine("kofta potato tray")];
    case "macarona-bechamel":
      return [withCuisine("macarona bechamel egyptian"), withCuisine("egyptian bechamel pasta"), withCuisine("baked macarona bechamel")];
    case "besara":
      return [withCuisine("besara"), withCuisine("fava bean soup")];
    case "balila":
      return [withCuisine("balila"), withCuisine("chickpea bowl")];
    case "fasolia":
      return [withCuisine("fasolia"), withCuisine("white bean stew")];
    case "loubia-bzeit":
      return [withCuisine("loubia bzeit"), withCuisine("green bean stew")];
    case "kafta":
      return [withCuisine("kafta kebab")];
    case "kiymali-pide":
      return [withCuisine("kiymali pide"), withCuisine("turkish beef pide"), withCuisine("turkish minced meat pide")];
    case "lahmacun":
      return [withCuisine("lahmacun"), withCuisine("turkish lahmacun"), withCuisine("thin meat flatbread")];
    case "lahm-ajin":
      return [withCuisine("lahm bi ajin"), withCuisine("lahm ajin"), withCuisine("middle eastern meat flatbread")];
    case "adana-kebab":
      return [withCuisine("adana kebab"), withCuisine("turkish minced meat kebab"), withCuisine("spicy ground lamb kebab")];
    case "karniyarik":
      return [withCuisine("karniyarik"), withCuisine("turkish stuffed eggplant"), withCuisine("eggplant ground beef")];
    case "turkish-spiral-borek":
      return [withCuisine("turkish spiral borek"), withCuisine("ground beef borek"), withCuisine("kol boregi")];
    case "turkish-musakka":
      return [withCuisine("turkish musakka"), withCuisine("turkish eggplant beef casserole"), withCuisine("eggplant beef moussaka")];
    case "alexandrian-liver":
      return [withCuisine("alexandrian liver"), withCuisine("kebda eskandarani"), withCuisine("egyptian liver sandwiches")];
    case "kebda-chermoula":
      return [withCuisine("kebda chermoula"), withCuisine("north african liver chermoula"), withCuisine("algerian liver")];
    case "moroccan-kebda":
      return [withCuisine("moroccan kebda"), withCuisine("moroccan liver strips"), withCuisine("liver with coriander lemon")];
    case "moroccan-liver-stew":
      return [withCuisine("moroccan liver stew"), withCuisine("kebda mchermla"), withCuisine("kebda tomato stew")];
    case "kebda-bel-rada":
      return [withCuisine("kebda bel rada"), withCuisine("fried bran liver"), withCuisine("bran coated liver slices")];
    case "egyptian-liver-sandwiches":
      return [withCuisine("egyptian liver sandwiches"), withCuisine("kebda sandwich"), withCuisine("chopped liver sandwich")];
    default:
      return [];
  }
}

export function isStrictRecipePhotoIdentity(identity: Pick<RecipePhotoIdentity, "canonicalDishKey" | "cleanQuery" | "familyKey" | "mainIngredientKey">) {
  return Boolean(
    identity.canonicalDishKey ||
      identity.familyKey === "alexandrian-liver" ||
      identity.mainIngredientKey === "liver" ||
      /\b(liver|kebda|kibda|ciger|cigeri)\b/i.test(identity.cleanQuery) ||
      new RegExp(`${ARABIC.liver}|${ARABIC.liverAlt}`, "iu").test(identity.cleanQuery)
  );
}

export function matchesStrictRecipePhotoIdentity(
  identity: Pick<RecipePhotoIdentity, "canonicalDishKey" | "cleanQuery" | "familyKey" | "mainIngredientKey">,
  haystack: string,
  normalizedRequestQuery = identity.cleanQuery
) {
  if (!isStrictRecipePhotoIdentity(identity)) return true;

  const strictTokens = getStrictRecipePhotoIdentityTokens(identity);
  if (!strictTokens.length) return true;
  if (strictTokens.some((token) => includesStrictToken(haystack, token))) return true;

  if (identity.canonicalDishKey) return false;
  const requestTokens = getStrictTextTokens(normalizedRequestQuery);
  return requestTokens.length > 0 && requestTokens.some((token) => includesStrictToken(haystack, token));
}

export function getStrictRecipePhotoIdentityTokens(identity: Pick<RecipePhotoIdentity, "canonicalDishKey" | "cleanQuery" | "familyKey" | "mainIngredientKey">) {
  const dish = identity.canonicalDishKey ? getDishById(identity.canonicalDishKey) : null;
  const knownDish = identity.canonicalDishKey ? KNOWN_DISHES.find((entry) => entry.key === identity.canonicalDishKey) : null;
  const aliases = [
    identity.canonicalDishKey?.replace(/-/g, " "),
    identity.familyKey?.replace(/-/g, " "),
    knownDish?.canonicalName,
    ...(dish?.names.english ?? []),
    ...(dish?.names.native ?? []),
    ...(dish?.names.other ?? [])
  ];

  if (identity.mainIngredientKey === "liver" || /\b(liver|kebda|kibda|ciger|cigeri)\b/i.test(identity.cleanQuery)) {
    aliases.push("liver", "kebda", "kibda", "ciger", "cigeri", ARABIC.liver, ARABIC.liverAlt);
  }

  return Array.from(
    new Set(
      aliases
        .filter((value): value is string => Boolean(value?.trim()))
        .flatMap((value) => getStrictTextTokens(value))
        .filter((value) => value.length >= 4)
        .filter((value) => !STRICT_GENERIC_TOKENS.has(value))
    )
  ).slice(0, 16);
}

const STRICT_GENERIC_TOKENS = new Set([
  "asian",
  "bread",
  "dish",
  "egyptian",
  "food",
  "italian",
  "meal",
  "middle",
  "plate",
  "rice",
  "soup",
  "turkish"
]);

function getStrictTextTokens(value: string) {
  const normalized = normalizeRecipePhotoQuery(value);
  const tokens = normalized.split(/\s+/).filter((token) => token.length >= 4);
  return [normalized, ...tokens].filter(Boolean);
}

function includesStrictToken(haystack: string, token: string) {
  return new RegExp(`(^|\\s)${escapeRegExp(token)}($|\\s)`, "iu").test(haystack);
}

function buildRecipePhotoSignature({
  canonicalDishKey,
  cookingMethodKey,
  coreTokens,
  cuisineKey,
  familyKey,
  mainIngredientKey,
  mealTypeKey,
  sauceKey,
  starchKey
}: Pick<
  RecipePhotoIdentity,
  | "canonicalDishKey"
  | "cookingMethodKey"
  | "coreTokens"
  | "cuisineKey"
  | "familyKey"
  | "mainIngredientKey"
  | "mealTypeKey"
  | "sauceKey"
  | "starchKey"
>) {
  if (canonicalDishKey) {
    return `${canonicalDishKey}|${cuisineKey ?? "general"}`;
  }

  if (familyKey) {
    return `${familyKey}|${cuisineKey ?? "general"}|${mainIngredientKey ?? "general"}|${sauceKey ?? starchKey ?? "general"}`;
  }

  const coreSlug = slugify(coreTokens.slice(0, 5).join("-")) || "meal";
  return `${coreSlug}|${cuisineKey ?? "general"}|${mainIngredientKey ?? "general"}|${mealTypeKey ?? starchKey ?? "general"}|${sauceKey ?? cookingMethodKey ?? "general"}`;
}

function buildAlternateRecipePhotoSignatures({
  beanTypeKey,
  canonicalDishKey,
  cookingMethodKey,
  cuisineKey,
  familyKey,
  mainIngredientKey,
  mealTypeKey,
  sauceKey,
  starchKey
}: Pick<
  RecipePhotoIdentity,
  | "beanTypeKey"
  | "canonicalDishKey"
  | "cookingMethodKey"
  | "cuisineKey"
  | "familyKey"
  | "mainIngredientKey"
  | "mealTypeKey"
  | "sauceKey"
  | "starchKey"
>) {
  if (canonicalDishKey) {
    return [];
  }

  const candidates = [
    familyKey ? `${familyKey}|${cuisineKey ?? "general"}` : "",
    [beanTypeKey ?? mainIngredientKey, mealTypeKey, cuisineKey].filter(Boolean).join("|"),
    [mainIngredientKey, mealTypeKey, cuisineKey].filter(Boolean).join("|"),
    [mainIngredientKey, sauceKey, starchKey].filter(Boolean).join("|"),
    [mainIngredientKey, cookingMethodKey, starchKey].filter(Boolean).join("|"),
    [familyKey, mealTypeKey].filter(Boolean).join("|")
  ]
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.length >= 3);

  return Array.from(new Set(candidates));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}
