interface CuisineVisualReference {
  canonicalName: string;
  cuisine: string;
  imageQueries: string[];
  key: string;
  pantrySignals: string[];
  visualForms: string[];
}

const EGYPTIAN_VISUAL_REFERENCES: CuisineVisualReference[] = [
  {
    key: "kebab-halla",
    canonicalName: "kebab halla",
    cuisine: "Egyptian",
    pantrySignals: ["beef", "lamb", "onion", "pepper", "tomato"],
    visualForms: ["clay-pot meat stew", "onion-rich meat plate", "brown-red braised meat"],
    imageQueries: ["kebab halla egyptian", "egyptian meat stew", "egyptian beef tagine"]
  },
  {
    key: "alexandrian-liver",
    canonicalName: "alexandrian liver",
    cuisine: "Egyptian",
    pantrySignals: ["liver", "kebda", "kibda", "garlic", "pepper", "chili"],
    visualForms: ["pan-fried sliced kebda with bell pepper", "glossy liver pieces with garlic and lemon", "street-style liver filling"],
    imageQueries: ["kebda eskandarani", "alexandrian liver", "egyptian liver sandwich filling", "kibda iskandarani"]
  },
  {
    key: "mahshi-mixed",
    canonicalName: "mixed mahshi",
    cuisine: "Egyptian",
    pantrySignals: ["zucchini", "bell pepper", "cabbage", "vine leaves", "rice"],
    visualForms: ["mixed stuffed vegetables platter", "rice-stuffed vegetables", "mahshi assortment"],
    imageQueries: ["mixed mahshi egyptian", "egyptian stuffed vegetables", "mahshi platter"]
  },
  {
    key: "besara",
    canonicalName: "besara",
    cuisine: "Egyptian",
    pantrySignals: ["fava bean", "broad bean", "herbs", "garlic", "onion"],
    visualForms: ["green bean puree", "savory fava puree bowl", "herb-topped bean mash"],
    imageQueries: ["besara egyptian", "egyptian fava puree", "bessara egyptian"]
  },
  {
    key: "hawawshi",
    canonicalName: "hawawshi",
    cuisine: "Egyptian",
    pantrySignals: ["ground meat", "baladi bread", "pita", "onion", "parsley"],
    visualForms: ["crispy stuffed pita pocket", "stuffed baladi bread wedges", "meat filling visible at cut edge"],
    imageQueries: ["hawawshi egyptian", "egyptian meat stuffed bread", "hawawshi pita"]
  },
  {
    key: "farouj-meshwi",
    canonicalName: "grilled butterflied chicken",
    cuisine: "Egyptian",
    pantrySignals: ["chicken", "garlic", "lemon", "paprika"],
    visualForms: ["butterflied grilled chicken", "charred half chicken platter", "spatchcock chicken"],
    imageQueries: ["egyptian grilled chicken", "butterflied chicken platter", "farouj meshwi"]
  },
  {
    key: "beef-shawarma",
    canonicalName: "beef shawarma wrap",
    cuisine: "Egyptian",
    pantrySignals: ["beef", "meat", "tahini", "pita", "pickles"],
    visualForms: ["thin sliced beef shawarma wrap", "open pita with shaved beef", "shawarma plate with browned beef strips"],
    imageQueries: ["beef shawarma wrap", "egyptian beef shawarma", "beef shawarma plate"]
  },
  {
    key: "chicken-shawarma",
    canonicalName: "chicken shawarma wrap",
    cuisine: "Egyptian",
    pantrySignals: ["chicken", "garlic", "yogurt", "pita", "pickles"],
    visualForms: ["thin sliced chicken shawarma wrap", "open lavash with golden chicken shawarma", "chicken shawarma plate with garlic sauce"],
    imageQueries: ["chicken shawarma wrap", "egyptian chicken shawarma", "chicken shawarma plate"]
  },
  {
    key: "lamb-shawarma",
    canonicalName: "lamb shawarma plate",
    cuisine: "Egyptian",
    pantrySignals: ["lamb", "meat", "tahini", "pita", "pickles"],
    visualForms: ["thin sliced lamb shawarma wrap", "lamb shawarma bowl with visible meat", "shawarma plate with browned lamb strips"],
    imageQueries: ["lamb shawarma wrap", "lamb shawarma plate", "middle eastern lamb shawarma"]
  },
  {
    key: "fried-liver",
    canonicalName: "fried liver strips",
    cuisine: "Egyptian",
    pantrySignals: ["liver", "cornmeal", "flour", "lemon"],
    visualForms: ["breaded liver strips", "fried liver platter", "crispy liver plate"],
    imageQueries: ["fried liver egyptian", "crispy liver strips", "breaded liver plate"]
  },
  {
    key: "koshary",
    canonicalName: "koshary",
    cuisine: "Egyptian",
    pantrySignals: ["rice", "lentil", "pasta", "chickpea", "fried onion"],
    visualForms: ["layered koshary bowl", "lentil rice pasta stack", "tomato-topped koshary"],
    imageQueries: ["koshary egyptian", "egyptian koshary bowl", "lentils rice pasta koshary"]
  },
  {
    key: "kofta",
    canonicalName: "kofta",
    cuisine: "Egyptian",
    pantrySignals: ["ground meat", "parsley", "onion", "garlic", "cumin"],
    visualForms: ["charcoal-grilled kofta skewers", "minced meat logs with char marks", "kofta mashwia platter"],
    imageQueries: ["egyptian kofta mashwia", "kofta kebab egyptian", "grilled kofta platter"]
  },
  {
    key: "rice-kofta",
    canonicalName: "rice kofta",
    cuisine: "Egyptian",
    pantrySignals: ["ground meat", "rice", "parsley", "dill", "cilantro", "tomato sauce"],
    visualForms: ["fried rice kofta in tomato sauce", "kofta fingers in red sauce", "egyptian koftet roz"],
    imageQueries: ["egyptian rice kofta", "koftet roz", "rice kofta tomato sauce"]
  },
  {
    key: "dawood-basha",
    canonicalName: "Dawood Basha",
    cuisine: "Egyptian",
    pantrySignals: ["ground meat", "tomato sauce", "onion", "garlic", "rice"],
    visualForms: ["small meatballs in red tomato sauce", "Egyptian saucy kofta meatballs", "Dawood Basha with rice"],
    imageQueries: ["dawood basha", "egyptian meatballs tomato sauce", "kofta dawood basha"]
  },
  {
    key: "taagen-kofta",
    canonicalName: "taagen kofta",
    cuisine: "Egyptian",
    pantrySignals: ["ground meat", "potato", "tomato sauce", "onion", "pepper"],
    visualForms: ["baked kofta tray", "kofta with potato slices", "tomato-sauce kofta tagine"],
    imageQueries: ["egyptian kofta tagine", "taagen kofta potatoes", "kofta potato tray"]
  },
  {
    key: "macarona-bechamel",
    canonicalName: "macarona bechamel",
    cuisine: "Egyptian",
    pantrySignals: ["ground meat", "pasta", "milk", "flour", "butter"],
    visualForms: ["baked pasta square", "white-topped pasta bake", "layered bechamel pasta"],
    imageQueries: ["macarona bechamel egyptian", "egyptian bechamel pasta", "baked macarona bechamel"]
  },
  {
    key: "fatta",
    canonicalName: "fattah",
    cuisine: "Egyptian",
    pantrySignals: ["rice", "bread", "meat", "garlic", "vinegar", "tomato sauce"],
    visualForms: ["rice bread meat bowl", "fattah layered platter", "tomato-garlic rice with meat"],
    imageQueries: ["fattah egyptian", "egyptian meat rice bread", "fatta meat bowl"]
  },
  {
    key: "hamam-mahshi",
    canonicalName: "hamam mahshi",
    cuisine: "Egyptian",
    pantrySignals: ["pigeon", "bird", "freekeh", "rice"],
    visualForms: ["stuffed pigeon platter", "small stuffed roast birds", "grain-stuffed birds"],
    imageQueries: ["hamam mahshi", "stuffed pigeon egyptian", "egyptian stuffed birds"]
  },
  {
    key: "moussaka",
    canonicalName: "egyptian moussaka",
    cuisine: "Egyptian",
    pantrySignals: ["eggplant", "ground meat", "tomato", "garlic"],
    visualForms: ["red eggplant casserole", "eggplant tomato meat bake", "saucy moussaka tray"],
    imageQueries: ["egyptian moussaka", "eggplant meat tomato bake", "egyptian baked eggplant"]
  },
  {
    key: "liver-sandwiches",
    canonicalName: "liver sandwiches",
    cuisine: "Egyptian",
    pantrySignals: ["liver", "baladi bread", "onion", "pepper", "garlic"],
    visualForms: ["stuffed pita liver sandwiches", "street-style liver pockets", "liver bread wraps"],
    imageQueries: ["egyptian liver sandwiches", "liver pita egyptian", "kibda sandwich"]
  }
];

