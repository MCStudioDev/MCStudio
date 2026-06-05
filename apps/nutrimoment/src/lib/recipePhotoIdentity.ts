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
  pasta: "\u0645\u0639?\u0643\u0631\u0648\u0646(?:\u0629|\u0647)?",
  rice: "\u0631\u0632",
  shakshuka: "\u0634\u0643\u0634\u0648\u0643\u0629",
  soup: "\u0634\u0648\u0631\u0628(?:\u0629|\u0647)|\u062d\u0633\u0627\u0621|\u0645\u0631\u0642(?:\u0629|\u0647)?",
  stew: "\u064a\u062e\u0646(?:\u0629|\u0647|\u064a)",
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
    aliases: [
      /\b(lahmacun and adana kebab|adana kebab with lahmacun|lahmacun adana kebab|adana lahmacun plate)\b/i,
      /\b(turkish lahmacun and adana combo|adana kebab lahmacun combo)\b/i
    ],
    canonicalName: "Adana kebab with lahmacun",
    cuisineKey: "turkish",
    key: "adana-lahmacun-plate"
  },
  {
    aliases: [
      /\b(adana durum|adana durum wrap|adana kebab wrap|adana lavash wrap|adana kebab in lavash)\b/i,
      /\b(adana wrap with sumac onion|adana kebab sandwich|beyti kebab|beyti kebap|ground meat wrapped in lavash)\b/i,
      /\u0623\u0636\u0646\u0629.*(?:\u0644\u0627\u0641\u0627\u0634|\u0631\u0627\u0628|\u0633\u0627\u0646\u062f\u0648\u064a\u062a\u0634)|\u0627\u062f\u0646\u0629.*(?:\u0644\u0627\u0641\u0627\u0634|\u0631\u0627\u0628|\u0633\u0627\u0646\u062f\u0648\u064a\u062a\u0634)/iu
    ],
    canonicalName: "Adana durum",
    cuisineKey: "turkish",
    key: "adana-durum"
  },
  {
    aliases: [/\b(cag kebap|cag kebab|cağ kebap|cağ kebab|horizontal lamb kebab|erzurum cag)\b/i],
    canonicalName: "cag kebap",
    cuisineKey: "turkish",
    key: "cag-kebap"
  },
  {
    aliases: [/\b(doner kebab|doner kebap|döner kebab|döner kebap|turkish doner|beef doner|lamb doner)\b/i],
    canonicalName: "doner kebab",
    cuisineKey: "turkish",
    key: "doner-kebab"
  },
  {
    aliases: [/\b(iskender kebab|iskender kebap|iskandar kebab|iskandar kebap|turkish iskender)\b/i],
    canonicalName: "Iskender kebab",
    cuisineKey: "turkish",
    key: "iskender-kebab"
  },
  {
    aliases: [/\b(kiymali tepsi boregi|tepsi boregi|turkish phyllo pastry with beef|ground beef phyllo pie|ground beef borek tray)\b/i],
    canonicalName: "kiymali tepsi boregi",
    cuisineKey: "turkish",
    key: "kiymali-tepsi-boregi"
  },
  {
    aliases: [/\b(turkish ground beef stew|ground beef stew turkish style|kiymali sebze yemegi|ground beef vegetable stew turkish)\b/i],
    canonicalName: "Turkish ground beef stew",
    cuisineKey: "turkish",
    key: "turkish-ground-beef-stew"
  },
  {
    aliases: [/\b(turkey picadillo|picadillo with ground turkey|ground turkey picadillo)\b/i],
    canonicalName: "turkey picadillo",
    cuisineKey: "latin",
    key: "turkey-picadillo"
  },
  {
    aliases: [
      /\b(turkish beef kofta|turkish kofta|turkish kofte|kofte with yogurt sauce|turkish meatballs with yogurt sauce)\b/i,
      /\b(turkish-style meatballs|turkish meatballs)\b/i
    ],
    canonicalName: "Turkish kofta",
    cuisineKey: "turkish",
    key: "turkish-kofta"
  },
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
    aliases: [
      /\b(moroccan beef (?:kofta|kafta)|moroccan (?:kofta|kafta|kefta)|kefta kebab|kefta brochettes)\b/i
    ],
    canonicalName: "Moroccan beef kofta",
    cuisineKey: "moroccan",
    key: "moroccan-beef-kofta"
  },
  {
    aliases: [/\b(lebanese beef (?:kofta|kafta)|lebanese (?:kofta|kafta)|kafta meshwi|kafta mishwiyyeh)\b/i],
    canonicalName: "Lebanese beef kofta",
    cuisineKey: "middle-eastern",
    key: "lebanese-beef-kofta"
  },
  {
    aliases: [
      /\b(beef (?:kofta|kafta) with saffron rice|(?:kofta|kafta) with saffron rice|(?:kofta|kafta) saffron rice|beef (?:kofta|kafta) saffron rice)\b/i
    ],
    canonicalName: "beef kofta with saffron rice",
    cuisineKey: "middle-eastern",
    key: "beef-kofta-saffron-rice"
  },
  {
    aliases: [
      /\b(beef (?:kofta|kafta) in tomato sauce|(?:kofta|kafta) in tomato sauce|(?:kofta|kafta) in rich tomato sauce|tomato sauce (?:kofta|kafta))\b/i
    ],
    canonicalName: "beef kofta in tomato sauce",
    cuisineKey: "middle-eastern",
    key: "beef-kofta-tomato-sauce"
  },
  {
    aliases: [/\b(pakistani beef (?:kofta|kafta) curry|beef (?:kofta|kafta) curry|(?:kofta|kafta) curry|pakistani (?:kofta|kafta) curry)\b/i],
    canonicalName: "Pakistani beef kofta curry",
    cuisineKey: "indian",
    key: "pakistani-beef-kofta-curry"
  },
  {
    aliases: [/\b(kafta|kofta|kofte|kefta|kufta)\b/i, /\u0643\u0641\u062a(?:\u0629|\u0647)/iu],
    canonicalName: "kafta kebab",
    cuisineKey: "middle-eastern",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Oriental_food_including_beef_kabab%2C_shish_tawoook%2C_and_kafta_kabab_%28Orlando%29_May_2023.jpg/960px-Oriental_food_including_beef_kabab%2C_shish_tawoook%2C_and_kafta_kabab_%28Orlando%29_May_2023.jpg",
    key: "kafta"
  },
  {
    aliases: [
      /\b(?:egyptian|baladi|alexandrian|iskandarani|eskandarani)?\s*hawawshi\b/i,
      /\bbaladi\s+(?:(?:meat\s+)?stuffed|meat)\s+(?:bread|pita|flatbread)\b/i,
      /\b(?:egyptian|alexandrian)\s+(?:(?:meat\s+)?stuffed|meat)\s+(?:baladi\s+)?(?:bread|pita|flatbread)\b/i,
      /\barayes\b/i,
      /\begyptian meat stuffed pita\b/i,
      /\begyptian stuffed pita\b/i,
      /\begyptian meat stuffed bread\b/i,
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
    aliases: [
      /\b(chicken shawarma|shawarma chicken|chicken shawarma wrap|chicken shawarma sandwich|chicken shawarma bowl|chicken shawarma plate|sheet pan chicken shawarma|oven baked chicken shawarma|mini chicken shawarma|street[- ]?style chicken shawarma)\b/i,
      /\u0634\u0627\u0648\u0631\u0645\u0627\s+(?:\u062f\u062c\u0627\u062c|\u0641\u0631\u0627\u062e)|(?:\u062f\u062c\u0627\u062c|\u0641\u0631\u0627\u062e)\s+\u0634\u0627\u0648\u0631\u0645\u0627/iu
    ],
    canonicalName: "chicken shawarma",
    cuisineKey: "middle-eastern",
    key: "chicken-shawarma"
  },
  {
    aliases: [
      /\b(beef shawarma|shawarma beef|beef shawarma wrap|beef shawarma sandwich|beef shawarma bowl|beef shawarma plate|smoked beef shawarma|easy beef shawarma)\b/i,
      /\u0634\u0627\u0648\u0631\u0645\u0627\s+(?:\u0644\u062d\u0645|\u0644\u062d\u0645\u0629)|(?:\u0644\u062d\u0645|\u0644\u062d\u0645\u0629)\s+\u0634\u0627\u0648\u0631\u0645\u0627/iu
    ],
    canonicalName: "beef shawarma",
    cuisineKey: "middle-eastern",
    key: "beef-shawarma"
  },
  {
    aliases: [
      /\b(lamb shawarma|shawarma lamb|lamb shawarma wrap|lamb shawarma sandwich|lamb shawarma bowl|lamb shawarma plate|slow cooked lamb shawarma)\b/i,
      /\u0634\u0627\u0648\u0631\u0645\u0627\s+(?:\u0644\u062d\u0645\s+)?(?:\u0636\u0627\u0646\u064a|\u0636\u0623\u0646\u064a|\u062e\u0631\u0648\u0641)|(?:\u0636\u0627\u0646\u064a|\u0636\u0623\u0646\u064a|\u062e\u0631\u0648\u0641)\s+\u0634\u0627\u0648\u0631\u0645\u0627/iu
    ],
    canonicalName: "lamb shawarma",
    cuisineKey: "middle-eastern",
    key: "lamb-shawarma"
  },
  {
    aliases: [
      /\b(beef and lamb shawarma|beef lamb shawarma|mixed meat shawarma|mixed shawarma|lamb and beef shawarma)\b/i,
      /\u0634\u0627\u0648\u0631\u0645\u0627\s+(?:\u0644\u062d\u0645\s+)?(?:\u0645\u0634\u0643\u0644|\u0645\u062e\u062a\u0644\u0637)/iu
    ],
    canonicalName: "beef and lamb shawarma",
    cuisineKey: "middle-eastern",
    key: "beef-lamb-shawarma"
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
    aliases: [
      /\b(turkish sunny side eggs|turkish fried eggs|turkish eggs sunny side|turkish egg breakfast)\b/i,
      /\b(yumurta sahanda|sahanda yumurta|turkish egg)\b/i,
      /\u0628\u064a\u0636.*(?:\u0639\u064a\u0648\u0646|\u062a\u0631\u0643\u064a)|(?:\u0628\u064a\u0636\s+\u0639\u064a\u0648\u0646)/iu
    ],
    canonicalName: "Turkish sunny-side eggs",
    cuisineKey: "turkish",
    key: "turkish-sunny-side-eggs"
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
    aliases: [/\b(roast chicken|roasted chicken|my go[- ]to chicken|whole roasted chicken)\b/i],
    canonicalName: "roast chicken",
    cuisineKey: "american",
    key: "roast-chicken"
  },
  {
    aliases: [/\bbutter chicken\b/i],
    canonicalName: "butter chicken",
    cuisineKey: "indian",
    key: "butter-chicken"
  },
  {
    aliases: [/\b(garlic butter chicken|garlic-butter chicken|lemon garlic butter chicken)\b/i],
    canonicalName: "garlic butter chicken",
    cuisineKey: "american",
    key: "garlic-butter-chicken"
  },
  {
    aliases: [/\bkung pao chicken\b/i],
    canonicalName: "kung pao chicken",
    cuisineKey: "asian",
    key: "kung-pao-chicken"
  },
  {
    aliases: [/\b(southern buttermilk fried chicken|buttermilk fried chicken|southern fried chicken)\b/i],
    canonicalName: "southern buttermilk fried chicken",
    cuisineKey: "american",
    key: "southern-fried-chicken"
  },
  {
    aliases: [/\b(cilantro lime chicken|coriander lime chicken)\b/i],
    canonicalName: "cilantro lime chicken",
    cuisineKey: "mexican",
    key: "cilantro-lime-chicken"
  },
  {
    aliases: [/\b(creamy spinach chicken|chicken florentine|spinach chicken)\b/i],
    canonicalName: "creamy spinach chicken",
    cuisineKey: "american",
    key: "creamy-spinach-chicken"
  },
  {
    aliases: [/\bsumac chicken\b/i],
    canonicalName: "sumac chicken",
    cuisineKey: "middle-eastern",
    key: "sumac-chicken"
  },
  {
    aliases: [/\b(desi gravy chicken|chicken gravy|indian chicken gravy)\b/i],
    canonicalName: "desi gravy chicken",
    cuisineKey: "indian",
    key: "desi-gravy-chicken"
  },
  {
    aliases: [/\b(korean fried chicken|korean crispy chicken)\b/i],
    canonicalName: "Korean fried chicken",
    cuisineKey: "asian",
    key: "korean-fried-chicken"
  },
  {
    aliases: [/\b(soy garlic chicken|garlic soy chicken)\b/i],
    canonicalName: "soy garlic chicken",
    cuisineKey: "asian",
    key: "soy-garlic-chicken"
  },
  {
    aliases: [/\b(chicken and rice skillet|chicken rice skillet|chicken and rice tray|chicken rice tray)\b/i],
    canonicalName: "chicken and rice skillet",
    cuisineKey: "american",
    key: "chicken-rice-skillet"
  },
  {
    aliases: [/\b(crispy beef stir[- ]?fry (?:recipe )?with bok choy|crispy beef bok choy stir[- ]?fry|beef bok choy noodles?)\b/i],
    canonicalName: "crispy beef stir-fry with bok choy",
    cuisineKey: "asian",
    key: "crispy-beef-bok-choy-stir-fry"
  },
  {
    aliases: [/\b(easy beef pot roast|beef pot roast|classic pot roast)\b/i],
    canonicalName: "easy beef pot roast",
    cuisineKey: "american",
    key: "easy-beef-pot-roast"
  },
  {
    aliases: [/\b(garlic butter steak and shrimp|steak and shrimp|surf and turf steak shrimp)\b/i],
    canonicalName: "garlic butter steak and shrimp",
    cuisineKey: "american",
    key: "garlic-butter-steak-shrimp"
  },
  {
    aliases: [/\b(italian meatloaf (?:recipe )?with marinara|italian meatloaf|meatloaf marinara)\b/i],
    canonicalName: "Italian meatloaf with marinara",
    cuisineKey: "italian",
    key: "italian-meatloaf-marinara"
  },
  {
    aliases: [/\b(steak with creamy garlic sauce|creamy garlic steak|steak creamy garlic sauce)\b/i],
    canonicalName: "steak with creamy garlic sauce",
    cuisineKey: "american",
    key: "steak-creamy-garlic-sauce"
  },
  {
    aliases: [/\b(classic steak dinner|steak dinner|one[- ]?pan steak dinner)\b/i],
    canonicalName: "classic steak dinner",
    cuisineKey: "american",
    key: "classic-steak-dinner"
  },
  {
    aliases: [/\b(dry[- ]?aged butter steak|dry[- ]?aged steak|butter steak)\b/i],
    canonicalName: "dry-aged butter steak",
    cuisineKey: "american",
    key: "dry-aged-butter-steak"
  },
  {
    aliases: [/\b(tuscan[- ]?style veal chops?|tuscan veal chops?|veal chops? alla toscana)\b/i],
    canonicalName: "Tuscan-style veal chops",
    cuisineKey: "italian",
    key: "tuscan-style-veal-chops"
  },
  {
    aliases: [/\b(sticky barbecued beef ribs|sticky bbq beef ribs|barbecued beef ribs)\b/i],
    canonicalName: "sticky barbecued beef ribs",
    cuisineKey: "american",
    key: "sticky-bbq-beef-ribs"
  },
  {
    aliases: [/\b(slow[- ]?grilled rack of lamb with mustard and herbs|rack of lamb with mustard and herbs|grilled rack of lamb)\b/i],
    canonicalName: "slow-grilled rack of lamb with mustard and herbs",
    cuisineKey: "mediterranean",
    key: "slow-grilled-rack-lamb-mustard-herbs"
  },
  {
    aliases: [/\b(coffee[- ]?rubbed strip steaks? with chimichurri sauce|coffee[- ]?rubbed strip steaks?|strip steak with chimichurri)\b/i],
    canonicalName: "coffee-rubbed strip steak with chimichurri",
    cuisineKey: "american",
    key: "coffee-rubbed-strip-steak-chimichurri"
  },
  {
    aliases: [/\b(balsamic and rosemary[- ]?marinated florentine steak|balsamic rosemary florentine steak|florentine steak)\b/i],
    canonicalName: "balsamic rosemary Florentine steak",
    cuisineKey: "italian",
    key: "florentine-steak-balsamic-rosemary"
  },
  {
    aliases: [/\b(ribs with hot[- ]?pepper[- ]?jelly glaze|hot pepper jelly ribs)\b/i],
    canonicalName: "ribs with hot-pepper-jelly glaze",
    cuisineKey: "american",
    key: "ribs-hot-pepper-jelly-glaze"
  },
  {
    aliases: [/\b(grilled rib[- ]?eye steaks? with roasted rosemary potatoes|rib[- ]?eye steak with rosemary potatoes|grilled ribeye rosemary potatoes)\b/i],
    canonicalName: "grilled rib-eye steak with rosemary potatoes",
    cuisineKey: "american",
    key: "grilled-ribeye-rosemary-potatoes"
  },
  {
    aliases: [/\b(sausage mixed grill|mixed sausage grill|grilled sausage platter)\b/i],
    canonicalName: "sausage mixed grill",
    cuisineKey: "american",
    key: "sausage-mixed-grill"
  },
  {
    aliases: [/\b(churrasco with chimichurri|churrasco steak|steak chimichurri)\b/i],
    canonicalName: "churrasco with chimichurri",
    cuisineKey: "latin",
    key: "churrasco-chimichurri"
  },
  {
    aliases: [/\b(carne asada with black beans|carne asada plate|carne asada)\b/i],
    canonicalName: "carne asada with black beans",
    cuisineKey: "mexican",
    key: "carne-asada-black-beans"
  },
  {
    aliases: [/\b(kalbi ribs and grilled corn with kalbi butter|kalbi ribs with grilled corn|kalbi ribs)\b/i],
    canonicalName: "kalbi ribs with grilled corn",
    cuisineKey: "korean",
    key: "kalbi-ribs-grilled-corn"
  },
  {
    aliases: [/\b(sofrito bolognese)\b/i],
    canonicalName: "sofrito bolognese",
    cuisineKey: "italian",
    key: "sofrito-bolognese"
  },
  {
    aliases: [/\b(smothered italian sausage|italian sausage with peppers|italian sausage peppers)\b/i],
    canonicalName: "smothered Italian sausage",
    cuisineKey: "italian",
    key: "smothered-italian-sausage"
  },
  {
    aliases: [/\b(frijoles peruanos|peruvian refried beans|mayocoba refried beans)\b/i],
    canonicalName: "frijoles peruanos",
    cuisineKey: "latin",
    key: "frijoles-peruanos"
  },
  {
    aliases: [/\b(lamb chops with agrodolce glaze walnuts and feta|lamb chops agrodolce|agrodolce lamb chops)\b/i],
    canonicalName: "lamb chops with agrodolce glaze",
    cuisineKey: "italian",
    key: "lamb-chops-agrodolce"
  },
  {
    aliases: [/\b(sheet[- ]?pan sausage with corn peach and cucumber salad|sheet pan sausage corn peach salad)\b/i],
    canonicalName: "sheet-pan sausage with corn peach cucumber salad",
    cuisineKey: "american",
    key: "sheet-pan-sausage-corn-peach-cucumber"
  },
  {
    aliases: [/\b(beef stroganoff ramen|stroganoff ramen)\b/i],
    canonicalName: "beef stroganoff ramen",
    cuisineKey: "asian",
    key: "beef-stroganoff-ramen"
  },
  {
    aliases: [/\b(polish lazanki|lazanki|cabbage pasta with mushrooms and kielbasa)\b/i],
    canonicalName: "Polish lazanki",
    cuisineKey: "eastern-european",
    key: "polish-lazanki"
  },
  {
    aliases: [/\b(mongolian beef|mongolian steak|mongolian beef strips)\b/i],
    canonicalName: "Mongolian beef",
    cuisineKey: "asian",
    key: "mongolian-beef"
  },
  {
    aliases: [/\b(chinese beef and onion|beef and onion stir[- ]?fry|beef onion stir[- ]?fry|beef with onions)\b/i],
    canonicalName: "Chinese beef and onion stir-fry",
    cuisineKey: "chinese",
    key: "chinese-beef-onion"
  },
  {
    aliases: [/\b(beef bourguignon|boeuf bourguignon|beef burgundy)\b/i],
    canonicalName: "beef bourguignon",
    cuisineKey: "french",
    key: "beef-bourguignon"
  },
  {
    aliases: [/\b(classic beef stew|beef stew|stovetop beef stew|beef potato stew)\b/i],
    canonicalName: "classic beef stew",
    cuisineKey: "american",
    key: "classic-beef-stew"
  },
  {
    aliases: [/\b(beef and broccoli|beef broccoli stir[- ]?fry|broccoli beef)\b/i],
    canonicalName: "beef and broccoli",
    cuisineKey: "chinese",
    key: "beef-and-broccoli"
  },
  {
    aliases: [/\b(roast beef|beef tenderloin roast|roasted beef tenderloin|corned beef roast)\b/i],
    canonicalName: "roast beef",
    cuisineKey: "american",
    key: "roast-beef"
  },
  {
    aliases: [/\b(black pepper beef|beef black pepper stir[- ]?fry|pepper beef)\b/i],
    canonicalName: "black pepper beef",
    cuisineKey: "asian",
    key: "black-pepper-beef"
  },
  {
    aliases: [/\b(garlic butter steak bites|garlic beef steak bites|steak bites|garlic butter beef bites)\b/i],
    canonicalName: "garlic butter steak bites",
    cuisineKey: "american",
    key: "garlic-butter-steak-bites"
  },
  {
    aliases: [/\b(french onion braised beef|french onion beef|french onion pot roast|braised beef with onions)\b/i],
    canonicalName: "French onion braised beef",
    cuisineKey: "french",
    key: "french-onion-braised-beef"
  },
  {
    aliases: [/\b(crispy ginger beef|ginger beef|crispy beef strips)\b/i],
    canonicalName: "crispy ginger beef",
    cuisineKey: "asian",
    key: "crispy-ginger-beef"
  },
  {
    aliases: [/\b(korean ground beef bowl|korean ground beef|korean beef rice bowl)\b/i],
    canonicalName: "Korean ground beef bowl",
    cuisineKey: "korean",
    key: "korean-ground-beef-bowl"
  },
  {
    aliases: [/\b(beef stroganoff|stroganoff beef|beef mushroom stroganoff)\b/i],
    canonicalName: "beef stroganoff",
    cuisineKey: "eastern-european",
    key: "beef-stroganoff"
  },
  {
    aliases: [/\b(pepper steak|beef pepper steak|pepper steak stir[- ]?fry)\b/i],
    canonicalName: "pepper steak",
    cuisineKey: "american",
    key: "pepper-steak"
  },
  {
    aliases: [/\b(italian shredded beef|italian beef|shredded beef sandwich|italian style beef)\b/i],
    canonicalName: "Italian shredded beef",
    cuisineKey: "italian-american",
    key: "italian-shredded-beef"
  },
  {
    aliases: [/\badana kebab\b/i, /\u0623\u0636\u0646\u0629\s+(?:\u0643\u0628\u0627\u0628|\u0643\u0641\u062a(?:\u0629|\u0647))|\u0627\u062f\u0646\u0629\s+(?:\u0643\u0628\u0627\u0628|\u0643\u0641\u062a(?:\u0629|\u0647))/iu],
    canonicalName: "adana kebab",
    cuisineKey: "turkish",
    key: "adana-kebab"
  },
  {
    aliases: [
      /\b(adana durum|adana dürüm|adana kebab wrap|adana lavash wrap|adana kebab in lavash)\b/i,
      /\b(adana wrap with sumac onion|adana kebab sandwich)\b/i,
      /\u0623\u0636\u0646\u0629.*(?:\u0644\u0627\u0641\u0627\u0634|\u0631\u0627\u0628|\u0633\u0627\u0646\u062f\u0648\u064a\u062a\u0634)|\u0627\u062f\u0646\u0629.*(?:\u0644\u0627\u0641\u0627\u0634|\u0631\u0627\u0628|\u0633\u0627\u0646\u062f\u0648\u064a\u062a\u0634)/iu
    ],
    canonicalName: "Adana durum",
    cuisineKey: "turkish",
    key: "adana-durum"
  },
  {
    aliases: [
      /\b(lahmacun and adana kebab|adana kebab with lahmacun|lahmacun adana kebab|adana lahmacun plate)\b/i,
      /\b(turkish lahmacun and adana combo|adana kebab lahmacun combo)\b/i
    ],
    canonicalName: "Adana kebab with lahmacun",
    cuisineKey: "turkish",
    key: "adana-lahmacun-plate"
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
      /\b(eggplant tomato pasta|eggplant pasta with tomato|pasta alla norma|aubergine tomato pasta|aubergine pasta)\b/i,
      /\b(pasta with eggplant and tomato|tomato eggplant pasta|eggplant marinara pasta)\b/i,
      /(?:\u0628\u0627\u0630\u0646\u062c\u0627\u0646|\u0628\u062a\u0646\u062c\u0627\u0646|\u0628\u0627\u0646\u062c\u0627\u0646).*(?:\u0637\u0645\u0627\u0637\u0645|\u0635\u0644\u0635(?:\u0629|\u0647)).*(?:\u0645\u0643\u0631\u0648(?:\u0646\u0629|\u0646\u0647)|\u0645\u0639\u0643\u0631\u0648(?:\u0646\u0629|\u0646\u0647)|\u0628\u0627\u0633\u062a\u0627|\u0633\u0628\u0627\u062c\u064a\u062a\u064a|\u0628\u064a\u0646\u064a)/iu,
      /(?:\u0645\u0643\u0631\u0648(?:\u0646\u0629|\u0646\u0647)|\u0645\u0639\u0643\u0631\u0648(?:\u0646\u0629|\u0646\u0647)|\u0628\u0627\u0633\u062a\u0627|\u0633\u0628\u0627\u062c\u064a\u062a\u064a|\u0628\u064a\u0646\u064a).*(?:\u0628\u0627\u0630\u0646\u062c\u0627\u0646|\u0628\u062a\u0646\u062c\u0627\u0646|\u0628\u0627\u0646\u062c\u0627\u0646).*(?:\u0637\u0645\u0627\u0637\u0645|\u0635\u0644\u0635(?:\u0629|\u0647))/iu
    ],
    canonicalName: "eggplant tomato pasta",
    cuisineKey: "italian",
    key: "eggplant-tomato-pasta"
  },
  {
    aliases: [/\b(avocado (?:and )?chickpea salad cups?|chickpea lettuce cups?)\b/i],
    canonicalName: "avocado and chickpea salad cups",
    cuisineKey: "mediterranean",
    key: "avocado-chickpea-salad-cups"
  },
  {
    aliases: [/\b(greek salad (?:upgrade )?(?:in a )?jar|greek salad jar)\b/i],
    canonicalName: "Greek salad upgrade in a jar",
    cuisineKey: "mediterranean",
    key: "greek-salad-jar"
  },
  {
    aliases: [/\b(roasted (?:veggie|vegetable) (?:and )?chickpea bowl|roasted chickpea vegetable bowl)\b/i],
    canonicalName: "roasted veggie and chickpea bowl",
    cuisineKey: "mediterranean",
    key: "roasted-veggie-chickpea-bowl"
  },
  {
    aliases: [/\b(cucumber tomato avocado salad|cucumber avocado tomato salad)\b/i],
    canonicalName: "cucumber tomato avocado salad",
    cuisineKey: "mediterranean",
    key: "cucumber-tomato-avocado-salad"
  },
  {
    aliases: [/\b(crispy zucchini (?:cheese )?rolls?|zucchini herb rolls?)\b/i],
    canonicalName: "crispy zucchini rolls",
    cuisineKey: "mediterranean",
    key: "crispy-zucchini-rolls"
  },
  {
    aliases: [/\b(yiayia'?s creamy pasta|greek creamy pasta)\b/i],
    canonicalName: "Yiayia's creamy pasta",
    cuisineKey: "mediterranean",
    key: "yiayia-creamy-pasta"
  },
  {
    aliases: [/\b(creamy spicy fasolada|spicy fasolada|white bean soup)\b/i],
    canonicalName: "creamy spicy fasolada",
    cuisineKey: "mediterranean",
    key: "spicy-fasolada"
  },
  {
    aliases: [/\b(creamy greek potato salad|greek potato salad)\b/i],
    canonicalName: "creamy Greek potato salad",
    cuisineKey: "mediterranean",
    key: "creamy-greek-potato-salad"
  },
  {
    aliases: [/\b(roasted vegetable stuffed shells|roasted vegetables stuffed shells|roasted veggie stuffed pasta shells)\b/i],
    canonicalName: "roasted vegetable stuffed shells",
    cuisineKey: "italian",
    key: "roasted-vegetable-stuffed-shells"
  },
  {
    aliases: [/\b(zucchini veggie bake|zucchini vegetable bake)\b/i],
    canonicalName: "zucchini veggie bake",
    cuisineKey: "italian",
    key: "zucchini-veggie-bake"
  },
  {
    aliases: [/\b(low carb (?:cheesy )?cauliflower pizza breadsticks?|cauliflower pizza breadsticks?)\b/i],
    canonicalName: "low carb cheesy cauliflower pizza breadsticks",
    cuisineKey: "american",
    key: "cauliflower-pizza-breadsticks"
  },
  {
    aliases: [/\b(low carb (?:easy )?eggplant lasagna|eggplant lasagna)\b/i],
    canonicalName: "low carb easy eggplant lasagna",
    cuisineKey: "american",
    key: "low-carb-eggplant-lasagna"
  },
  {
    aliases: [/\b(low carb roasted veggie pizza|low carb roasted vegetable pizza|roasted veggie pizza)\b/i],
    canonicalName: "low carb roasted veggie pizza",
    cuisineKey: "american",
    key: "low-carb-roasted-veggie-pizza"
  },
  {
    aliases: [/\b(easy roasted veggie tacos|roasted vegetable tacos|roasted veggie tacos)\b/i],
    canonicalName: "easy roasted veggie tacos",
    cuisineKey: "mexican",
    key: "roasted-veggie-tacos"
  },
  {
    aliases: [/\b(vegan palak paneer with tofu|vegan palak tofu|palak tofu)\b/i],
    canonicalName: "vegan palak paneer with tofu",
    cuisineKey: "indian",
    key: "vegan-palak-tofu"
  },
  {
    aliases: [/\b(vegan tikka masala|tofu tikka masala|vegetable tikka masala)\b/i],
    canonicalName: "vegan tikka masala",
    cuisineKey: "indian",
    key: "vegan-tikka-masala"
  },
  {
    aliases: [/\b(baingan bharta|baingan bhurta|smoky eggplant curry|mashed eggplant curry)\b/i],
    canonicalName: "baingan bharta",
    cuisineKey: "indian",
    key: "baingan-bharta"
  },
  {
    aliases: [/\b(persian potato patties|kuku sibzamini|kookoo sibzamini|potato kuku)\b/i],
    canonicalName: "Persian potato patties",
    cuisineKey: "middle-eastern",
    key: "persian-potato-patties"
  },
  {
    aliases: [/\b(persian eggplant soup|ash[- ]?e bademjan|ash bademjan|eggplant ash)\b/i],
    canonicalName: "Persian eggplant soup",
    cuisineKey: "middle-eastern",
    key: "persian-eggplant-soup"
  },
  {
    aliases: [/\b(briam greek roasted vegetables|briam|greek roasted vegetables)\b/i],
    canonicalName: "briam Greek roasted vegetables",
    cuisineKey: "mediterranean",
    key: "briam"
  },
  {
    aliases: [/\b(eggplant caponata|caponata)\b/i],
    canonicalName: "eggplant caponata",
    cuisineKey: "mediterranean",
    key: "caponata"
  },
  {
    aliases: [/\b(turkish zucchini stew|kabak yemegi|kabak yemeği)\b/i],
    canonicalName: "Turkish zucchini stew",
    cuisineKey: "turkish",
    key: "turkish-zucchini-stew"
  },
  {
    aliases: [/\b(mucver|mücver|turkish zucchini fritters|zucchini fritters)\b/i],
    canonicalName: "Mucver Turkish zucchini fritters",
    cuisineKey: "turkish",
    key: "turkish-mucver"
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
    aliases: [/\b(orange beef lettuce wraps?|ground beef lettuce wraps?|beef lettuce cups?|orange beef lettuce cups?)\b/i],
    canonicalName: "orange beef lettuce wraps",
    cuisineKey: "american",
    key: "orange-beef-lettuce-wraps"
  },
  {
    aliases: [/\b(ground beef zucchini boats?|beef zucchini boats?|stuffed zucchini boats?|zucchini boats with ground beef)\b/i],
    canonicalName: "ground beef zucchini boats",
    cuisineKey: "american",
    key: "ground-beef-zucchini-boats"
  },
  {
    aliases: [/\b(cheesy ground beef cauliflower casserole|ground beef cauliflower casserole|beef cauliflower casserole|cauliflower ground beef skillet)\b/i],
    canonicalName: "ground beef cauliflower casserole",
    cuisineKey: "american",
    key: "ground-beef-cauliflower-casserole"
  },
  {
    aliases: [/\b(keto ground beef with worcestershire|ground beef worcestershire skillet|easy keto ground beef|keto ground beef skillet)\b/i],
    canonicalName: "keto ground beef Worcestershire skillet",
    cuisineKey: "american",
    key: "keto-ground-beef-worcestershire"
  },
  {
    aliases: [/\b(ground beef tacos?|picadillo tacos?|tacos de carne molida)\b/i],
    canonicalName: "ground beef tacos",
    cuisineKey: "mexican",
    key: "ground-beef-tacos"
  },
  {
    aliases: [/\b(ground beef burritos?|beef burritos?|burritos de carne molida)\b/i],
    canonicalName: "ground beef burritos",
    cuisineKey: "mexican",
    key: "ground-beef-burritos"
  },
  {
    aliases: [/\b(lasagna alla bolognese|ground beef lasagna|beef lasagna|bolognese lasagna)\b/i],
    canonicalName: "lasagna alla Bolognese",
    cuisineKey: "italian",
    key: "lasagna-bolognese"
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
    aliases: [
      /\b(kousa mahshi|koosa mahshi|stuffed zucchini|stuffed courgette|lebanese stuffed zucchini)\b/i,
      /\bmahshi kousa|mahshi koosa|zucchini mahshi\b/i,
      /(?:\u0645\u062d\u0634\u064a|\u0645\u062d\u0634\u0649)\s+\u0643\u0648\u0633\u0627|\u0643\u0648\u0633\u0627\s+(?:\u0645\u062d\u0634\u064a|\u0645\u062d\u0634\u0649)/iu
    ],
    canonicalName: "kousa mahshi",
    cuisineKey: "middle-eastern",
    key: "kousa-mahshi"
  },
  {
    aliases: [
      /\b(stuffed cabbage rolls|cabbage mahshi|mahshi cabbage|malfouf mahshi|mahshi kromp)\b/i,
      /(?:\u0645\u062d\u0634\u064a|\u0645\u062d\u0634\u0649)\s+(?:\u0643\u0631\u0646\u0628|\u0645\u0644\u0641\u0648\u0641)|(?:\u0643\u0631\u0646\u0628|\u0645\u0644\u0641\u0648\u0641)\s+(?:\u0645\u062d\u0634\u064a|\u0645\u062d\u0634\u0649)/iu
    ],
    canonicalName: "stuffed cabbage rolls",
    cuisineKey: "middle-eastern",
    key: "stuffed-cabbage-rolls"
  },
  {
    aliases: [
      /\b(warak enab|waraq enab|stuffed grape leaves|stuffed vine leaves|grape leaves mahshi|dolma grape leaves)\b/i,
      /(?:\u0648\u0631\u0642\s*\u0639\u0646\u0628|(?:\u0645\u062d\u0634\u064a|\u0645\u062d\u0634\u0649)\s+\u0648\u0631\u0642\s*\u0639\u0646\u0628)/iu
    ],
    canonicalName: "warak enab",
    cuisineKey: "middle-eastern",
    key: "warak-enab"
  },
  {
    aliases: [
      /\b(stuffed bell peppers|stuffed peppers|pepper mahshi|mahshi peppers)\b/i,
      /(?:\u0645\u062d\u0634\u064a|\u0645\u062d\u0634\u0649)\s+(?:\u0641\u0644\u0641\u0644|pepper)|\u0641\u0644\u0641\u0644\s+(?:\u0645\u062d\u0634\u064a|\u0645\u062d\u0634\u0649)/iu
    ],
    canonicalName: "stuffed bell peppers",
    cuisineKey: "middle-eastern",
    key: "stuffed-bell-peppers"
  },
  {
    aliases: [
      /\b(tomato mahshi|mahshi tomato|stuffed tomatoes|stuffed tomato)\b/i,
      /(?:\u0645\u062d\u0634\u064a|\u0645\u062d\u0634\u0649)\s+\u0637\u0645\u0627\u0637\u0645|\u0637\u0645\u0627\u0637\u0645\s+(?:\u0645\u062d\u0634\u064a|\u0645\u062d\u0634\u0649)/iu
    ],
    canonicalName: "tomato mahshi",
    cuisineKey: "middle-eastern",
    key: "tomato-mahshi"
  },
  {
    aliases: [
      /\b(stuffed eggplant|stuffed aubergine|eggplant mahshi|mahshi eggplant|batenjan mahshi|batinjan mahshi)\b/i,
      /(?:\u0645\u062d\u0634\u064a|\u0645\u062d\u0634\u0649)\s+(?:\u0628\u0627\u0630\u0646\u062c\u0627\u0646|\u0628\u062a\u0646\u062c\u0627\u0646)|(?:\u0628\u0627\u0630\u0646\u062c\u0627\u0646|\u0628\u062a\u0646\u062c\u0627\u0646)\s+(?:\u0645\u062d\u0634\u064a|\u0645\u062d\u0634\u0649)/iu
    ],
    canonicalName: "stuffed eggplant",
    cuisineKey: "middle-eastern",
    key: "stuffed-eggplant"
  },
  {
    aliases: [/\b(sheikh el mahshi|sheikh al mahshi|shaikh el mahshi|sheikh mahshi)\b/i],
    canonicalName: "sheikh el mahshi",
    cuisineKey: "middle-eastern",
    key: "sheikh-el-mahshi"
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
    aliases: [/\b(simple garlic shrimp|garlic shrimp recipe|garlic shrimp|shrimp with garlic)\b/i],
    canonicalName: "simple garlic shrimp",
    cuisineKey: "american",
    key: "simple-garlic-shrimp"
  },
  {
    aliases: [/\b(shrimp with oyster sauce|oyster sauce shrimp|shrimp oyster sauce)\b/i],
    canonicalName: "shrimp with oyster sauce",
    cuisineKey: "filipino",
    key: "shrimp-oyster-sauce"
  },
  {
    aliases: [/\b(fried shrimp|southern fried shrimp|crispy fried shrimp|breaded fried shrimp)\b/i],
    canonicalName: "fried shrimp",
    cuisineKey: "american",
    key: "fried-shrimp"
  },
  {
    aliases: [/\b(honey garlic shrimp|honey garlic prawns|garlic honey shrimp)\b/i],
    canonicalName: "honey garlic shrimp",
    cuisineKey: "asian",
    key: "honey-garlic-shrimp"
  },
  {
    aliases: [/\b(shrimp stir fry|shrimp vegetable stir fry|shrimp and vegetable stir fry)\b/i],
    canonicalName: "shrimp stir fry",
    cuisineKey: "asian",
    key: "shrimp-stir-fry"
  },
  {
    aliases: [/\b(shrimp fajitas?|fajitas de camaron)\b/i],
    canonicalName: "shrimp fajitas",
    cuisineKey: "mexican",
    key: "shrimp-fajitas"
  },
  {
    aliases: [/\b(shrimp lettuce wraps?|shrimp lettuce cups?)\b/i],
    canonicalName: "shrimp lettuce wraps",
    cuisineKey: "asian",
    key: "shrimp-lettuce-wraps"
  },
  {
    aliases: [/\b(pan seared scallops?|seared scallops?|scallops with lemon butter)\b/i],
    canonicalName: "pan seared scallops",
    cuisineKey: "western",
    key: "pan-seared-scallops"
  },
  {
    aliases: [/\b(cajun shrimp|cajun butter shrimp|best cajun shrimp)\b/i],
    canonicalName: "Cajun shrimp",
    cuisineKey: "cajun",
    key: "cajun-shrimp"
  },
  {
    aliases: [/\b(pan seared shrimp|pan-seared shrimp|seared shrimp|pan fried shrimp)\b/i],
    canonicalName: "pan-seared shrimp",
    cuisineKey: "american",
    key: "pan-seared-shrimp"
  },
  {
    aliases: [/\b(shrimp spaghetti|shrimp linguine|shrimp pasta|garlic shrimp linguine|lemon garlic shrimp pasta)\b/i],
    canonicalName: "shrimp spaghetti",
    cuisineKey: "italian",
    key: "shrimp-spaghetti"
  },
  {
    aliases: [/\b(garlic butter shrimp|shrimp garlic butter|grilled shrimp with garlic butter)\b/i],
    canonicalName: "garlic butter shrimp",
    cuisineKey: "american",
    key: "garlic-butter-shrimp"
  },
  {
    aliases: [/\b(garlic shrimp quinoa|shrimp quinoa|garlic shrimp with quinoa)\b/i],
    canonicalName: "garlic shrimp with quinoa",
    cuisineKey: "american",
    key: "garlic-shrimp-quinoa"
  },
  {
    aliases: [/\b(lemon garlic shrimp|lemon garlic prawns|shrimp with lemon garlic)\b/i],
    canonicalName: "lemon garlic shrimp",
    cuisineKey: "mediterranean",
    key: "lemon-garlic-shrimp"
  },
  {
    aliases: [/\b(boom boom shrimp|bang bang shrimp|crispy boom boom shrimp)\b/i],
    canonicalName: "boom boom shrimp",
    cuisineKey: "american",
    key: "boom-boom-shrimp"
  },
  {
    aliases: [/\b(drunken shrimp|drunken prawns|shrimp in beer sauce|wine garlic shrimp)\b/i],
    canonicalName: "drunken shrimp",
    cuisineKey: "american",
    key: "drunken-shrimp"
  },
  {
    aliases: [/\b(head[- ]?on spicy garlic shrimp|head[- ]?on garlic shrimp|spicy head[- ]?on shrimp)\b/i],
    canonicalName: "head-on spicy garlic shrimp",
    cuisineKey: "global",
    key: "head-on-spicy-garlic-shrimp"
  },
  {
    aliases: [/\b(spicy grilled shrimp|grilled spicy shrimp|grilled shrimp with chili)\b/i],
    canonicalName: "spicy grilled shrimp",
    cuisineKey: "global",
    key: "spicy-grilled-shrimp"
  },
  {
    aliases: [/\b(butterfly shrimp|butterflied shrimp|butterfly fried shrimp|coconut butterfly shrimp)\b/i],
    canonicalName: "butterfly shrimp",
    cuisineKey: "american",
    key: "butterfly-shrimp"
  },
  {
    aliases: [/\b(shrimp soup|clear shrimp soup|shrimp broth soup|shrimp and seafood soup)\b/i],
    canonicalName: "shrimp soup",
    cuisineKey: "global",
    key: "shrimp-soup"
  },
  {
    aliases: [/\b(cajun honey shrimp|honey cajun shrimp|cajun honey butter shrimp)\b/i],
    canonicalName: "Cajun honey shrimp",
    cuisineKey: "cajun",
    key: "cajun-honey-shrimp"
  },
  {
    aliases: [/\b(portuguese garlic shrimp|portuguese shrimp|shrimp mozambique|piri piri shrimp)\b/i],
    canonicalName: "Portuguese garlic shrimp",
    cuisineKey: "portuguese",
    key: "portuguese-garlic-shrimp"
  },
  {
    aliases: [/\b(coconut shrimp|5 ingredient coconut shrimp|crispy coconut shrimp)\b/i],
    canonicalName: "coconut shrimp",
    cuisineKey: "american",
    key: "coconut-shrimp"
  },
  {
    aliases: [
      /\b(alexandrian shrimp|alexandrian garlic shrimp|egyptian garlic shrimp|shrimp eskandarani|shrimp iskandarani|gambari eskandarani|gambari iskandarani)\b/i,
      /\b(spicy egyptian shrimp|egyptian shrimp with garlic lemon cumin|egyptian garlic lemon shrimp)\b/i,
      /\u062c\u0645\u0628\u0631\u064a.*(?:\u0627\u0633\u0643\u0646\u062f\u0631\u0627\u0646\u064a|\u0625\u0633\u0643\u0646\u062f\u0631\u0627\u0646\u064a|\u062b\u0648\u0645|\u0643\u0645\u0648\u0646|\u0644\u064a\u0645\u0648\u0646)/iu
    ],
    canonicalName: "Alexandrian shrimp",
    cuisineKey: "egyptian",
    key: "alexandrian-shrimp"
  },
  {
    aliases: [
      /\b(egyptian shrimp tagine|shrimp tagine|shrimp tajine|gambari tagine|gambari tajine)\b/i,
      /\b(shrimp in tomato sauce egyptian|egyptian tomato shrimp stew|spicy shrimp stew egyptian)\b/i,
      /\u0637\u0627\u062c\u0646.*\u062c\u0645\u0628\u0631\u064a|\u062c\u0645\u0628\u0631\u064a.*(?:\u0637\u0627\u062c\u0646|\u0635\u0644\u0635\u0629\s+\u0637\u0645\u0627\u0637\u0645)/iu
    ],
    canonicalName: "Egyptian shrimp tagine",
    cuisineKey: "egyptian",
    key: "egyptian-shrimp-tagine"
  },
  {
    aliases: [
      /\b(mediterranean(?:-style)? garlic shrimp|garlic shrimp with bell peppers|shrimp with bell peppers|shrimp with shallots and peppers)\b/i,
      /\b(lemon garlic shrimp with peppers|shrimp with shallots peppers parsley)\b/i
    ],
    canonicalName: "mediterranean garlic shrimp",
    cuisineKey: "mediterranean",
    key: "mediterranean-garlic-shrimp"
  },
  {
    aliases: [
      /\b(grilled shrimp kebabs?|grilled shrimp kabobs?|shrimp skewers?|shrimp kebabs?|shrimp kabobs?)\b/i,
      /\b(margarita grilled shrimp|lime grilled shrimp|cilantro lime shrimp skewers?)\b/i,
      /\u062c\u0645\u0628\u0631\u064a.*(?:\u0645\u0634\u0648\u064a|\u0633\u064a\u062e|\u0623\u0633\u064a\u0627\u062e)/iu
    ],
    canonicalName: "grilled shrimp kebabs",
    cuisineKey: "mediterranean",
    key: "grilled-shrimp-kebabs"
  },
  {
    aliases: [
      /\b(mediterranean shrimp with feta|shrimp with olives tomatoes and feta|greek shrimp with feta|shrimp saganaki)\b/i,
      /\b(shrimp tomato feta|baked shrimp with feta|shrimp olives tomatoes feta)\b/i,
      /\u062c\u0645\u0628\u0631\u064a.*(?:\u0641\u064a\u062a\u0627|\u0632\u064a\u062a\u0648\u0646|\u0637\u0645\u0627\u0637\u0645)/iu
    ],
    canonicalName: "mediterranean shrimp with feta",
    cuisineKey: "mediterranean",
    key: "mediterranean-shrimp-feta"
  },
  {
    aliases: [
      /\b(turkish prawns? with feta|turkish shrimp with feta|karides.*feta|karides guvec|karides g[uü]ve[cç])\b/i,
      /\b(turkish baked prawns?|turkish baked shrimp|prawns? tomato feta|shrimp tomato pepper feta)\b/i,
      /\u0643\u0627\u0631\u064a\u062f\u0633|(?:\u062c\u0645\u0628\u0631\u064a|\u0631\u0648\u0628\u064a\u0627\u0646).*(?:\u0641\u064a\u062a\u0627|\u062a\u0631\u0643\u064a|\u0637\u0645\u0627\u0637\u0645)/iu
    ],
    canonicalName: "Turkish prawns with feta",
    cuisineKey: "turkish",
    key: "turkish-prawns-feta"
  },
  {
    aliases: [
      /\b(turkish prawn chickpea stew|turkish shrimp chickpea stew|prawn chickpea stew|shrimp chickpea stew)\b/i,
      /\b(turkish prawns? with chickpeas|turkish shrimp with chickpeas|prawns? tomato chickpea stew)\b/i,
      /(?:\u062c\u0645\u0628\u0631\u064a|\u0631\u0648\u0628\u064a\u0627\u0646).*(?:\u062d\u0645\u0635|\u064a\u062e\u0646\u0629|\u062a\u0631\u0643\u064a)/iu
    ],
    canonicalName: "Turkish prawn and chickpea stew",
    cuisineKey: "turkish",
    key: "turkish-prawn-chickpea-stew"
  },
  {
    aliases: [
      /\b(kung pao shrimp|kung pao prawns?|sichuan kung pao shrimp|szechuan kung pao shrimp)\b/i,
      /\b(shrimp with peanuts and chiles|shrimp peanuts dried chilies|chinese spicy shrimp peanuts)\b/i,
      /(?:\u062c\u0645\u0628\u0631\u064a|\u0631\u0648\u0628\u064a\u0627\u0646).*(?:\u0643\u0648\u0646\u063a\s*\u0628\u0627\u0648|\u0641\u0648\u0644\s*\u0633\u0648\u062f\u0627\u0646\u064a|\u0641\u0644\u0641\u0644\s*\u062d\u0627\u0631)/iu
    ],
    canonicalName: "Kung Pao shrimp",
    cuisineKey: "chinese",
    key: "kung-pao-shrimp"
  },
  {
    aliases: [
      /\b(asian garlic shrimp|chinese garlic shrimp|garlic soy shrimp|soy garlic shrimp|sesame garlic shrimp)\b/i,
      /\b(shrimp in garlic soy sauce|garlicky asian shrimp|garlic ginger shrimp)\b/i,
      /(?:\u062c\u0645\u0628\u0631\u064a|\u0631\u0648\u0628\u064a\u0627\u0646).*(?:\u062b\u0648\u0645|\u0635\u0648\u064a\u0627|\u0633\u0645\u0633\u0645)/iu
    ],
    canonicalName: "Asian garlic shrimp",
    cuisineKey: "chinese",
    key: "asian-garlic-shrimp"
  },
  {
    aliases: [
      /\b(chinese salt and pepper shrimp|salt and pepper shrimp|salt pepper prawns?|salt and pepper prawns?)\b/i,
      /\b(crispy pepper shrimp|crispy salt pepper shrimp|fried shrimp with garlic and scallions)\b/i,
      /(?:\u062c\u0645\u0628\u0631\u064a|\u0631\u0648\u0628\u064a\u0627\u0646).*(?:\u0645\u0644\u062d|\u0641\u0644\u0641\u0644|\u0645\u0642\u0631\u0645\u0634|\u0645\u0642\u0644\u064a)/iu
    ],
    canonicalName: "Chinese salt and pepper shrimp",
    cuisineKey: "chinese",
    key: "salt-and-pepper-shrimp"
  },
  {
    aliases: [
      /\b(chinese shrimp and broccoli|shrimp broccoli stir fry|shrimp and broccoli stir fry|shrimp with broccoli)\b/i,
      /\b(shrimp broccoli rice bowl|garlic shrimp broccoli|soy garlic shrimp broccoli)\b/i,
      /(?:\u062c\u0645\u0628\u0631\u064a|\u0631\u0648\u0628\u064a\u0627\u0646).*(?:\u0628\u0631\u0648\u0643\u0644\u064a|\u0635\u0648\u064a\u0627|\u0635\u064a\u0646\u064a)/iu
    ],
    canonicalName: "Chinese shrimp and broccoli",
    cuisineKey: "chinese",
    key: "chinese-shrimp-broccoli"
  },
  {
    aliases: [
      /\b(ginger garlic seafood stir fry|seafood ginger spring onion stir fry|seafood stir fry ginger garlic)\b/i,
      /\b(ginger spring onion seafood|chinese seafood stir fry|seafood with ginger and scallions)\b/i,
      /(?:\u0645\u0623\u0643\u0648\u0644\u0627\u062a\s*\u0628\u062d\u0631\u064a\u0629|\u062c\u0645\u0628\u0631\u064a|\u0633\u0645\u0643).*(?:\u0632\u0646\u062c\u0628\u064a\u0644|\u062b\u0648\u0645|\u0628\u0635\u0644\s*\u0623\u062e\u0636\u0631)/iu
    ],
    canonicalName: "Chinese ginger garlic seafood stir fry",
    cuisineKey: "chinese",
    key: "ginger-garlic-seafood-stir-fry"
  },
  {
    aliases: [
      /\b(steamed fish in oyster sauce|fish in oyster sauce|chinese steamed fish oyster sauce)\b/i,
      /\b(steamed fish with oyster sauce|waterless steamed fish oyster sauce)\b/i,
      /(?:\u0633\u0645\u0643).*(?:\u0628\u062e\u0627\u0631|\u0645\u0628\u062e\u0631).*(?:\u0645\u062d\u0627\u0631|\u0623\u0648\u064a\u0633\u062a\u0631)/iu
    ],
    canonicalName: "Chinese steamed fish in oyster sauce",
    cuisineKey: "chinese",
    key: "steamed-fish-oyster-sauce"
  },
  {
    aliases: [
      /\b(sauteed seafood medley|seafood medley|mixed seafood saute|mixed seafood skillet)\b/i,
      /\b(shrimp scallops crab medley|shrimp scallop crab saute|garlic seafood medley)\b/i,
      /(?:\u0645\u0623\u0643\u0648\u0644\u0627\u062a\s*\u0628\u062d\u0631\u064a\u0629).*(?:\u0645\u0634\u0643\u0644\u0629|\u0645\u064a\u062f\u0644\u064a|\u0645\u0642\u0644\u0627\u0629)/iu
    ],
    canonicalName: "sauteed seafood medley",
    cuisineKey: "global",
    key: "sauteed-seafood-medley"
  },
  {
    aliases: [
      /\b(seafood paella|spanish seafood paella|paella de marisco|paella marinera)\b/i,
      /\b(shrimp mussel paella|paella with shrimp and mussels|saffron seafood rice)\b/i,
      /(?:\u0628\u0627\u064a\u064a\u0627|\u0628\u0627\u064a\u0644\u0627).*(?:\u0645\u0623\u0643\u0648\u0644\u0627\u062a\s*\u0628\u062d\u0631\u064a\u0629|\u062c\u0645\u0628\u0631\u064a|\u0628\u062d\u0631\u064a)/iu
    ],
    canonicalName: "Spanish seafood paella",
    cuisineKey: "spanish",
    key: "seafood-paella"
  },
  {
    aliases: [
      /\b(cajun seafood boil|seafood boil|low country boil|lowcountry boil|shrimp boil|crab boil)\b/i,
      /\b(seafood boil with garlic butter|cajun shrimp crab boil|shrimp crab corn potatoes sausage)\b/i,
      /(?:\u0645\u0623\u0643\u0648\u0644\u0627\u062a\s*\u0628\u062d\u0631\u064a\u0629|\u062c\u0645\u0628\u0631\u064a).*(?:\u0643\u0627\u062c\u0646|\u0630\u0631\u0629|\u0628\u0637\u0627\u0637\u0633|\u0633\u062c\u0642)/iu
    ],
    canonicalName: "Cajun seafood boil",
    cuisineKey: "cajun",
    key: "cajun-seafood-boil"
  },
  {
    aliases: [
      /\b(cioppino|san francisco seafood stew|italian american seafood stew|tomato seafood stew)\b/i,
      /\b(seafood stew with crab legs|shrimp mussel clam fish stew|seafood tomato broth stew)\b/i,
      /(?:\u064a\u062e\u0646\u0629|\u0634\u0648\u0631\u0628\u0629).*(?:\u0645\u0623\u0643\u0648\u0644\u0627\u062a\s*\u0628\u062d\u0631\u064a\u0629|\u062c\u0645\u0628\u0631\u064a|\u0643\u0631\u0627\u0628|\u0628\u0644\u062d\s*\u0628\u062d\u0631)/iu
    ],
    canonicalName: "cioppino seafood stew",
    cuisineKey: "italian-american",
    key: "cioppino"
  },
  {
    aliases: [
      /\b(seafood chowder|creamy seafood chowder|mixed seafood chowder|fish chowder|seafood cream soup)\b/i,
      /\b(chowder with seafood|prawn fish mussel chowder|creamy marinara mix soup|light creamy seafood soup|fish and shrimp soup)\b/i,
      /(?:\u0634\u0648\u0631\u0628\u0629|\u062d\u0633\u0627\u0621).*(?:\u0645\u0623\u0643\u0648\u0644\u0627\u062a\s*\u0628\u062d\u0631\u064a\u0629|\u0633\u0645\u0643|\u062c\u0645\u0628\u0631\u064a).*(?:\u0643\u0631\u064a\u0645|\u0643\u0631\u064a\u0645\u064a)/iu
    ],
    canonicalName: "seafood chowder",
    cuisineKey: "western",
    key: "seafood-chowder"
  },
  {
    aliases: [
      /\b(mediterranean fish soup|eastern mediterranean fish soup|fish soup with herbs and lemon|tomato fish soup)\b/i,
      /\b(fish soup with cumin coriander turmeric|fish stew with tomatoes and herbs|mediterranean seafood soup)\b/i,
      /(?:\u0634\u0648\u0631\u0628\u0629|\u062d\u0633\u0627\u0621).*(?:\u0633\u0645\u0643).*(?:\u0645\u062a\u0648\u0633\u0637|\u0637\u0645\u0627\u0637\u0645|\u0644\u064a\u0645\u0648\u0646|\u0623\u0639\u0634\u0627\u0628)/iu
    ],
    canonicalName: "Mediterranean fish soup",
    cuisineKey: "mediterranean",
    key: "mediterranean-fish-soup"
  },
  {
    aliases: [
      /\b(pla phad cha|pla pad cha|thai fried fish with spicy chile sauce|thai spicy fried fish)\b/i,
      /\b(fried fish with spicy chile sauce|thai fish stir fry with basil|thai chile fish)\b/i,
      /(?:\u0633\u0645\u0643).*(?:\u062a\u0627\u064a\u0644\u0627\u0646\u062f\u064a|\u062a\u0627\u064a|\u0641\u0644\u0641\u0644\s*\u062d\u0627\u0631|\u0631\u064a\u062d\u0627\u0646)/iu
    ],
    canonicalName: "Thai Pla Pad Cha fried fish",
    cuisineKey: "thai",
    key: "pla-pad-cha"
  },
  {
    aliases: [
      /\b(chilli lime fish|chili lime fish|thai chilli lime fish|thai chili lime fish)\b/i,
      /\b(pan seared fish with chilli lime sauce|fish in spicy lime sauce|pla tort sahm rot)\b/i,
      /(?:\u0633\u0645\u0643).*(?:\u0644\u0627\u064a\u0645|\u0644\u064a\u0645\u0648\u0646|\u0641\u0644\u0641\u0644\s*\u062d\u0627\u0631|\u062a\u0627\u064a)/iu
    ],
    canonicalName: "Thai chilli lime fish",
    cuisineKey: "thai",
    key: "chilli-lime-fish"
  },
  {
    aliases: [
      /\b(fish florentine|florentine fish|white fish florentine|seared fish florentine)\b/i,
      /\b(fish with creamed spinach|white fish with spinach cream|pan seared fish spinach)\b/i,
      /(?:\u0633\u0645\u0643).*(?:\u0633\u0628\u0627\u0646\u062e|\u0643\u0631\u064a\u0645|\u0641\u0644\u0648\u0631\u0646\u062a\u064a\u0646)/iu
    ],
    canonicalName: "fish Florentine",
    cuisineKey: "american",
    key: "fish-florentine"
  },
  {
    aliases: [/\b(creamy tuscan salmon|tuscan salmon|salmon with sun dried tomatoes and spinach)\b/i],
    canonicalName: "creamy Tuscan salmon",
    cuisineKey: "italian",
    key: "creamy-tuscan-salmon"
  },
  {
    aliases: [/\b(easy baked salmon|baked salmon|oven baked salmon|simple baked salmon)\b/i],
    canonicalName: "easy baked salmon",
    cuisineKey: "western",
    key: "easy-baked-salmon"
  },
  {
    aliases: [/\b(fish tacos?|baja fish tacos?|white fish tacos?)\b/i],
    canonicalName: "fish tacos",
    cuisineKey: "mexican",
    key: "fish-tacos"
  },
  {
    aliases: [/\b(cod fish tacos?|cod tacos?)\b/i],
    canonicalName: "cod fish tacos",
    cuisineKey: "mexican",
    key: "cod-fish-tacos"
  },
  {
    aliases: [
      /\b(crispy pan fried fish|pan fried fish|crispy fish fillet|crispy fried fish fillet)\b/i,
      /\b(flour coated fish fillet|golden pan seared fish|simple crispy fish)\b/i,
      /(?:\u0633\u0645\u0643).*(?:\u0645\u0642\u0644\u064a|\u0645\u0642\u0631\u0645\u0634|\u0630\u0647\u0628\u064a|\u0641\u064a\u0644\u064a\u0647)/iu
    ],
    canonicalName: "crispy pan fried fish",
    cuisineKey: "western",
    key: "crispy-pan-fried-fish"
  },
  {
    aliases: [/\b(parmesan crusted tilapia|herb crusted tilapia|tilapia parmesan crust)\b/i],
    canonicalName: "Parmesan crusted tilapia",
    cuisineKey: "italian",
    key: "parmesan-crusted-tilapia"
  },
  {
    aliases: [/\b(fried tilapia|pan fried tilapia|golden fried tilapia)\b/i],
    canonicalName: "fried tilapia",
    cuisineKey: "western",
    key: "fried-tilapia"
  },
  {
    aliases: [/\b(baked tilapia with lemon|lemon baked tilapia|baked tilapia lemon|tilapia with lemon tomatoes)\b/i],
    canonicalName: "baked tilapia with lemon",
    cuisineKey: "western",
    key: "baked-tilapia-lemon"
  },
  {
    aliases: [/\b(baked fish|simple baked fish|white fish with lemon|baked white fish)\b/i],
    canonicalName: "baked fish",
    cuisineKey: "western",
    key: "baked-fish"
  },
  {
    aliases: [/\b(salmon rice crunch bowl|salmon rice bowl|crispy salmon rice bowl)\b/i],
    canonicalName: "salmon rice crunch bowl",
    cuisineKey: "asian",
    key: "salmon-rice-crunch-bowl"
  },
  {
    aliases: [/\b(pesto shrimp|shrimp with pesto|basil pesto shrimp)\b/i],
    canonicalName: "pesto shrimp",
    cuisineKey: "italian",
    key: "pesto-shrimp"
  },
  {
    aliases: [/\b(tuscan shrimp|creamy tuscan shrimp|shrimp with sun dried tomatoes and spinach)\b/i],
    canonicalName: "Tuscan shrimp",
    cuisineKey: "italian",
    key: "tuscan-shrimp"
  },
  {
    aliases: [/\b(shrimp and grits|shrimp grits)\b/i],
    canonicalName: "shrimp and grits",
    cuisineKey: "american",
    key: "shrimp-and-grits"
  },
  {
    aliases: [/\b(grapefruit shrimp (?:and )?radicchio tartines?|shrimp radicchio tartines?|shrimp grapefruit tartines?)\b/i],
    canonicalName: "grapefruit shrimp and radicchio tartines",
    cuisineKey: "american",
    key: "grapefruit-shrimp-radicchio-tartines"
  },
  {
    aliases: [/\b(citrus[- ]roasted salmon|citrus salmon)\b/i],
    canonicalName: "citrus-roasted salmon",
    cuisineKey: "american",
    key: "citrus-roasted-salmon"
  },
  {
    aliases: [/\b(seafood paella with bell peppers|seafood paella|paella de marisco)\b/i],
    canonicalName: "seafood paella with bell peppers",
    cuisineKey: "mediterranean",
    key: "seafood-paella-bell-peppers"
  },
  {
    aliases: [/\b(classic lobster rolls?|lobster rolls?|lobster roll)\b/i],
    canonicalName: "classic lobster rolls",
    cuisineKey: "american",
    key: "lobster-roll"
  },
  {
    aliases: [
      /\b(mediterranean baked fish|baked mediterranean fish|mediterranean fish with olives and capers)\b/i,
      /\b(baked fish with olives capers tomatoes|spiced mediterranean fish|fish with olives and capers)\b/i,
      /(?:\u0633\u0645\u0643).*(?:\u0645\u062a\u0648\u0633\u0637|\u0632\u064a\u062a\u0648\u0646|\u0643\u0628\u0631|\u0643\u0627\u0628\u0631|\u0645\u062e\u0628\u0648\u0632)/iu
    ],
    canonicalName: "Mediterranean baked fish with olives and capers",
    cuisineKey: "mediterranean",
    key: "mediterranean-baked-fish"
  },
  {
    aliases: [
      /\b(roasted whole snapper with egyptian spices|egyptian spiced whole snapper|egyptian roasted whole fish)\b/i,
      /\b(whole snapper egyptian spices|whole fish with coriander cumin paprika|egyptian spice paste fish)\b/i,
      /(?:\u0633\u0645\u0643|\u0633\u0646\u0627\u0628\u0631|\u062f\u0646\u064a\u0633).*(?:\u0643\u0627\u0645\u0644|\u0645\u0634\u0648\u064a|\u0645\u0635\u0631\u064a|\u0643\u0632\u0628\u0631\u0629|\u0643\u0645\u0648\u0646)/iu
    ],
    canonicalName: "roasted whole snapper with Egyptian spices",
    cuisineKey: "egyptian",
    key: "egyptian-spiced-whole-snapper"
  },
  {
    aliases: [
      /\b(arabic grilled fish|egyptian grilled fish|charcoal grilled fish with arabic spices|grilled whole fish arabic spices)\b/i,
      /\b(grilled tilapia with cumin coriander paprika|whole grilled fish with lemon garlic cumin)\b/i,
      /(?:\u0633\u0645\u0643).*(?:\u0645\u0634\u0648\u064a|\u0641\u062d\u0645).*(?:\u0628\u0647\u0627\u0631\u0627\u062a|\u0643\u0645\u0648\u0646|\u0643\u0632\u0628\u0631\u0629|\u0628\u0627\u0628\u0631\u064a\u0643\u0627)/iu
    ],
    canonicalName: "Arabic charcoal grilled fish",
    cuisineKey: "egyptian",
    key: "arabic-grilled-fish"
  },
  {
    aliases: [
      /\b(samak bel radah|samak bel rada|fish bel radah|fish bel rada|bran coated fish|egyptian bran fish)\b/i,
      /\b(fish with rada|fish with redah|fried bran fish|oven bran fish)\b/i,
      /\u0633\u0645\u0643.*(?:\u0631\u062f\u0629|\u0628\u0627\u0644\u0631\u062f\u0629)/iu
    ],
    canonicalName: "Samak bel radah",
    cuisineKey: "egyptian",
    key: "samak-bel-radah"
  },
  {
    aliases: [
      /\b(egyptian smoked fish|smoked fish egyptian|smoked herring|feseekh|fesikh|ringa|renga)\b/i,
      /\b(smoked mullet|smoked bouri|smoked seafood egyptian)\b/i,
      /\u0633\u0645\u0643.*(?:\u0645\u062f\u062e\u0646|\u0641\u0633\u064a\u062e|\u0631\u0646\u062c\u0629)/iu
    ],
    canonicalName: "Egyptian smoked fish",
    cuisineKey: "egyptian",
    key: "egyptian-smoked-fish"
  },
  {
    aliases: [
      /\b(egyptian fried tilapia|fried tilapia egyptian|samak balti makli|fried balti fish)\b/i,
      /\b(crispy fried tilapia|whole fried tilapia|egyptian crispy tilapia)\b/i,
      /\u0633\u0645\u0643.*(?:\u0628\u0644\u0637\u064a).*(?:\u0645\u0642\u0644\u064a|\u0645\u0642\u0631\u0645\u0634)/iu
    ],
    canonicalName: "Egyptian fried tilapia",
    cuisineKey: "egyptian",
    key: "egyptian-fried-tilapia"
  },
  {
    aliases: [
      /\b(egyptian baked fish tray|oven baked egyptian fish|egyptian oven fish tray|siniyet samak)\b/i,
      /\b(baked tilapia tray|fish tray with tomato pepper garlic|oven fish with tomato sauce egyptian)\b/i,
      /\u0635\u064a\u0646\u064a\u0629.*\u0633\u0645\u0643|\u0633\u0645\u0643.*(?:\u0641\u0631\u0646|\u0635\u064a\u0646\u064a\u0629)/iu
    ],
    canonicalName: "Egyptian baked fish tray",
    cuisineKey: "egyptian",
    key: "egyptian-baked-fish-tray"
  },
  {
    aliases: [
      /\b(egyptian tilapia tray|tilapia tray with spice mix|baked tilapia bil khalta|siniyet samak balti bil khalta)\b/i,
      /\b(egyptian baked tilapia with khalta|whole tilapia with garlic pepper spice mix)\b/i,
      /(?:\u0635\u064a\u0646\u064a\u0629).*(?:\u0633\u0645\u0643\s*\u0628\u0644\u0637\u064a|\u0628\u0644\u0637\u064a).*(?:\u062e\u0644\u0637\u0629|\u0628\u0647\u0627\u0631\u0627\u062a|\u0641\u0644\u0641\u0644)/iu
    ],
    canonicalName: "Egyptian tilapia tray bil khalta",
    cuisineKey: "egyptian",
    key: "egyptian-tilapia-khalta-tray"
  },
  {
    aliases: [
      /\b(barboon maklee|barboun maklee|egyptian fried red mullet|fried red mullet|fried mullet egyptian)\b/i,
      /\b(red mullet with lemon cumin coriander|egyptian fried whole fish|alexandrian fried mullet)\b/i,
      /(?:\u0628\u0631\u0628\u0648\u0646|\u0633\u0645\u0643).*(?:\u0645\u0642\u0644\u064a|\u0645\u0642\u0631\u0645\u0634|\u0645\u0635\u0631\u064a|\u0627\u0633\u0643\u0646\u062f\u0631\u0627\u0646\u064a)/iu
    ],
    canonicalName: "Barboon Maklee Egyptian fried red mullet",
    cuisineKey: "egyptian",
    key: "barboon-maklee"
  },
  {
    aliases: [
      /\b(egyptian fried fish sandwich|crispy fried fish sandwich egyptian|samak makli sandwich|samak makli pita)\b/i,
      /\b(fried fish pita with tahini|egyptian fish pita|crispy fish pita pocket)\b/i,
      /(?:\u0633\u0645\u0643).*(?:\u0645\u0642\u0644\u064a).*(?:\u0633\u0627\u0646\u062f\u0648\u064a\u062a\u0634|\u0628\u064a\u062a\u0627|\u0637\u062d\u064a\u0646\u0629|\u0639\u064a\u0634)/iu
    ],
    canonicalName: "Egyptian fried fish sandwich",
    cuisineKey: "egyptian",
    key: "egyptian-fried-fish-sandwich"
  },
  {
    aliases: [
      /\b(lemon herb parmesan crusted fish|parmesan crusted fish|herb crusted fish|breadcrumb crusted fish)\b/i,
      /\b(lemon herb fish fillet|white fish parmesan crumb|crispy breadcrumb fish)\b/i,
      /(?:\u0633\u0645\u0643).*(?:\u0628\u0627\u0631\u0645\u064a\u0632\u0627\u0646|\u0628\u0642\u0633\u0645\u0627\u0637|\u0642\u0634\u0631\u0629|\u0644\u064a\u0645\u0648\u0646|\u0623\u0639\u0634\u0627\u0628)/iu
    ],
    canonicalName: "lemon herb Parmesan crusted fish",
    cuisineKey: "western",
    key: "parmesan-crusted-fish"
  },
  {
    aliases: [
      /\b(baked cod with garlic butter|garlic butter cod|lemon garlic butter cod|cod with lemon and parsley)\b/i,
      /\b(oven baked cod lemon butter|baked cod with paprika and parsley|cod fillet garlic butter)\b/i,
      /(?:\u0633\u0645\u0643\s*\u0627\u0644\u0642\u062f|\u0642\u062f).*(?:\u0632\u0628\u062f\u0629|\u062b\u0648\u0645|\u0644\u064a\u0645\u0648\u0646|\u0628\u0642\u062f\u0648\u0646\u0633)/iu
    ],
    canonicalName: "baked cod with garlic butter",
    cuisineKey: "western",
    key: "garlic-butter-cod"
  },
  {
    aliases: [/\b(baked fish with lemon cream sauce|lemon cream baked fish|baked fish lemon cream|creamy lemon baked fish)\b/i],
    canonicalName: "baked fish with lemon cream sauce",
    cuisineKey: "western",
    key: "lemon-cream-baked-fish"
  },
  {
    aliases: [/\b(emergency easy fish|easy lemon butter fish|easy baked fish fillet|quick easy baked fish)\b/i],
    canonicalName: "easy lemon butter fish",
    cuisineKey: "western",
    key: "easy-lemon-butter-fish"
  },
  {
    aliases: [/\b(spicy fish fry|pakistani fish fry|indian spicy fish fry|masala fish fry)\b/i],
    canonicalName: "spicy fish fry",
    cuisineKey: "south-asian",
    key: "spicy-fish-fry"
  },
  {
    aliases: [/\b(skillet garlic butter white fish|garlic butter white fish|skillet white fish)\b/i],
    canonicalName: "skillet garlic butter white fish",
    cuisineKey: "western",
    key: "skillet-garlic-butter-white-fish"
  },
  {
    aliases: [/\b(baked fish with slow cooked peppers|baked fish with peppers|fish with slow cooked peppers)\b/i],
    canonicalName: "baked fish with slow-cooked peppers",
    cuisineKey: "mediterranean",
    key: "baked-fish-peppers"
  },
  {
    aliases: [/\b(creamy fish fillet|creamy fish fillets|fish fillet in cream sauce)\b/i],
    canonicalName: "creamy fish fillet",
    cuisineKey: "western",
    key: "creamy-fish-fillet"
  },
  {
    aliases: [/\b(salt grilled fish|classic salt grilled fish|salt-grilled fish|salt grilled sardines)\b/i],
    canonicalName: "salt-grilled fish",
    cuisineKey: "japanese",
    key: "salt-grilled-fish"
  },
  {
    aliases: [/\b(salt and pepper fish|salt pepper fish|black pepper fish)\b/i],
    canonicalName: "salt and pepper fish",
    cuisineKey: "asian",
    key: "salt-and-pepper-fish"
  },
  {
    aliases: [/\b(herb roasted fish|roasted fish with herbs|whole roasted fish with herbs)\b/i],
    canonicalName: "herb roasted fish",
    cuisineKey: "mediterranean",
    key: "herb-roasted-fish"
  },
  {
    aliases: [/\b(baked fish masala|fish masala|indian baked fish|fish curry masala)\b/i],
    canonicalName: "baked fish masala",
    cuisineKey: "indian",
    key: "baked-fish-masala"
  },
  {
    aliases: [/\b(white fish with brown butter|brown butter white fish|fish with brown butter)\b/i],
    canonicalName: "white fish with brown butter",
    cuisineKey: "western",
    key: "white-fish-brown-butter"
  },
  {
    aliases: [/\b(steamed fish with ginger|ginger steamed fish|steamed white fish ginger)\b/i],
    canonicalName: "steamed fish with ginger",
    cuisineKey: "chinese",
    key: "steamed-fish-ginger"
  },
  {
    aliases: [/\b(baked basa fish|basa fish bake|baked basa fillet)\b/i],
    canonicalName: "baked basa fish",
    cuisineKey: "global",
    key: "baked-basa-fish"
  },
  {
    aliases: [/\b(grilled fish indian|indian grilled fish|tandoori fish|grilled fish masala)\b/i],
    canonicalName: "Indian grilled fish",
    cuisineKey: "indian",
    key: "indian-grilled-fish"
  },
  {
    aliases: [/\b(crispy oven baked fish|oven fried fish|crispy baked fish|oven baked breaded fish)\b/i],
    canonicalName: "crispy oven baked fish",
    cuisineKey: "western",
    key: "crispy-oven-baked-fish"
  },
  {
    aliases: [/\b(honey garlic pan seared fish|honey garlic fish|pan seared honey garlic fish)\b/i],
    canonicalName: "honey garlic pan-seared fish",
    cuisineKey: "asian",
    key: "honey-garlic-fish"
  },
  {
    aliases: [/\b(fish nuggets|crispy fish nuggets|homemade fish nuggets)\b/i],
    canonicalName: "crispy fish nuggets",
    cuisineKey: "american",
    key: "fish-nuggets"
  },
  {
    aliases: [/\b(fish curry|indian fish curry|goan fish curry|fish curry recipe)\b/i],
    canonicalName: "fish curry",
    cuisineKey: "indian",
    key: "fish-curry"
  },
  {
    aliases: [/\b(crispy panko crusted fish|panko crusted fish|panko fish fillets)\b/i],
    canonicalName: "crispy panko crusted fish",
    cuisineKey: "western",
    key: "panko-crusted-fish"
  },
  {
    aliases: [/\b(fried lemon fish|lemon fried fish|fried fish with lemon)\b/i],
    canonicalName: "fried lemon fish",
    cuisineKey: "western",
    key: "fried-lemon-fish"
  },
  {
    aliases: [/\b(italian pan fried fish|italian fish skillet|pan fried fish with tomatoes)\b/i],
    canonicalName: "Italian pan-fried fish",
    cuisineKey: "italian",
    key: "italian-pan-fried-fish"
  },
  {
    aliases: [/\b(seafood bake|seafood bake for two|baked seafood casserole)\b/i],
    canonicalName: "seafood bake",
    cuisineKey: "global",
    key: "seafood-bake"
  },
  {
    aliases: [/\b(seafood pasta|italian seafood pasta|mixed seafood pasta)\b/i],
    canonicalName: "seafood pasta",
    cuisineKey: "italian",
    key: "seafood-pasta"
  },
  {
    aliases: [/\b(seafood creole|shrimp creole|creole seafood stew)\b/i],
    canonicalName: "seafood Creole",
    cuisineKey: "cajun",
    key: "seafood-creole"
  },
  {
    aliases: [/\b(seafood bicol express|bicol express seafood|filipino seafood bicol)\b/i],
    canonicalName: "seafood Bicol Express",
    cuisineKey: "filipino",
    key: "seafood-bicol-express"
  },
  {
    aliases: [/\b(seafood salad|mixed seafood salad|easy seafood salad)\b/i],
    canonicalName: "seafood salad",
    cuisineKey: "global",
    key: "seafood-salad"
  },
  {
    aliases: [/\b(creamy italian seafood bake|creamy seafood bake|italian garlic seafood bake)\b/i],
    canonicalName: "creamy Italian seafood bake",
    cuisineKey: "italian",
    key: "creamy-seafood-bake"
  },
  {
    aliases: [/\b(grilled seafood medley|mixed grilled seafood|grilled seafood platter)\b/i],
    canonicalName: "grilled seafood medley",
    cuisineKey: "mediterranean",
    key: "grilled-seafood-medley"
  },
  {
    aliases: [/\b(spicy tomato seafood pasta|tomato seafood pasta|spicy seafood spaghetti)\b/i],
    canonicalName: "spicy tomato seafood pasta",
    cuisineKey: "italian",
    key: "spicy-tomato-seafood-pasta"
  },
  {
    aliases: [
      /\b(ful bil zeit|ful bel zeit|foul bil zeit|foul bel zeit|fava beans with olive oil|lebanese ful bil zeit|syrian ful bil zeit)\b/i,
      /\b(ful with oil|foul with oil|fava beans in olive oil)\b/i,
      /\u0641\u0648\u0644.*(?:\u0628\u0627\u0644\u0632\u064a\u062a|\u0632\u064a\u062a)/iu
    ],
    canonicalName: "ful bil zeit",
    cuisineKey: "middle-eastern",
    key: "ful-bil-zeit"
  },
  {
    aliases: [
      /\b(spicy ful bil zeit|hot oil ful|ful with hot oil|arabiata ful|arabiata style ful)\b/i,
      /\b(ful tahini lemon cumin|ful with tahini lemon cumin|fava beans hot oil tahini)\b/i,
      /\u0641\u0648\u0644.*(?:\u0627\u0644\u0632\u064a\u062a\s+\u0627\u0644\u062d\u0627\u0631|\u0632\u064a\u062a\s+\u062d\u0627\u0631|\u0637\u062d\u064a\u0646\u0629|\u0644\u064a\u0645\u0648\u0646|\u0643\u0645\u0648\u0646)/iu
    ],
    canonicalName: "spicy ful bil zeit",
    cuisineKey: "egyptian",
    key: "spicy-ful-bil-zeit"
  },
  {
    aliases: [
      /\b(alexandrian ful|ful iskandarani|ful eskandarani|alexandrian fava beans)\b/i,
      /\b(ful with tomato pepper|fava beans with tomato pepper)\b/i,
      /\u0641\u0648\u0644.*(?:\u0627\u0633\u0643\u0646\u062f\u0631\u0627\u0646\u064a|\u0625\u0633\u0643\u0646\u062f\u0631\u0627\u0646\u064a|\u0637\u0645\u0627\u0637\u0645|\u0641\u0644\u0641\u0644)/iu
    ],
    canonicalName: "Alexandrian ful",
    cuisineKey: "egyptian",
    key: "alexandrian-ful"
  },
  {
    aliases: [
      /\b(ful with fried egg|ful with egg|foul with egg|fava beans with fried egg)\b/i,
      /\b(ful medames with egg|ful topped with egg)\b/i,
      /\u0641\u0648\u0644.*(?:\u0628\u0627\u0644\u0628\u064a\u0636|\u0628\u064a\u0636\s+\u0645\u0642\u0644\u064a|\u0628\u064a\u0636)/iu
    ],
    canonicalName: "ful with fried egg",
    cuisineKey: "egyptian",
    key: "ful-with-fried-egg"
  },
  {
    aliases: [
      /\b(ful tagine with eggs and cheese|foul tagine with eggs and cheese|fava bean tagine eggs cheese)\b/i,
      /\b(ful with eggs and cheese|foul with eggs cheese)\b/i,
      /\u0641\u0648\u0644.*(?:\u0628\u0627\u0644\u0628\u064a\u0636|\u0628\u064a\u0636).*(?:\u062c\u0628\u0646|\u062c\u0628\u0646\u0629)/iu
    ],
    canonicalName: "ful tagine with eggs and cheese",
    cuisineKey: "egyptian",
    key: "ful-eggs-cheese-tagine"
  },
  {
    aliases: [
      /\b(ful tray with eggs and sausage|ful with eggs and sausage|foul with eggs sausage|fava beans eggs sausage)\b/i,
      /\b(ful tagine with eggs and sausage|foul tagine eggs sausage)\b/i,
      /\u0641\u0648\u0644.*(?:\u0628\u0627\u0644\u0628\u064a\u0636|\u0628\u064a\u0636).*(?:\u0633\u062c\u0642|\u0633\u0648\u0633\u064a\u0633|\u0646\u0642\u0627\u0646\u0642)/iu
    ],
    canonicalName: "ful tray with eggs and sausage",
    cuisineKey: "egyptian",
    key: "ful-eggs-sausage-tray"
  },
  {
    aliases: [
      /\b(ful tagine with eggs and basterma|ful with eggs and basterma|ful with eggs and pastrami|fava beans eggs pastrami)\b/i,
      /\b(foul tagine eggs basterma|foul with eggs pastrami)\b/i,
      /\u0641\u0648\u0644.*(?:\u0628\u0627\u0644\u0628\u064a\u0636|\u0628\u064a\u0636).*(?:\u0628\u0633\u0637\u0631\u0645\u0629|\u0628\u0627\u0633\u0637\u0631\u0645\u0629)/iu
    ],
    canonicalName: "ful tagine with eggs and basterma",
    cuisineKey: "egyptian",
    key: "ful-eggs-basterma-tagine"
  },
  {
    aliases: [
      /\b(ful sandwich|foul sandwich|fava bean sandwich|ful baladi bread|foul baladi bread)\b/i,
      /\u0641\u0648\u0644.*(?:\u0633\u0627\u0646\u062f\u0648\u064a\u062a\u0634|\u0639\u064a\u0634|\u062e\u0628\u0632|\u0628\u0644\u062f\u064a)/iu
    ],
    canonicalName: "ful sandwich",
    cuisineKey: "egyptian",
    key: "ful-sandwich"
  },
  {
    aliases: [
      /\b(ful medames|foul medames|ful mudammas|foul mudammas|ful mudamas|foul mudamas|ful|foul|medames|mudammas|mudamas)\b/i,
      /\bfava bean/i,
      new RegExp(`${ARABIC.fava}(?:\\s+${ARABIC.egypt}|\\s+\\u0645\\u062f\\u0645\\u0633)?`, "iu")
    ],
    canonicalName: "ful medames",
    cuisineKey: "egyptian",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/b/bf/Ful_medames_%28arabic_meal%29.jpg",
    key: "ful-medames"
  },
  {
    aliases: [
      /\b(eggs with basterma|eggs with pastrami|basterma and eggs|pastrami and eggs|egyptian eggs basterma)\b/i,
      /\b(beid bel basterma|beid bil basterma|bayd bel basterma)\b/i,
      /\u0628\u064a\u0636.*(?:\u0628\u0627\u0644\u0628\u0633\u0637\u0631\u0645\u0629|\u0628\u0633\u0637\u0631\u0645\u0629|\u0628\u0627\u0633\u0637\u0631\u0645\u0629)/iu
    ],
    canonicalName: "eggs with basterma",
    cuisineKey: "egyptian",
    key: "eggs-with-basterma"
  },
  {
    aliases: [
      /\b(sunny side eggs with meat|fried eggs with meat|eggs with minced meat|eggs with ground meat)\b/i,
      /\b(eggs with beef|eggs with lamb|meat and eggs breakfast)\b/i,
      /\u0628\u064a\u0636.*(?:\u0639\u064a\u0648\u0646).*(?:\u0644\u062d\u0645|\u0644\u062d\u0645\u0629)/iu
    ],
    canonicalName: "sunny-side eggs with meat",
    cuisineKey: "middle-eastern",
    key: "sunny-eggs-with-meat"
  },
  {
    aliases: [
      /\b(sunny side eggs with red pepper|fried eggs with red pepper|eggs with red pepper|pepper fried eggs)\b/i,
      /\u0628\u064a\u0636.*(?:\u0639\u064a\u0648\u0646).*(?:\u0641\u0644\u0641\u0644\s+\u0623\u062d\u0645\u0631|\u0641\u0644\u0641\u0644)/iu
    ],
    canonicalName: "sunny-side eggs with red pepper",
    cuisineKey: "middle-eastern",
    key: "sunny-eggs-red-pepper"
  },
  {
    aliases: [
      /\b(sunny side eggs with sausage|fried eggs with sausage|eggs with sausage)\b/i,
      /\u0628\u064a\u0636.*(?:\u0639\u064a\u0648\u0646).*(?:\u0633\u062c\u0642|\u0633\u0648\u0633\u064a\u0633|\u0646\u0642\u0627\u0646\u0642)/iu
    ],
    canonicalName: "sunny-side eggs with sausage",
    cuisineKey: "middle-eastern",
    key: "sunny-eggs-with-sausage"
  },
  {
    aliases: [
      /\b(avocado tomato (?:sourdough )?toast|avocado (?:and )?tomato toast|sourdough avocado tomato toast)\b/i,
      /\b(tomato avocado (?:sourdough )?toast|avocado toast with tomato)\b/i,
      /(?:\u0623\u0641\u0648\u0643\u0627\u062f\u0648|\u0627\u0641\u0648\u0643\u0627\u062f\u0648).*(?:\u0637\u0645\u0627\u0637\u0645|\u0628\u0646\u062f\u0648\u0631(?:\u0629|\u0647)).*(?:\u0633\u0627\u0648\u0631\u062f\u0648\u063a|\u062a\u0648\u0633\u062a|\u062e\u0628\u0632)/iu,
      /(?:\u062a\u0648\u0633\u062a|\u062e\u0628\u0632).*(?:\u0623\u0641\u0648\u0643\u0627\u062f\u0648|\u0627\u0641\u0648\u0643\u0627\u062f\u0648).*(?:\u0637\u0645\u0627\u0637\u0645|\u0628\u0646\u062f\u0648\u0631(?:\u0629|\u0647))/iu
    ],
    canonicalName: "avocado tomato sourdough toast",
    cuisineKey: "western",
    key: "avocado-tomato-toast"
  },
  {
    aliases: [
      /\b(sunny side eggs with avocado toast|eggs with avocado toast|avocado toast with fried egg|fried egg avocado toast)\b/i,
      /\u0628\u064a\u0636.*(?:\u0639\u064a\u0648\u0646).*(?:\u0623\u0641\u0648\u0643\u0627\u062f\u0648|\u0627\u0641\u0648\u0643\u0627\u062f\u0648|\u062a\u0648\u0633\u062a)/iu
    ],
    canonicalName: "sunny-side eggs with avocado toast",
    cuisineKey: "western",
    key: "sunny-eggs-avocado-toast"
  },
  {
    aliases: [
      /\b(eggs with mushroom|eggs with mushrooms|mushroom eggs|mushroom omelet|mushroom omelette)\b/i,
      /\b(fried eggs with mushrooms|diet mushroom eggs)\b/i,
      /\u0628\u064a\u0636.*(?:\u0628\u0627\u0644\u0645\u0634\u0631\u0648\u0645|\u0645\u0634\u0631\u0648\u0645|\u0641\u0637\u0631)/iu
    ],
    canonicalName: "eggs with mushrooms",
    cuisineKey: "western",
    key: "eggs-with-mushrooms"
  },
  {
    aliases: [
      /\b(egg mushroom sandwich|mushroom egg sandwich|eggs and mushroom sandwich|egg mushroom toast)\b/i,
      /\b(mushroom omelet sandwich|mushroom omelette sandwich)\b/i,
      /\u0628\u064a\u0636.*(?:\u0645\u0634\u0631\u0648\u0645|\u0641\u0637\u0631).*(?:\u0633\u0627\u0646\u062f\u0648\u064a\u062a\u0634|\u062a\u0648\u0633\u062a|\u0639\u064a\u0634|\u062e\u0628\u0632)/iu
    ],
    canonicalName: "egg mushroom sandwich",
    cuisineKey: "western",
    key: "egg-mushroom-sandwich"
  },
  {
    aliases: [
      /\b(fried egg with onion|fried eggs with onion|eggs with onion|onion fried eggs)\b/i,
      /\b(sunny side eggs with onion|egg onion skillet)\b/i,
      /\u0628\u064a\u0636.*(?:\u0628\u0627\u0644\u0628\u0635\u0644|\u0628\u0635\u0644)/iu
    ],
    canonicalName: "fried eggs with onion",
    cuisineKey: "middle-eastern",
    key: "fried-eggs-with-onion"
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
  { key: "eggplant", pattern: /\beggplant|aubergine\b|\u0628\u0627\u0630\u0646\u062c\u0627\u0646|\u0628\u062a\u0646\u062c\u0627\u0646|\u0628\u0627\u0646\u062c\u0627\u0646/iu },
  { key: "avocado", pattern: /\bavocado\b|\u0623\u0641\u0648\u0643\u0627\u062f\u0648|\u0627\u0641\u0648\u0643\u0627\u062f\u0648/iu },
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
  { key: "pasta", pattern: new RegExp(`\\bpasta|spaghetti|penne|fettuccine|macaroni\\b|${ARABIC.pasta}`, "iu") },
  { key: "noodles", pattern: /\bnoodle|noodles|ramen|udon|soba\b/iu },
  { key: "rice", pattern: new RegExp(`\\brice\\b|${ARABIC.rice}`, "iu") },
  { key: "bulgur", pattern: /\bbulgur|burghul|borghol\b/iu },
  { key: "potato", pattern: /\bpotato|potatoes\b/iu },
  {
    key: "bread",
    pattern: /\bbread|toast|bun|roll|wrap\b|\u062a\u0648\u0633\u062a|\u0633\u0627\u0648\u0631\u062f\u0648\u063a|\u0633\u0648\u0631\u062f\u0648|\u062e\u0628\u0632|\u0639\u064a\u0634/iu
  }
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
  { key: "pasta", pattern: new RegExp(`\\bpasta|spaghetti|penne|fettuccine|macaroni\\b|${ARABIC.pasta}`, "iu") },
  { key: "noodles", pattern: /\bnoodle|noodles|ramen|udon|soba\b/iu },
  { key: "salad", pattern: /\bsalad\b/iu },
  { key: "soup", pattern: new RegExp(`\\bsoup\\b|${ARABIC.soup}`, "iu") },
  { key: "stew", pattern: new RegExp(`\\bstew\\b|${ARABIC.stew}`, "iu") },
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

export interface RecipePhotoIdentityOverride {
  dishSlug?: string;
  cuisineKey?: string;
  protein?: string;
  starch?: string;
  sauce?: string;
  method?: string;
}

export function buildRecipePhotoIdentity(
  query: string,
  override?: RecipePhotoIdentityOverride
): RecipePhotoIdentity {
  const cleanQuery = normalizeRecipePhotoQuery(query);
  const knownDish = findKnownDish(cleanQuery);
  const overrideDishKey = override?.dishSlug?.trim() || undefined;
  const canonicalDishKey = overrideDishKey ?? knownDish?.key;
  const cuisineKey = override?.cuisineKey?.trim() || knownDish?.cuisineKey || detectCuisine(cleanQuery);
  const mainIngredientKey = override?.protein?.trim() || detectMainIngredient(cleanQuery);
  const beanTypeKey = detectBeanType(cleanQuery);
  const sauceKey = override?.sauce?.trim() || detectSauce(cleanQuery);
  const starchKey = override?.starch?.trim() || detectStarch(cleanQuery);
  const cookingMethodKey = override?.method?.trim() || detectCookingMethod(cleanQuery);
  const mealTypeKey = detectMealType(cleanQuery);
  const familyKey =
    canonicalDishKey ??
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
    canonicalDishKey,
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
    canonicalDishKey,
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
    canonicalDishKey,
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
  if (details.mainIngredientKey === "chicken") {
    if (/\bshawarma\b/iu.test(cleanQuery) || /\u0634\u0627\u0648\u0631\u0645\u0627/iu.test(cleanQuery)) return "chicken-shawarma";
    if (/\bbutter chicken\b/iu.test(cleanQuery)) return "butter-chicken";
    if (/\b(garlic butter|lemon garlic butter)\b/iu.test(cleanQuery)) return "garlic-butter-chicken";
    if (/\bkung pao\b/iu.test(cleanQuery)) return "kung-pao-chicken";
    if (/\b(korean fried|korean crispy)\b/iu.test(cleanQuery)) return "korean-fried-chicken";
    if (/\b(soy garlic|garlic soy)\b/iu.test(cleanQuery)) return "soy-garlic-chicken";
    if (/\b(buttermilk fried|southern fried|fried chicken|crispy chicken)\b/iu.test(cleanQuery)) return "southern-fried-chicken";
    if (/\bcilantro lime|coriander lime\b/iu.test(cleanQuery)) return "cilantro-lime-chicken";
    if (/\b(creamy spinach|florentine|spinach chicken)\b/iu.test(cleanQuery)) return "creamy-spinach-chicken";
    if (/\bsumac\b/iu.test(cleanQuery)) return "sumac-chicken";
    if (/\b(desi gravy|indian chicken gravy)\b/iu.test(cleanQuery)) return "desi-gravy-chicken";
    if (/\b(chicken and rice skillet|chicken rice skillet|chicken and rice tray|chicken rice tray)\b/iu.test(cleanQuery)) return "chicken-rice-skillet";
    if (/\b(roast chicken|roasted chicken|whole roasted chicken)\b/iu.test(cleanQuery)) return "roast-chicken";
  }
  if (details.mainIngredientKey === "beef") {
    if (/\bshawarma\b/iu.test(cleanQuery) || /\u0634\u0627\u0648\u0631\u0645\u0627/iu.test(cleanQuery)) return "beef-shawarma";
    if (/\bmongolian\b/iu.test(cleanQuery)) return "mongolian-beef";
    if (/\b(beef and onion|beef onion|with onions|onion stir)\b/iu.test(cleanQuery)) return "chinese-beef-onion";
    if (/\bbourguignon|burgundy\b/iu.test(cleanQuery)) return "beef-bourguignon";
    if (/\bbeef stew|stovetop beef stew|potato stew\b/iu.test(cleanQuery)) return "classic-beef-stew";
    if (/\bbroccoli\b/iu.test(cleanQuery)) return "beef-and-broccoli";
    if (/\broast beef|beef tenderloin|corned beef roast\b/iu.test(cleanQuery)) return "roast-beef";
    if (/\bblack pepper\b/iu.test(cleanQuery)) return "black-pepper-beef";
    if (/\b(steak bites|garlic butter)\b/iu.test(cleanQuery)) return "garlic-butter-steak-bites";
    if (/\bfrench onion\b/iu.test(cleanQuery)) return "french-onion-braised-beef";
    if (/\bcrispy ginger|ginger beef\b/iu.test(cleanQuery)) return "crispy-ginger-beef";
    if (/\bkorean ground beef|korean beef rice\b/iu.test(cleanQuery)) return "korean-ground-beef-bowl";
    if (/\bstroganoff\b/iu.test(cleanQuery)) return "beef-stroganoff";
    if (/\bpepper steak\b/iu.test(cleanQuery)) return "pepper-steak";
    if (/\bitalian (?:shredded )?beef|shredded beef\b/iu.test(cleanQuery)) return "italian-shredded-beef";
  }
  if (details.mainIngredientKey === "shrimp" || /\b(shrimp|prawn|prawns)\b/iu.test(cleanQuery)) {
    if (/\boyster sauce\b/iu.test(cleanQuery)) return "shrimp-oyster-sauce";
    if (/\bhoney garlic\b/iu.test(cleanQuery)) return "honey-garlic-shrimp";
    if (/\bgarlic butter|grilled shrimp with garlic butter\b/iu.test(cleanQuery)) return "garlic-butter-shrimp";
    if (/\blemon garlic\b/iu.test(cleanQuery)) return "lemon-garlic-shrimp";
    if (/\bcajun honey\b/iu.test(cleanQuery)) return "cajun-honey-shrimp";
    if (/\bcajun\b/iu.test(cleanQuery)) return "cajun-shrimp";
    if (/\bpan[- ]?seared|seared shrimp\b/iu.test(cleanQuery)) return "pan-seared-shrimp";
    if (/\bspaghetti|linguine|pasta\b/iu.test(cleanQuery)) return "shrimp-spaghetti";
    if (/\bquinoa\b/iu.test(cleanQuery)) return "garlic-shrimp-quinoa";
    if (/\bboom boom|bang bang\b/iu.test(cleanQuery)) return "boom-boom-shrimp";
    if (/\bdrunken\b/iu.test(cleanQuery)) return "drunken-shrimp";
    if (/\bhead[- ]?on\b/iu.test(cleanQuery)) return "head-on-spicy-garlic-shrimp";
    if (/\bspicy grilled\b/iu.test(cleanQuery)) return "spicy-grilled-shrimp";
    if (/\bbutterfly|butterflied\b/iu.test(cleanQuery)) return "butterfly-shrimp";
    if (/\bcoconut\b/iu.test(cleanQuery)) return "coconut-shrimp";
    if (/\bportuguese|mozambique|piri piri\b/iu.test(cleanQuery)) return "portuguese-garlic-shrimp";
    if (/\bfried|crispy|breaded\b/iu.test(cleanQuery)) return "fried-shrimp";
    if (/\bsoup|broth\b/iu.test(cleanQuery)) return "shrimp-soup";
    if (/\bgarlic shrimp\b/iu.test(cleanQuery)) return "simple-garlic-shrimp";
  }
  if (/\b(beef and lamb shawarma|beef lamb shawarma|mixed meat shawarma|mixed shawarma|lamb and beef shawarma)\b/iu.test(cleanQuery)) return "beef-lamb-shawarma";
  if ((/\bshawarma\b/iu.test(cleanQuery) || /\u0634\u0627\u0648\u0631\u0645\u0627/iu.test(cleanQuery)) && details.mainIngredientKey === "lamb") return "lamb-shawarma";
  if ((/\bshawarma\b/iu.test(cleanQuery) || /\u0634\u0627\u0648\u0631\u0645\u0627/iu.test(cleanQuery)) && details.mainIngredientKey === "chicken") return "chicken-shawarma";
  if (details.mainIngredientKey === "chicken" && details.mealTypeKey === "tagine") return "chicken-tagine";
  if (details.mainIngredientKey === "chicken" && details.mealTypeKey === "grill") return "grilled-chicken";
  if (details.mainIngredientKey === "fish" && details.mealTypeKey === "salad") return "salmon-salad";
  if (details.mainIngredientKey === "fish") {
    if (/\bflorentine|creamed spinach\b/iu.test(cleanQuery)) return "fish-florentine";
    if (/\blemon cream\b/iu.test(cleanQuery)) return "lemon-cream-baked-fish";
    if (/\beasy lemon butter|emergency easy\b/iu.test(cleanQuery)) return "easy-lemon-butter-fish";
    if (/\bspicy fish fry|masala fish fry|pakistani fish fry\b/iu.test(cleanQuery)) return "spicy-fish-fry";
    if (/\bgarlic butter white fish|skillet white fish\b/iu.test(cleanQuery)) return "skillet-garlic-butter-white-fish";
    if (/\bslow[- ]?cooked peppers|with peppers\b/iu.test(cleanQuery)) return "baked-fish-peppers";
    if (/\bcreamy fish fillet|cream sauce\b/iu.test(cleanQuery)) return "creamy-fish-fillet";
    if (/\bsalt[- ]?grilled\b/iu.test(cleanQuery)) return "salt-grilled-fish";
    if (/\bsalt and pepper\b/iu.test(cleanQuery)) return "salt-and-pepper-fish";
    if (/\bherb roasted\b/iu.test(cleanQuery)) return "herb-roasted-fish";
    if (/\bbaked fish masala|fish masala\b/iu.test(cleanQuery)) return "baked-fish-masala";
    if (/\bbrown butter\b/iu.test(cleanQuery)) return "white-fish-brown-butter";
    if (/\bsteamed fish with ginger|ginger steamed\b/iu.test(cleanQuery)) return "steamed-fish-ginger";
    if (/\bbasa\b/iu.test(cleanQuery)) return "baked-basa-fish";
    if (/\bindian grilled|tandoori fish\b/iu.test(cleanQuery)) return "indian-grilled-fish";
    if (/\bcrispy oven|oven fried|breaded fish\b/iu.test(cleanQuery)) return "crispy-oven-baked-fish";
    if (/\bhoney garlic\b/iu.test(cleanQuery)) return "honey-garlic-fish";
    if (/\bfish nuggets?\b/iu.test(cleanQuery)) return "fish-nuggets";
    if (/\bfish curry\b/iu.test(cleanQuery)) return "fish-curry";
    if (/\bpanko\b/iu.test(cleanQuery)) return "panko-crusted-fish";
    if (/\bfried lemon\b/iu.test(cleanQuery)) return "fried-lemon-fish";
    if (/\bitalian pan[- ]?fried|tomatoes\b/iu.test(cleanQuery)) return "italian-pan-fried-fish";
  }
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
    case "avocado-tomato-toast":
      return [
        withCuisine("avocado tomato sourdough toast"),
        withCuisine("avocado tomato toast"),
        withCuisine("sourdough avocado toast tomato")
      ];
    case "chicken-shawarma":
    case "chicken-shawarma-bowl":
      return [
        withCuisine("chicken shawarma"),
        withCuisine("chicken shawarma bowl"),
        withCuisine("chicken shawarma wrap"),
        withCuisine("shawarma plate")
      ];
    case "beef-shawarma":
      return [withCuisine("beef shawarma"), withCuisine("beef shawarma wrap"), withCuisine("beef shawarma plate")];
    case "lamb-shawarma":
      return [withCuisine("lamb shawarma"), withCuisine("lamb shawarma wrap"), withCuisine("lamb shawarma bowl")];
    case "beef-lamb-shawarma":
      return [withCuisine("beef and lamb shawarma"), withCuisine("mixed meat shawarma"), withCuisine("shawarma wrap")];
    case "chicken-tagine":
      return [withCuisine("chicken tagine"), withCuisine("moroccan chicken"), withCuisine("chicken vegetable tagine")];
    case "grilled-chicken":
      return [withCuisine("grilled chicken plate"), withCuisine("grilled chicken breast"), withCuisine("roasted chicken vegetables")];
    case "roast-chicken":
      return [withCuisine("roast chicken"), withCuisine("roasted chicken"), withCuisine("whole roasted chicken")];
    case "butter-chicken":
      return [withCuisine("butter chicken"), withCuisine("indian butter chicken"), withCuisine("chicken makhani")];
    case "garlic-butter-chicken":
      return [withCuisine("garlic butter chicken"), withCuisine("lemon garlic butter chicken"), withCuisine("skillet chicken breast")];
    case "kung-pao-chicken":
      return [withCuisine("kung pao chicken"), withCuisine("chinese kung pao chicken"), withCuisine("chicken peanut stir fry")];
    case "southern-fried-chicken":
      return [withCuisine("southern fried chicken"), withCuisine("buttermilk fried chicken"), withCuisine("crispy fried chicken")];
    case "cilantro-lime-chicken":
      return [withCuisine("cilantro lime chicken"), withCuisine("grilled cilantro lime chicken"), withCuisine("lime chicken")];
    case "creamy-spinach-chicken":
      return [withCuisine("creamy spinach chicken"), withCuisine("chicken florentine"), withCuisine("spinach cream chicken")];
    case "sumac-chicken":
      return [withCuisine("sumac chicken"), withCuisine("middle eastern sumac chicken"), withCuisine("roasted sumac chicken")];
    case "desi-gravy-chicken":
      return [withCuisine("desi gravy chicken"), withCuisine("indian chicken gravy"), withCuisine("chicken curry gravy")];
    case "korean-fried-chicken":
      return [withCuisine("korean fried chicken"), withCuisine("korean crispy chicken"), withCuisine("gochujang fried chicken")];
    case "soy-garlic-chicken":
      return [withCuisine("soy garlic chicken"), withCuisine("garlic soy chicken"), withCuisine("asian soy garlic chicken")];
    case "chicken-rice-skillet":
      return [withCuisine("chicken and rice skillet"), withCuisine("chicken rice skillet"), withCuisine("chicken and rice")];
    case "mongolian-beef":
      return [withCuisine("Mongolian beef"), withCuisine("beef strips stir fry"), withCuisine("asian beef stir fry")];
    case "chinese-beef-onion":
      return [withCuisine("Chinese beef and onion stir fry"), withCuisine("beef with onions"), withCuisine("beef onion stir fry")];
    case "beef-bourguignon":
      return [withCuisine("beef bourguignon"), withCuisine("boeuf bourguignon"), withCuisine("beef burgundy stew")];
    case "classic-beef-stew":
      return [withCuisine("classic beef stew"), withCuisine("beef stew potatoes carrots"), withCuisine("stovetop beef stew")];
    case "beef-and-broccoli":
      return [withCuisine("beef and broccoli"), withCuisine("broccoli beef stir fry"), withCuisine("chinese beef broccoli")];
    case "roast-beef":
      return [withCuisine("roast beef"), withCuisine("beef tenderloin roast"), withCuisine("sliced roast beef")];
    case "black-pepper-beef":
      return [withCuisine("black pepper beef"), withCuisine("beef pepper stir fry"), withCuisine("asian black pepper beef")];
    case "garlic-butter-steak-bites":
      return [withCuisine("garlic butter steak bites"), withCuisine("steak bites"), withCuisine("garlic beef bites")];
    case "french-onion-braised-beef":
      return [withCuisine("French onion braised beef"), withCuisine("french onion beef"), withCuisine("braised beef onions")];
    case "crispy-ginger-beef":
      return [withCuisine("crispy ginger beef"), withCuisine("ginger beef"), withCuisine("crispy beef strips")];
    case "korean-ground-beef-bowl":
      return [withCuisine("Korean ground beef bowl"), withCuisine("korean ground beef"), withCuisine("korean beef rice bowl")];
    case "beef-stroganoff":
      return [withCuisine("beef stroganoff"), withCuisine("beef mushroom stroganoff"), withCuisine("stroganoff beef")];
    case "pepper-steak":
      return [withCuisine("pepper steak"), withCuisine("beef pepper steak"), withCuisine("pepper steak stir fry")];
    case "italian-shredded-beef":
      return [withCuisine("Italian shredded beef"), withCuisine("italian beef"), withCuisine("shredded beef sandwich")];
    case "simple-garlic-shrimp":
      return [withCuisine("simple garlic shrimp"), withCuisine("garlic shrimp"), withCuisine("shrimp with garlic")];
    case "shrimp-oyster-sauce":
      return [withCuisine("shrimp with oyster sauce"), withCuisine("oyster sauce shrimp"), withCuisine("filipino shrimp oyster sauce")];
    case "fried-shrimp":
      return [withCuisine("fried shrimp"), withCuisine("crispy fried shrimp"), withCuisine("breaded shrimp")];
    case "honey-garlic-shrimp":
      return [withCuisine("honey garlic shrimp"), withCuisine("garlic honey shrimp"), withCuisine("asian honey shrimp")];
    case "cajun-shrimp":
      return [withCuisine("Cajun shrimp"), withCuisine("cajun butter shrimp"), withCuisine("spicy cajun shrimp")];
    case "pan-seared-shrimp":
      return [withCuisine("pan seared shrimp"), withCuisine("seared shrimp"), withCuisine("pan fried shrimp")];
    case "shrimp-spaghetti":
      return [withCuisine("shrimp spaghetti"), withCuisine("shrimp linguine"), withCuisine("shrimp pasta")];
    case "garlic-butter-shrimp":
      return [withCuisine("garlic butter shrimp"), withCuisine("grilled shrimp garlic butter"), withCuisine("shrimp garlic butter")];
    case "garlic-shrimp-quinoa":
      return [withCuisine("garlic shrimp quinoa"), withCuisine("shrimp quinoa"), withCuisine("garlic shrimp with quinoa")];
    case "lemon-garlic-shrimp":
      return [withCuisine("lemon garlic shrimp"), withCuisine("shrimp with lemon garlic"), withCuisine("garlic lemon shrimp")];
    case "boom-boom-shrimp":
      return [withCuisine("boom boom shrimp"), withCuisine("bang bang shrimp"), withCuisine("crispy boom boom shrimp")];
    case "drunken-shrimp":
      return [withCuisine("drunken shrimp"), withCuisine("wine garlic shrimp"), withCuisine("beer sauce shrimp")];
    case "head-on-spicy-garlic-shrimp":
      return [withCuisine("head-on spicy garlic shrimp"), withCuisine("head-on garlic shrimp"), withCuisine("spicy head-on shrimp")];
    case "spicy-grilled-shrimp":
      return [withCuisine("spicy grilled shrimp"), withCuisine("grilled spicy shrimp"), withCuisine("grilled shrimp chili")];
    case "butterfly-shrimp":
      return [withCuisine("butterfly shrimp"), withCuisine("butterflied shrimp"), withCuisine("butterfly fried shrimp")];
    case "shrimp-soup":
      return [withCuisine("shrimp soup"), withCuisine("shrimp broth soup"), withCuisine("seafood shrimp soup")];
    case "cajun-honey-shrimp":
      return [withCuisine("Cajun honey shrimp"), withCuisine("honey cajun shrimp"), withCuisine("cajun honey butter shrimp")];
    case "portuguese-garlic-shrimp":
      return [withCuisine("Portuguese garlic shrimp"), withCuisine("shrimp Mozambique"), withCuisine("piri piri shrimp")];
    case "coconut-shrimp":
      return [withCuisine("coconut shrimp"), withCuisine("crispy coconut shrimp"), withCuisine("fried coconut shrimp")];
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
    case "orange-beef-lettuce-wraps":
      return [withCuisine("orange beef lettuce wraps"), withCuisine("ground beef lettuce cups"), withCuisine("beef lettuce wraps")];
    case "ground-beef-zucchini-boats":
      return [withCuisine("ground beef zucchini boats"), withCuisine("stuffed zucchini boats ground beef"), withCuisine("beef stuffed zucchini")];
    case "ground-beef-cauliflower-casserole":
      return [withCuisine("ground beef cauliflower casserole"), withCuisine("cheesy beef cauliflower skillet"), withCuisine("beef cauliflower casserole")];
    case "keto-ground-beef-worcestershire":
      return [withCuisine("keto ground beef skillet"), withCuisine("ground beef worcestershire skillet"), withCuisine("ground beef vegetables skillet")];
    case "ground-beef-tacos":
      return [withCuisine("ground beef tacos"), withCuisine("picadillo tacos"), withCuisine("tacos de carne molida")];
    case "ground-beef-burritos":
      return [withCuisine("ground beef burritos"), withCuisine("beef burritos"), withCuisine("burritos de carne molida")];
    case "lasagna-bolognese":
      return [withCuisine("lasagna alla bolognese"), withCuisine("ground beef lasagna"), withCuisine("beef lasagna layers")];
    case "eggplant-tomato-pasta":
      return [withCuisine("eggplant tomato pasta"), withCuisine("pasta alla norma"), withCuisine("aubergine tomato pasta")];
    case "avocado-chickpea-salad-cups":
      return [withCuisine("avocado chickpea salad cups"), withCuisine("chickpea lettuce cups"), withCuisine("avocado chickpea lettuce wraps")];
    case "greek-salad-jar":
      return [withCuisine("Greek salad in a jar"), withCuisine("Greek salad meal prep jar"), withCuisine("cucumber tomato chickpea salad jar")];
    case "roasted-veggie-chickpea-bowl":
      return [withCuisine("roasted vegetable chickpea bowl"), withCuisine("roasted veggie chickpea bowl"), withCuisine("roasted chickpea vegetables")];
    case "cucumber-tomato-avocado-salad":
      return [withCuisine("cucumber tomato avocado salad"), withCuisine("avocado cucumber tomato salad")];
    case "crispy-zucchini-rolls":
      return [withCuisine("crispy zucchini rolls"), withCuisine("zucchini herb rolls"), withCuisine("baked zucchini rolls")];
    case "yiayia-creamy-pasta":
      return [withCuisine("Greek creamy pasta"), withCuisine("creamy tomato pasta"), withCuisine("short pasta creamy tomato sauce")];
    case "spicy-fasolada":
      return [withCuisine("spicy fasolada"), withCuisine("Greek white bean soup"), withCuisine("creamy white bean soup")];
    case "creamy-greek-potato-salad":
      return [withCuisine("creamy Greek potato salad"), withCuisine("Greek potato salad"), withCuisine("potato salad herbs red onion")];
    case "roasted-vegetable-stuffed-shells":
      return [withCuisine("roasted vegetable stuffed shells"), withCuisine("vegetarian stuffed pasta shells"), withCuisine("stuffed shells marinara vegetables")];
    case "zucchini-veggie-bake":
      return [withCuisine("zucchini veggie bake"), withCuisine("zucchini vegetable casserole"), withCuisine("baked zucchini tomato casserole")];
    case "cauliflower-pizza-breadsticks":
      return [withCuisine("cauliflower pizza breadsticks"), withCuisine("cauliflower crust breadsticks"), withCuisine("low carb cauliflower pizza")];
    case "low-carb-eggplant-lasagna":
      return [withCuisine("eggplant lasagna"), withCuisine("low carb eggplant lasagna"), withCuisine("eggplant casserole marinara")];
    case "low-carb-roasted-veggie-pizza":
      return [withCuisine("roasted veggie pizza"), withCuisine("low carb vegetable pizza"), withCuisine("vegetable crust pizza")];
    case "roasted-veggie-tacos":
      return [withCuisine("roasted veggie tacos"), withCuisine("roasted vegetable tacos"), withCuisine("cauliflower sweet potato tacos")];
    case "vegan-palak-tofu":
      return [withCuisine("vegan palak tofu"), withCuisine("tofu spinach curry"), withCuisine("vegan palak paneer tofu")];
    case "vegan-tikka-masala":
      return [withCuisine("vegan tikka masala"), withCuisine("tofu tikka masala"), withCuisine("vegetable tikka masala")];
    case "baingan-bharta":
      return [withCuisine("baingan bharta"), withCuisine("smoky mashed eggplant curry"), withCuisine("indian eggplant bharta")];
    case "crispy-beef-bok-choy-stir-fry":
      return [withCuisine("crispy beef bok choy stir fry"), withCuisine("beef bok choy noodles"), withCuisine("crispy beef stir fry")];
    case "easy-beef-pot-roast":
      return [withCuisine("beef pot roast"), withCuisine("easy beef pot roast"), withCuisine("pot roast potatoes carrots")];
    case "garlic-butter-steak-shrimp":
      return [withCuisine("garlic butter steak and shrimp"), withCuisine("steak and shrimp"), withCuisine("surf and turf steak shrimp")];
    case "italian-meatloaf-marinara":
      return [withCuisine("Italian meatloaf marinara"), withCuisine("meatloaf with marinara"), withCuisine("Italian meatloaf")];
    case "steak-creamy-garlic-sauce":
      return [withCuisine("steak creamy garlic sauce"), withCuisine("creamy garlic steak"), withCuisine("steak with garlic cream sauce")];
    case "coffee-rubbed-strip-steak-chimichurri":
      return [withCuisine("coffee rubbed strip steak chimichurri"), withCuisine("strip steak with chimichurri"), withCuisine("coffee rubbed steak")];
    case "classic-steak-dinner":
      return [withCuisine("classic steak dinner"), withCuisine("steak dinner potatoes asparagus"), withCuisine("steak plate")];
    case "dry-aged-butter-steak":
      return [withCuisine("dry aged butter steak"), withCuisine("dry aged steak"), withCuisine("butter steak")];
    case "tuscan-style-veal-chops":
      return [withCuisine("Tuscan veal chops"), withCuisine("veal chops rosemary sage"), withCuisine("veal chop Italian")];
    case "sticky-bbq-beef-ribs":
      return [withCuisine("sticky barbecue beef ribs"), withCuisine("bbq beef ribs"), withCuisine("glazed beef ribs")];
    case "ribs-hot-pepper-jelly-glaze":
      return [withCuisine("hot pepper jelly ribs"), withCuisine("ribs hot pepper glaze"), withCuisine("glazed ribs")];
    case "slow-grilled-rack-lamb-mustard-herbs":
      return [withCuisine("rack of lamb mustard herbs"), withCuisine("grilled rack of lamb"), withCuisine("lamb rack rosemary")];
    case "florentine-steak-balsamic-rosemary":
      return [withCuisine("Florentine steak rosemary balsamic"), withCuisine("bistecca alla fiorentina"), withCuisine("grilled Florentine steak")];
    case "grilled-ribeye-rosemary-potatoes":
      return [withCuisine("ribeye steak rosemary potatoes"), withCuisine("grilled rib eye steak potatoes"), withCuisine("steak with roasted potatoes")];
    case "sausage-mixed-grill":
      return [withCuisine("sausage mixed grill"), withCuisine("grilled sausage platter"), withCuisine("sausages grilled vegetables")];
    case "churrasco-chimichurri":
      return [withCuisine("churrasco with chimichurri"), withCuisine("steak chimichurri"), withCuisine("grilled churrasco")];
    case "carne-asada-black-beans":
      return [withCuisine("carne asada black beans"), withCuisine("carne asada plate"), withCuisine("grilled carne asada avocado beans")];
    case "kalbi-ribs-grilled-corn":
      return [withCuisine("kalbi ribs grilled corn"), withCuisine("Korean kalbi ribs"), withCuisine("galbi ribs corn")];
    case "sofrito-bolognese":
      return [withCuisine("sofrito bolognese"), withCuisine("pasta with sofrito meat sauce"), withCuisine("spaghetti sofrito bolognese")];
    case "smothered-italian-sausage":
      return [withCuisine("smothered Italian sausage"), withCuisine("Italian sausage peppers tomato"), withCuisine("sausage and peppers")];
    case "frijoles-peruanos":
      return [withCuisine("frijoles peruanos"), withCuisine("Peruvian refried beans"), withCuisine("mayocoba refried beans")];
    case "lamb-chops-agrodolce":
      return [withCuisine("lamb chops agrodolce"), withCuisine("agrodolce lamb chops"), withCuisine("glazed lamb chops walnuts")];
    case "sheet-pan-sausage-corn-peach-cucumber":
      return [withCuisine("sheet pan sausage corn peach cucumber salad"), withCuisine("sausage corn cucumber salad"), withCuisine("summer sausage sheet pan")];
    case "beef-stroganoff-ramen":
      return [withCuisine("beef stroganoff ramen"), withCuisine("stroganoff ramen"), withCuisine("beef mushroom ramen noodles")];
    case "polish-lazanki":
      return [withCuisine("Polish lazanki"), withCuisine("cabbage pasta kielbasa"), withCuisine("lazanki cabbage mushrooms")];
    case "hamburger-stew":
      return [withCuisine("hamburger stew"), withCuisine("ground beef vegetable stew"), withCuisine("hamburger soup potatoes carrots")];
    case "rice-kofta":
      return [withCuisine("egyptian rice kofta"), withCuisine("koftet roz"), withCuisine("rice kofta tomato sauce")];
    case "dawood-basha":
      return [withCuisine("dawood basha"), withCuisine("egyptian meatballs tomato sauce"), withCuisine("kofta dawood basha")];
    case "taagen-kofta":
      return [withCuisine("egyptian kofta tagine"), withCuisine("taagen kofta potatoes"), withCuisine("kofta potato tray")];
    case "moroccan-beef-kofta":
      return [withCuisine("Moroccan beef kofta"), withCuisine("Moroccan kefta kebab"), withCuisine("kefta brochettes")];
    case "lebanese-beef-kofta":
      return [withCuisine("Lebanese beef kofta"), withCuisine("Lebanese kafta"), withCuisine("kafta meshwi")];
    case "beef-kofta-saffron-rice":
      return [withCuisine("beef kofta saffron rice"), withCuisine("kofta with saffron rice"), withCuisine("kofta rice plate")];
    case "beef-kofta-tomato-sauce":
      return [withCuisine("beef kofta tomato sauce"), withCuisine("kofta in tomato sauce"), withCuisine("kofta meatballs red sauce")];
    case "pakistani-beef-kofta-curry":
      return [withCuisine("Pakistani beef kofta curry"), withCuisine("beef kofta curry"), withCuisine("kofta curry")];
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
    case "warak-enab":
      return [withCuisine("warak enab"), withCuisine("stuffed grape leaves"), withCuisine("stuffed vine leaves")];
    case "sarma-dolma":
      return [withCuisine("sarma dolma"), withCuisine("stuffed grape leaves"), withCuisine("stuffed vine leaves")];
    case "mahshi":
      return [withCuisine("mixed mahshi"), withCuisine("egyptian stuffed vegetables"), withCuisine("rice stuffed vegetables")];
    case "kousa-mahshi":
      return [withCuisine("kousa mahshi"), withCuisine("stuffed zucchini"), withCuisine("zucchini mahshi")];
    case "stuffed-cabbage-rolls":
      return [withCuisine("stuffed cabbage rolls"), withCuisine("malfouf mahshi"), withCuisine("cabbage mahshi")];
    case "stuffed-bell-peppers":
      return [withCuisine("stuffed bell peppers"), withCuisine("mahshi peppers"), withCuisine("rice stuffed peppers")];
    case "tomato-mahshi":
      return [withCuisine("tomato mahshi"), withCuisine("stuffed tomatoes"), withCuisine("rice stuffed tomatoes")];
    case "stuffed-eggplant":
      return [withCuisine("stuffed eggplant"), withCuisine("eggplant mahshi"), withCuisine("batenjan mahshi")];
    case "kiymali-pide":
      return [withCuisine("kiymali pide"), withCuisine("turkish beef pide"), withCuisine("turkish minced meat pide")];
    case "lahmacun":
      return [withCuisine("lahmacun"), withCuisine("turkish lahmacun"), withCuisine("thin meat flatbread")];
    case "lahm-ajin":
      return [withCuisine("lahm bi ajin"), withCuisine("lahm ajin"), withCuisine("middle eastern meat flatbread")];
    case "adana-kebab":
      return [withCuisine("adana kebab"), withCuisine("turkish minced meat kebab"), withCuisine("spicy ground lamb kebab")];
    case "adana-durum":
      return [withCuisine("adana durum"), withCuisine("adana kebab wrap"), withCuisine("beyti kebab lavash")];
    case "adana-lahmacun-plate":
      return [withCuisine("adana kebab with lahmacun"), withCuisine("lahmacun and adana kebab"), withCuisine("turkish kebab lahmacun combo")];
    case "cag-kebap":
      return [withCuisine("cag kebap"), withCuisine("erzurum cag kebap"), withCuisine("horizontal lamb kebab")];
    case "doner-kebab":
      return [withCuisine("doner kebab"), withCuisine("turkish doner kebab"), withCuisine("lamb doner")];
    case "iskender-kebab":
      return [withCuisine("iskender kebab"), withCuisine("turkish iskender"), withCuisine("doner tomato yogurt bread")];
    case "turkish-kofta":
      return [withCuisine("turkish kofta"), withCuisine("turkish kofte"), withCuisine("turkish meatballs yogurt sauce")];
    case "karniyarik":
      return [withCuisine("karniyarik"), withCuisine("turkish stuffed eggplant"), withCuisine("eggplant ground beef")];
    case "turkish-spiral-borek":
      return [withCuisine("turkish spiral borek"), withCuisine("ground beef borek"), withCuisine("kol boregi")];
    case "kiymali-tepsi-boregi":
      return [withCuisine("kiymali tepsi boregi"), withCuisine("turkish ground beef phyllo pie"), withCuisine("ground beef borek tray")];
    case "turkish-musakka":
      return [withCuisine("turkish musakka"), withCuisine("turkish eggplant beef casserole"), withCuisine("eggplant beef moussaka")];
    case "turkish-ground-beef-stew":
      return [withCuisine("turkish ground beef stew"), withCuisine("kiymali sebze yemegi"), withCuisine("ground beef vegetable stew turkish")];
    case "turkey-picadillo":
      return [withCuisine("turkey picadillo"), withCuisine("ground turkey picadillo"), withCuisine("latin ground turkey stew")];
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
