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
    pantrySignals: ["liver", "beef", "garlic", "pepper", "chili"],
    visualForms: ["dark liver strips with peppers", "glossy kebda pieces in garlic chili sauce", "street-style liver filling"],
    imageQueries: ["kebda eskandarani", "alexandrian liver strips", "egyptian kebda liver"]
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
    key: "ful-medames",
    canonicalName: "ful medames",
    cuisine: "Egyptian",
    pantrySignals: ["fava bean", "broad bean", "ful", "egg", "cumin", "lemon", "olive oil"],
    visualForms: ["rustic fava bean bowl with oil", "ful with hot chili oil", "ful with eggs in a shallow bowl"],
    imageQueries: ["ful medames hot oil", "foul medames eggs", "egyptian ful bowl"]
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
    visualForms: ["stuffed baladi bread", "crispy meat bread wedge", "griddled meat pita"],
    imageQueries: ["hawawshi egyptian", "egyptian meat stuffed bread", "baladi hawawshi"]
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
    key: "molokhia",
    canonicalName: "molokhia",
    cuisine: "Egyptian",
    pantrySignals: ["molokhia", "jute leaves", "chicken", "beef", "shrimp", "mushroom", "garlic", "rice"],
    visualForms: ["deep green jute-leaf soup", "molokhia with garlic tasha", "green molokhia bowl with protein"],
    imageQueries: ["egyptian molokhia", "molokhia with chicken and rice", "green molokhia soup garlic"]
  },
  {
    key: "shawarma-burger",
    canonicalName: "shawarma-style beef sandwich",
    cuisine: "Egyptian",
    pantrySignals: ["beef", "onion", "bun", "tahini", "mushroom"],
    visualForms: ["shawarma beef sandwich", "loaded beef burger filling", "sliced beef bun"],
    imageQueries: ["egyptian shawarma sandwich", "beef shawarma burger", "shawarma beef bun"]
  },
  {
    key: "fried-liver",
    canonicalName: "fried liver strips",
    cuisine: "Egyptian",
    pantrySignals: ["liver", "cornmeal", "flour", "lemon"],
    visualForms: ["deep-fried liver slices", "bran-coated kebda strips", "crispy liver plate"],
    imageQueries: ["kebda bel rada", "egyptian fried liver slices", "deep fried kebda liver"]
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
    key: "sayadeya",
    canonicalName: "sayadeya",
    cuisine: "Egyptian",
    pantrySignals: ["fish", "rice", "onion", "tahini", "lemon"],
    visualForms: ["fish with onion-spiced rice", "visible fish over sayadeya rice", "Egyptian coastal fish plate"],
    imageQueries: ["egyptian sayadeya fish rice", "sayadeya fish", "egyptian fish with rice onions"]
  },
  {
    key: "samak-singari",
    canonicalName: "samak singari",
    cuisine: "Egyptian",
    pantrySignals: ["fish", "lemon", "garlic", "herbs", "pepper"],
    visualForms: ["split-open grilled whole fish", "butterflied fish with herbs", "Egyptian grilled fish tray"],
    imageQueries: ["samak singari", "egyptian grilled whole fish", "butterflied grilled fish"]
  },
  {
    key: "alexandrian-shrimp",
    canonicalName: "alexandrian shrimp",
    cuisine: "Egyptian",
    pantrySignals: ["shrimp", "garlic", "tomato", "chili", "lemon"],
    visualForms: ["shrimp in garlic tomato sauce", "coastal shrimp skillet", "visible pink shrimp plate"],
    imageQueries: ["alexandrian shrimp", "egyptian shrimp garlic tomato", "shrimp tomato garlic egyptian"]
  },
  {
    key: "seafood",
    canonicalName: "mixed seafood",
    cuisine: "Egyptian",
    pantrySignals: ["seafood", "fish", "shrimp", "mussels", "clams", "calamari", "rice", "lemon"],
    visualForms: ["recognizable mixed seafood plate", "seafood bake with visible shellfish", "fish and shrimp dish"],
    imageQueries: ["mixed seafood recipe", "seafood bake shrimp fish", "fish shrimp seafood plate"]
  },
  {
    key: "kofta",
    canonicalName: "kofta",
    cuisine: "Egyptian",
    pantrySignals: ["ground meat", "parsley", "onion", "garlic", "cumin"],
    visualForms: ["long minced meat kebab logs", "charred ground-meat skewers", "ridged kofta fingers"],
    imageQueries: ["egyptian kofta kebab skewers", "grilled kofta kebab", "minced meat kofta kebab"]
  },
  {
    key: "eggah",
    canonicalName: "eggah",
    cuisine: "Egyptian",
    pantrySignals: ["egg", "parsley", "onion", "flour", "vegetable"],
    visualForms: ["thick baked egg slice", "Egyptian herb frittata", "golden egg casserole square"],
    imageQueries: ["eggah egyptian", "egyptian eggah frittata", "egyptian baked egg dish"]
  },
  {
    key: "egyptian-chicken",
    canonicalName: "Egyptian chicken plate",
    cuisine: "Egyptian",
    pantrySignals: ["chicken", "garlic", "lemon", "rice", "tomato", "cumin"],
    visualForms: ["visible roasted chicken pieces", "sauced chicken with poultry shape", "grilled chicken plate"],
    imageQueries: ["egyptian chicken recipe", "egyptian roasted chicken", "middle eastern chicken plate"]
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
    visualForms: ["baladi bread stuffed with kebda strips", "street-style liver pockets", "liver bread wraps"],
    imageQueries: ["egyptian kebda sandwich", "liver pita egyptian", "kibda sandwich"]
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
    visualForms: ["poached eggs over garlic yogurt", "red pepper butter over eggs", "Turkish yogurt egg bowl"],
    imageQueries: ["cilbir", "turkish poached eggs garlic yogurt", "cilbir red pepper butter"]
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
    visualForms: ["boat-shaped meat flatbread", "open minced meat pide", "baked Turkish meat bread"],
    imageQueries: ["kiymali pide", "turkish minced meat pide", "turkish meat flatbread"]
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
    visualForms: ["long flat minced-meat skewer", "ridged Adana kebab on lavash", "charred spicy ground-meat kebab"],
    imageQueries: ["adana kebab flat skewer", "turkish adana minced kebab", "spicy ground lamb adana kebab"]
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
    visualForms: ["stuffed eggplant in tomato sauce", "split eggplants with meat filling", "baked eggplant boat"],
    imageQueries: ["karniyarik", "turkish stuffed eggplant", "karniyarik turkish"]
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

const CUISINE_VISUAL_REFERENCES: Record<string, CuisineVisualReference[]> = {
  egyptian: EGYPTIAN_VISUAL_REFERENCES,
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