const TURKISH_VISUAL_REFERENCES: CuisineVisualReference[] = [
  {
    key: "mercimek-corbasi",
    canonicalName: "mercimek corbasi",
    cuisine: "Turkish",
    pantrySignals: ["lentil", "red lentil", "carrot", "onion", "lemon"],
    visualForms: ["silky lentil soup bowl", "golden orange soup", "lemony Turkish soup"],
    imageQueries: ["mercimek corbasi", "turkish lentil soup", "ezogelin or mercimek soup"]
  },
  {
    key: "pogaca",
    canonicalName: "pogaca",
    cuisine: "Turkish",
    pantrySignals: ["flour", "cheese", "feta", "olive", "parsley"],
    visualForms: ["soft stuffed buns", "sesame-topped breakfast rolls", "cheese-filled pastry buns"],
    imageQueries: ["pogaca turkish", "turkish cheese buns", "turkish stuffed breakfast rolls"]
  },
  {
    key: "sucuklu-yumurta",
    canonicalName: "sucuklu yumurta",
    cuisine: "Turkish",
    pantrySignals: ["egg", "sucuk", "sausage", "butter"],
    visualForms: ["eggs with spicy sausage", "pan breakfast eggs", "cast-iron egg skillet"],
    imageQueries: ["sucuklu yumurta", "turkish eggs with sucuk", "turkish sausage eggs skillet"]
  },
  {
    key: "menemen",
    canonicalName: "menemen",
    cuisine: "Turkish",
    pantrySignals: ["egg", "tomato", "pepper", "onion"],
    visualForms: ["tomato egg skillet", "soft scrambled eggs in peppers", "saucy breakfast pan"],
    imageQueries: ["menemen", "turkish menemen", "turkish tomato egg skillet"]
  },
  {
    key: "cilbir",
    canonicalName: "cilbir",
    cuisine: "Turkish",
    pantrySignals: ["egg", "yogurt", "garlic", "butter"],
    visualForms: ["poached eggs over yogurt", "savory yogurt egg bowl", "Turkish breakfast yogurt eggs"],
    imageQueries: ["cilbir", "turkish poached eggs yogurt", "eggs with garlic yogurt turkish"]
  },
  {
    key: "gozleme",
    canonicalName: "gozleme",
    cuisine: "Turkish",
    pantrySignals: ["flour", "cheese", "spinach", "parsley", "potato"],
    visualForms: ["folded griddled flatbread", "crispy stuffed flatbread", "pan-fried pastry squares"],
    imageQueries: ["gozleme turkish", "turkish stuffed flatbread", "cheese gozleme"]
  },
  {
    key: "ispanakli-pide",
    canonicalName: "ispanakli pide",
    cuisine: "Turkish",
    pantrySignals: ["spinach", "cheese", "feta", "dough"],
    visualForms: ["boat-shaped spinach flatbread", "open spinach pide", "baked Turkish spinach bread"],
    imageQueries: ["ispanakli pide", "spinach pide turkish", "turkish spinach flatbread"]
  },
  {
    key: "kiymali-pide",
    canonicalName: "kiymali pide",
    cuisine: "Turkish",
    pantrySignals: ["ground meat", "beef", "lamb", "pepper", "tomato", "dough"],
    visualForms: ["boat-shaped meat flatbread", "open minced meat pide with folded edges", "sliced Turkish beef pide"],
    imageQueries: ["kiymali pide", "turkish beef pide", "turkish minced meat pide"]
  },
  {
    key: "lahmacun",
    canonicalName: "lahmacun",
    cuisine: "Turkish",
    pantrySignals: ["ground meat", "beef", "lamb", "tomato", "pepper", "flatbread"],
    visualForms: ["thin minced meat flatbread", "rolled lahmacun slices", "crisp Turkish meat flatbread"],
    imageQueries: ["lahmacun", "turkish lahmacun", "turkish thin meat flatbread"]
  },
  {
    key: "tavuk-sis",
    canonicalName: "tavuk sis",
    cuisine: "Turkish",
    pantrySignals: ["chicken", "yogurt", "paprika", "lemon", "skewer"],
    visualForms: ["grilled chicken skewers", "charred chicken kebabs", "wooden skewer platter"],
    imageQueries: ["tavuk sis", "turkish chicken skewers", "turkish chicken kebab"]
  },
  {
    key: "adana-kebab",
    canonicalName: "adana kebab",
    cuisine: "Turkish",
    pantrySignals: ["ground meat", "lamb", "beef", "pepper paste", "skewer", "sumac"],
    visualForms: ["long minced meat kebab", "skewer kebab on lavash", "spicy grilled kebab"],
    imageQueries: ["adana kebab", "turkish adana kebab", "spicy turkish kebab"]
  },
  {
    key: "testi-kebabi",
    canonicalName: "testi kebabi",
    cuisine: "Turkish",
    pantrySignals: ["beef", "lamb", "tomato", "pepper", "onion"],
    visualForms: ["clay-pot meat stew", "broken pottery kebab", "capsule-style meat pot"],
    imageQueries: ["testi kebabi", "turkish pottery kebab", "turkish clay pot meat"]
  },
  {
    key: "manti",
    canonicalName: "manti",
    cuisine: "Turkish",
    pantrySignals: ["dumpling", "yogurt", "ground meat", "butter", "sumac"],
    visualForms: ["tiny dumplings with yogurt", "manti in white sauce", "dumpling bowl with paprika butter"],
    imageQueries: ["manti turkish", "turkish dumplings yogurt", "kayseri manti"]
  },
  {
    key: "cig-kofte",
    canonicalName: "cig kofte",
    cuisine: "Turkish",
    pantrySignals: ["bulgur", "pepper paste", "tomato paste", "parsley", "lettuce"],
    visualForms: ["finger-shaped bulgur kofte", "red spiced bulgur bites", "lettuce-lined cig kofte platter"],
    imageQueries: ["cig kofte", "turkish cig kofte", "turkish bulgur kofte"]
  },
  {
    key: "kumpir",
    canonicalName: "kumpir",
    cuisine: "Turkish",
    pantrySignals: ["potato", "corn", "olive", "cheese", "sausage"],
    visualForms: ["loaded baked potato", "stuffed giant potato", "mixed topping baked potato"],
    imageQueries: ["kumpir", "turkish kumpir", "turkish loaded baked potato"]
  },
  {
    key: "hamsili-pilav",
    canonicalName: "hamsili pilav",
    cuisine: "Turkish",
    pantrySignals: ["anchovy", "fish", "rice", "currant", "pine nut"],
    visualForms: ["anchovy-topped rice pie", "round baked fish rice", "ringed anchovy platter"],
    imageQueries: ["hamsili pilav", "turkish anchovy rice", "anchovy pilaf turkish"]
  },
  {
    key: "karniyarik",
    canonicalName: "karniyarik",
    cuisine: "Turkish",
    pantrySignals: ["eggplant", "ground meat", "tomato", "pepper", "garlic"],
    visualForms: ["split eggplant stuffed with minced meat", "whole eggplant with tomato meat filling", "baked eggplant boat"],
    imageQueries: ["karniyarik", "turkish stuffed eggplant", "karniyarik turkish"]
  },
  {
    key: "turkish-spiral-borek",
    canonicalName: "turkish spiral borek",
    cuisine: "Turkish",
    pantrySignals: ["ground meat", "phyllo", "yufka", "onion", "paprika", "parsley"],
    visualForms: ["golden coiled borek", "spiral phyllo pastry with beef", "sliced savory borek coil"],
    imageQueries: ["turkish spiral borek", "ground beef borek", "kol boregi"]
  },
  {
    key: "turkish-musakka",
    canonicalName: "turkish musakka",
    cuisine: "Turkish",
    pantrySignals: ["eggplant", "ground meat", "tomato", "pepper", "bechamel", "cheese"],
    visualForms: ["layered eggplant beef casserole", "turkish musakka slice", "eggplant tomato meat bake"],
    imageQueries: ["turkish musakka", "turkish eggplant ground beef casserole", "eggplant beef moussaka"]
  },
  {
    key: "patlican-kebabi",
    canonicalName: "patlican kebabi",
    cuisine: "Turkish",
    pantrySignals: ["eggplant", "ground meat", "beef", "lamb", "pepper", "tomato"],
    visualForms: ["alternating eggplant meat bake", "eggplant kebab tray", "baked eggplant meat rounds"],
    imageQueries: ["patlican kebabi", "turkish eggplant kebab", "eggplant meat kebab tray"]
  },
  {
    key: "sarma-dolma",
    canonicalName: "sarma and dolma",
    cuisine: "Turkish",
    pantrySignals: ["vine leaves", "zucchini", "pepper", "tomato", "rice"],
    visualForms: ["stuffed vegetables platter", "vine leaf rolls with dolma", "Turkish stuffed vegetables"],
    imageQueries: ["turkish dolma sarma", "turkish stuffed vegetables", "sarma dolma platter"]
  }
];

const MOROCCAN_VISUAL_REFERENCES: CuisineVisualReference[] = [
  {
    key: "moroccan-kebda",
    canonicalName: "moroccan kebda",
    cuisine: "Moroccan",
    pantrySignals: ["liver", "kebda", "garlic", "coriander", "cilantro", "lemon"],
    visualForms: ["pan-browned liver strips with coriander", "glossy kebda with lemon wedges", "liver strips with Moroccan bread"],
    imageQueries: ["moroccan kebda", "moroccan liver strips", "liver coriander lemon"]
  },
  {
    key: "kebda-chermoula",
    canonicalName: "kebda chermoula",
    cuisine: "North African",
    pantrySignals: ["liver", "kebda", "garlic", "tomato", "paprika", "caraway"],
    visualForms: ["liver pieces in red chermoula sauce", "saucy spiced lamb liver", "liver with parsley tomato sauce"],
    imageQueries: ["kebda chermoula", "north african liver chermoula", "algerian liver tomato sauce"]
  },
  {
    key: "moroccan-liver-stew",
    canonicalName: "moroccan liver stew",
    cuisine: "Moroccan",
    pantrySignals: ["liver", "kebda", "onion", "tomato", "parsley", "coriander"],
    visualForms: ["red tomato liver stew", "liver cubes in Moroccan tomato sauce", "kebda mchermla oven dish"],
    imageQueries: ["moroccan liver stew", "kebda mchermla", "moroccan kebda tomato stew"]
  }
];

const AMERICAN_VISUAL_REFERENCES: CuisineVisualReference[] = [
  {
    key: "ground-beef-penne",
    canonicalName: "one-pan ground beef penne",
    cuisine: "American",
    pantrySignals: ["ground beef", "ground meat", "minced meat", "pasta", "penne", "tomato sauce"],
    visualForms: ["penne in red meat sauce", "crumbled ground beef pasta skillet", "tomato-coated beef penne"],
    imageQueries: ["ground beef penne", "beef tomato penne", "one pan beef penne"]
  },
  {
    key: "ground-beef-pasta",
    canonicalName: "ground beef pasta",
    cuisine: "American",
    pantrySignals: ["ground beef", "ground meat", "pasta", "macaroni", "tomato sauce", "zucchini", "bell pepper"],
    visualForms: ["elbow macaroni in red beef sauce", "ground beef pasta with vegetables", "cheesy beef pasta skillet"],
    imageQueries: ["ground beef pasta", "beef macaroni skillet", "hamburger pasta"]
  },
  {
    key: "hamburger-stew",
    canonicalName: "hamburger stew",
    cuisine: "American",
    pantrySignals: ["ground beef", "ground meat", "potato", "carrot", "celery", "tomato"],
    visualForms: ["chunky tomato hamburger stew", "ground beef vegetable stew", "potato carrot beef stew bowl"],
    imageQueries: ["hamburger stew", "ground beef vegetable stew", "hamburger soup potatoes carrots"]
  }
];

const CUISINE_VISUAL_REFERENCES: Record<string, CuisineVisualReference[]> = {
  american: AMERICAN_VISUAL_REFERENCES,
  egyptian: EGYPTIAN_VISUAL_REFERENCES,
  moroccan: MOROCCAN_VISUAL_REFERENCES,
  northafrican: MOROCCAN_VISUAL_REFERENCES,
  turkish: TURKISH_VISUAL_REFERENCES
};

export function getCuisineVisualReferenceText(cuisine: string, limit = 12) {
  const references = getCuisineVisualReferences(cuisine).slice(0, limit);
  if (!references.length) return "";

  return references
    .map((reference) => `${reference.canonicalName} (${reference.visualForms.slice(0, 2).join(", ")})`)
    .join("; ");
}

export function getCuisineVisualReferenceQueries(cuisine: string, pantryLabels: string[]) {
  const references = getCuisineVisualReferences(cuisine);
  if (!references.length) return [];

  const normalizedPantry = pantryLabels
    .map((value) => value.toLowerCase().trim())
    .filter(Boolean);

  return Array.from(
    new Set(
      references
        .filter((reference) =>
          reference.pantrySignals.some((signal) =>
            normalizedPantry.some((label) => label.includes(signal) || signal.includes(label))
          )
        )
        .flatMap((reference) => reference.imageQueries)
    )
  );
}

function getCuisineVisualReferences(cuisine: string) {
  const key = normalizeCuisineVisualKey(cuisine);
  return CUISINE_VISUAL_REFERENCES[key] ?? [];
}

function normalizeCuisineVisualKey(value: string) {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}
