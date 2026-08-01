import type { RecipeCatalogDoc, RecipeIngredient } from "@/lib/domain";

interface CuratedRecipeInput {
  id: string;
  title: string;
  description: string;
  ingredients: RecipeIngredient[];
  steps: string[];
  sourceUrl: string;
  totalMinutes: number;
  cookingMethod: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  allergenTags: string[];
  aliases: string[];
}

const ingredient = (
  canonical: string,
  quantity: number,
  unit: string,
  required = true
): RecipeIngredient => ({
  canonical,
  name: canonical,
  quantity,
  required,
  unit
});

export const CURATED_TRUSTED_RECIPE_CATALOG: RecipeCatalogDoc[] = [
  createThaiSeafoodRecipe({
    id: "goong-ob-woonsen",
    title: "Goong Ob Woonsen",
    description: "Thai clay-pot glass noodles with shrimp, ginger, garlic, pepper, and a savory sauce.",
    ingredients: [
      ingredient("glass noodles", 80, "g"),
      ingredient("shrimp", 10, "medium shrimp"),
      ingredient("soy sauce", 2, "tbsp"),
      ingredient("oyster sauce", 2, "tbsp"),
      ingredient("dark soy sauce", 1, "tsp"),
      ingredient("sugar", 2, "tsp"),
      ingredient("toasted sesame oil", 1, "tsp"),
      ingredient("water", 120, "ml"),
      ingredient("garlic", 6, "cloves"),
      ingredient("ginger", 15, "thin slices"),
      ingredient("black and white peppercorns", 1, "tsp"),
      ingredient("cilantro stems", 8, "stems"),
      ingredient("vegetable oil", 2, "tbsp"),
      ingredient("green onion", 1, "piece", false)
    ],
    steps: [
      "Soak the glass noodles in room-temperature water for 10 minutes, drain them well, and cut them into shorter lengths if desired.",
      "Trim and devein the shrimp, rinse them briefly, and pat them dry.",
      "Stir the soy sauces, oyster sauce, sugar, sesame oil, and water together until the sugar dissolves. Toss this sauce with the noodles and shrimp and let them stand while the aromatics are prepared.",
      "Crush the peppercorns, then bruise the garlic and cilantro stems. Put them in a snug, heavy pot with the ginger and oil and heat over medium until fragrant.",
      "Add the noodles and all their sauce to the pot and arrange the shrimp on top. Cover, bring the liquid to a boil, reduce to medium-low, and cook for 3 minutes.",
      "Open the pot, redistribute the noodles, cover again, and cook for 2 to 3 minutes until the shrimp are opaque and the noodles have absorbed the sauce.",
      "Remove from the heat, scatter over the green onion, cover for 1 minute, and serve hot."
    ],
    sourceUrl: "https://hot-thai-kitchen.com/goong-ob-woonsen/",
    totalMinutes: 30,
    cookingMethod: "covered simmer",
    calories: 490,
    protein: 32,
    carbs: 54,
    fat: 16,
    allergenTags: ["shellfish", "soy", "sesame"],
    aliases: ["ginger shrimp glass noodles", "thai shrimp clay pot noodles"]
  }),
  createThaiSeafoodRecipe({
    id: "pla-neung-manao",
    title: "Pla Neung Manao",
    description: "Classic Thai steamed white fish finished with a fresh lime, garlic, chili, and fish-sauce dressing.",
    ingredients: [
      ingredient("whole white fish", 680, "g"),
      ingredient("lemongrass", 1, "stalk"),
      ingredient("fish stock", 0.5, "cup"),
      ingredient("palm sugar", 1, "tbsp"),
      ingredient("fish sauce", 3, "tbsp"),
      ingredient("garlic", 1, "head"),
      ingredient("thai chilies", 3, "pieces"),
      ingredient("lime juice", 4, "tbsp"),
      ingredient("chinese celery", 1, "stalk"),
      ingredient("cilantro", 8, "sprigs")
    ],
    steps: [
      "Score both sides of the cleaned fish with three diagonal cuts, place the lemongrass in the cavity, and set the fish on a heatproof serving plate.",
      "Steam over actively boiling water for 8 to 12 minutes, depending on thickness, until the flesh is opaque and separates easily at the thickest point.",
      "Meanwhile, bring the fish stock and palm sugar to a boil just long enough to dissolve the sugar, then remove the pan from the heat.",
      "Stir the garlic, chilies, fish sauce, and lime juice into the hot stock. Taste and balance the dressing so it remains distinctly sour, savory, and lightly sweet.",
      "Transfer the cooked fish to a platter, arrange the celery around it, stir the cilantro into the dressing, and spoon the dressing over the fish immediately."
    ],
    sourceUrl: "https://hot-thai-kitchen.com/mark-wiens-pla-gapong-neung-manao/",
    totalMinutes: 30,
    cookingMethod: "steam",
    calories: 330,
    protein: 43,
    carbs: 16,
    fat: 8,
    allergenTags: ["fish"],
    aliases: ["thai steamed fish with lime and garlic", "pla gapong neung manao"]
  }),
  createThaiSeafoodRecipe({
    id: "pad-cha-pla",
    title: "Pad Cha Pla",
    description: "High-heat Thai fish stir-fry with chilies, fingerroot, green peppercorns, and Thai basil.",
    ingredients: [
      ingredient("firm white fish", 350, "g"),
      ingredient("fish sauce", 1.5, "tbsp"),
      ingredient("garlic", 4, "cloves"),
      ingredient("cilantro roots", 3, "pieces"),
      ingredient("white peppercorns", 0.25, "tsp"),
      ingredient("thai chilies", 2, "pieces"),
      ingredient("mild red chili", 0.25, "cup"),
      ingredient("sugar", 1, "tsp"),
      ingredient("water", 0.25, "cup"),
      ingredient("fingerroot", 0.33, "cup"),
      ingredient("green peppercorns", 1, "tbsp"),
      ingredient("thai basil", 1, "cup")
    ],
    steps: [
      "Cut the fish into large cubes and marinate it with half a tablespoon of fish sauce while preparing the aromatics.",
      "Pound the garlic, cilantro roots, white peppercorns, Thai chilies, and mild red chili into a coarse paste.",
      "Heat a thin layer of oil in a wok over medium heat and fry the aromatic paste until the garlic begins to turn golden.",
      "Raise the heat to high, add the fish, and toss briefly to coat it without breaking the pieces. Add the remaining fish sauce, sugar, and a splash of water.",
      "Add the fingerroot and green peppercorns. Let the fish cook mostly undisturbed, turning the cubes once, until opaque and just cooked through.",
      "Turn off the heat, fold in the Thai basil only until wilted, and serve immediately."
    ],
    sourceUrl: "https://hot-thai-kitchen.com/fish-herbs-stir-fry/",
    totalMinutes: 30,
    cookingMethod: "stir-fry",
    calories: 360,
    protein: 42,
    carbs: 13,
    fat: 15,
    allergenTags: ["fish"],
    aliases: ["thai fish and herb stir fry", "pad cha fish"]
  }),
  createThaiSeafoodRecipe({
    id: "haw-mok-pla",
    title: "Haw Mok Pla",
    description: "Thai fish steamed in a silky red-curry and coconut custard with basil and makrut lime leaf.",
    ingredients: [
      ingredient("thai red curry paste", 3, "tbsp"),
      ingredient("coconut milk", 1.25, "cups"),
      ingredient("palm sugar", 1, "tbsp"),
      ingredient("fish sauce", 2, "tsp"),
      ingredient("eggs", 2, "large"),
      ingredient("makrut lime leaves", 3, "leaves"),
      ingredient("white fish", 160, "g"),
      ingredient("shredded cabbage", 1.5, "cups"),
      ingredient("thai basil", 10, "leaves"),
      ingredient("banana leaf", 1, "piece", false),
      ingredient("cilantro", 2, "tbsp", false)
    ],
    steps: [
      "Prepare a steamer over medium heat. Whisk a small amount of coconut milk into the curry paste until smooth, then whisk in the remaining coconut milk.",
      "Add the palm sugar, fish sauce, eggs, and finely sliced makrut lime leaves and mix gently without whipping excess air into the custard.",
      "Slice the fish about 6 millimeters thick and fold it into the curry custard.",
      "Steam the cabbage for 3 to 5 minutes until wilted. Divide it among four heatproof ramekins and add a few Thai basil leaves to each.",
      "Divide the fish among the ramekins, ladle over the custard while leaving headroom, and steam for 15 to 20 minutes until set and the fish is fully cooked.",
      "Rest for 2 minutes, garnish with cilantro and finely sliced chili if desired, and serve warm."
    ],
    sourceUrl: "https://hot-thai-kitchen.com/haw-mok-red-curry-custard/",
    totalMinutes: 40,
    cookingMethod: "steam",
    calories: 410,
    protein: 29,
    carbs: 16,
    fat: 27,
    allergenTags: ["fish", "egg"],
    aliases: ["hor mok pla", "thai steamed fish curry custard"]
  }),
  createTurkishGroundMeatRecipe({
    id: "karniyarik",
    title: "Karniyarik",
    description: "Turkish eggplants split and filled with seasoned ground meat, tomato, onion, garlic, and parsley.",
    ingredients: [
      ingredient("eggplant", 3, "medium"),
      ingredient("ground beef", 340, "g"),
      ingredient("onion", 1, "medium"),
      ingredient("garlic", 4, "cloves"),
      ingredient("chopped tomato", 400, "g"),
      ingredient("tomato paste", 2, "tbsp"),
      ingredient("water", 1, "cup"),
      ingredient("flat-leaf parsley", 0.5, "cup"),
      ingredient("olive oil", 2, "tbsp"),
      ingredient("green pepper", 1, "piece"),
      ingredient("red pepper flakes", 1, "tsp"),
      ingredient("salt", 1, "tsp"),
      ingredient("black pepper", 0.5, "tsp")
    ],
    steps: [
      "Cut a deep lengthwise pocket in each eggplant without cutting through the base. Salt the exposed flesh and rest for 15 minutes, then pat it completely dry.",
      "Heat a little olive oil over medium heat and soften the finely chopped onion. Add the ground beef and cook until its released moisture has evaporated and the meat is evenly browned.",
      "Stir in the minced garlic, chopped tomato, tomato paste, red pepper flakes, salt, and black pepper. Cook for 3 minutes, remove from the heat, and fold in most of the chopped parsley.",
      "Brown the eggplants on all sides in a wide pan, then arrange them pocket-side up in a baking dish and open each pocket carefully.",
      "Fill the eggplants with the meat mixture and top each one with tomato and green pepper. Pour the water around, not over, the eggplants.",
      "Cover and bake at 180 C for 45 minutes. Uncover and bake for another 10 to 15 minutes until the eggplants are tender and browned at the edges."
    ],
    sourceUrl: "https://ozlemsturkishtable.com/2010/06/karniyarik-stuffed-eggplants-aubergines-with-ground-lamb-tomatoes-and-onions/",
    totalMinutes: 115,
    cookingMethod: "stuffed and baked",
    calories: 430,
    protein: 29,
    carbs: 24,
    fat: 25,
    allergenTags: [],
    aliases: ["turkish stuffed eggplant with ground beef", "karnıyarık"]
  }),
  createTurkishGroundMeatRecipe({
    id: "homemade-kofte",
    title: "Turkish Kofte",
    description: "Home-style Turkish meatballs kneaded with onion, parsley, bread, egg, and black pepper, then browned in a shallow pan.",
    ingredients: [
      ingredient("ground beef", 450, "g"),
      ingredient("onion", 1, "medium"),
      ingredient("stale bread", 3, "slices"),
      ingredient("egg", 1, "large"),
      ingredient("flat-leaf parsley", 0.5, "cup"),
      ingredient("salt", 1, "tsp"),
      ingredient("black pepper", 0.5, "tsp"),
      ingredient("olive oil", 2, "tbsp")
    ],
    steps: [
      "Soak the bread briefly in water, squeeze it thoroughly dry, and crumble it into a mixing bowl.",
      "Grate the onion and combine it with the bread, egg, finely chopped parsley, salt, and black pepper. Knead the mixture first so the onion softens and the seasonings disperse.",
      "Add the ground beef and knead firmly for 3 to 5 minutes until the mixture becomes cohesive. Cover and refrigerate for at least 30 minutes.",
      "Wet your hands, divide the mixture into small portions, roll each into a ball, and flatten it slightly so the meatballs cook evenly.",
      "Heat a thin layer of olive oil in a wide heavy pan over medium-high heat. Cook in batches for 3 to 4 minutes per side until browned and cooked through to 71 C in the center.",
      "Rest the meatballs for 3 minutes before serving with a fresh tomato, cucumber, and parsley salad."
    ],
    sourceUrl: "https://ozlemsturkishtable.com/2013/09/homemade-turkish-meatballs-kofte-101-grated-carrot-red-cabbage-salad/",
    totalMinutes: 60,
    cookingMethod: "shallow-fry",
    calories: 460,
    protein: 35,
    carbs: 18,
    fat: 27,
    allergenTags: ["egg", "gluten"],
    aliases: ["turkish meatballs", "izgara kofte"]
  }),
  createTurkishGroundMeatRecipe({
    id: "ali-nazik-meatballs",
    title: "Ali Nazik with Meatballs",
    description: "Gaziantep-style meatballs served over smoky eggplant with garlic yogurt and warm Aleppo-pepper oil.",
    ingredients: [
      ingredient("eggplant", 3, "medium"),
      ingredient("ground beef", 400, "g"),
      ingredient("garlic", 2, "cloves"),
      ingredient("flat-leaf parsley", 3, "tbsp"),
      ingredient("aleppo pepper", 2.5, "tsp"),
      ingredient("black pepper", 0.25, "tsp"),
      ingredient("yogurt", 300, "g"),
      ingredient("butter", 3, "tbsp"),
      ingredient("olive oil", 2, "tbsp"),
      ingredient("salt", 1, "tsp")
    ],
    steps: [
      "Char the whole eggplants over a gas flame, under a broiler, or in a very hot oven until the skins are blackened and the centers are completely soft.",
      "Knead the ground beef with Aleppo pepper, one finely minced garlic clove, chopped parsley, salt, and black pepper for several minutes. Shape into eight slender meatballs.",
      "Bake the covered meatballs at 200 C for 10 to 15 minutes until nearly cooked, then uncover and broil for 1 to 2 minutes to brown the surface.",
      "Peel the cooled eggplants, discard the charred skin, and chop the flesh finely. Warm it gently with the olive oil and season with salt and black pepper.",
      "Crush the remaining garlic to a paste and whisk it into the yogurt with enough water to make a spoonable sauce.",
      "Melt the butter over low heat and stir in the remaining Aleppo pepper. Spread the eggplant on a platter, spoon over the garlic yogurt, arrange the meatballs on top, and finish with the pepper butter."
    ],
    sourceUrl: "https://vidarbergum.com/recipe/ali-nazik-imam-cagdas-style",
    totalMinutes: 45,
    cookingMethod: "char and roast",
    calories: 510,
    protein: 34,
    carbs: 19,
    fat: 34,
    allergenTags: ["dairy"],
    aliases: ["alinazik kofte", "gaziantep eggplant and meatballs"]
  }),
  createTurkishGroundMeatRecipe({
    id: "izmir-kofte",
    title: "Izmir Kofte",
    description: "Turkish meatballs baked with potato wedges, peppers, tomatoes, and a seasoned tomato sauce.",
    ingredients: [
      ingredient("ground beef", 450, "g"),
      ingredient("onion", 1, "medium"),
      ingredient("stale bread", 2, "slices"),
      ingredient("egg", 1, "large"),
      ingredient("flat-leaf parsley", 0.5, "cup"),
      ingredient("ground cumin", 1, "tsp"),
      ingredient("red pepper flakes", 0.5, "tsp"),
      ingredient("potato", 450, "g"),
      ingredient("green pepper", 1, "piece"),
      ingredient("carrot", 1, "medium"),
      ingredient("garlic", 4, "cloves"),
      ingredient("chopped tomato", 400, "g"),
      ingredient("olive oil", 1, "tbsp"),
      ingredient("water", 1, "cup"),
      ingredient("salt", 1, "tsp"),
      ingredient("black pepper", 0.5, "tsp")
    ],
    steps: [
      "Soak the bread in water, squeeze it dry, and crumble it into a bowl. Knead it with the grated onion, egg, parsley, cumin, red pepper flakes, salt, and black pepper.",
      "Add the ground beef and knead until cohesive. With wet hands, shape the mixture into thick finger-length meatballs.",
      "Cut the potatoes into thin wedges, slice the pepper and carrot, and mince the garlic. Arrange the vegetables and meatballs in alternating layers in a deep baking dish.",
      "Mix the chopped tomato, garlic, water, and olive oil, season to taste, and pour the sauce evenly into the dish.",
      "Bake at 180 C for 45 to 50 minutes until the meatballs reach 71 C, the vegetables are tender, and the tomato sauce has thickened.",
      "Rest for 5 minutes so the sauce settles, then serve the meatballs with the baked vegetables and tomato juices."
    ],
    sourceUrl: "https://ozlemsturkishtable.com/2010/06/casserole-of-meatballs-potatoes-tomatoes-and-peppers-izmir-kofte-my-way/",
    totalMinutes: 80,
    cookingMethod: "casserole bake",
    calories: 540,
    protein: 32,
    carbs: 42,
    fat: 27,
    allergenTags: ["egg", "gluten"],
    aliases: ["turkish meatball and vegetable casserole", "izmir meatballs"]
  }),
  createMiddleEasternLambRecipe({
    id: "lamb-kabsa",
    title: "Lamb Kabsa",
    description: "Gulf-style lamb and basmati rice simmered with tomato, dried lime, cardamom, cinnamon, and kabsa spices.",
    ingredients: [
      ingredient("lamb shank", 500, "g"),
      ingredient("basmati rice", 1.5, "cups"),
      ingredient("tomato puree", 1, "cup"),
      ingredient("onion", 1, "large"),
      ingredient("carrot", 2, "medium"),
      ingredient("olive oil", 0.25, "cup"),
      ingredient("kabsa spice", 3, "tsp"),
      ingredient("bay leaf", 2, "leaves"),
      ingredient("cinnamon stick", 1, "piece"),
      ingredient("dried lime", 1, "piece"),
      ingredient("cardamom", 4, "pods"),
      ingredient("cloves", 0.5, "tsp"),
      ingredient("pine nuts", 2, "tbsp", false),
      ingredient("almonds", 0.25, "cup", false),
      ingredient("salt", 1.5, "tsp")
    ],
    steps: [
      "Rinse the basmati rice until the water runs clear, soak it for 20 minutes, and drain it well.",
      "Heat half the olive oil in a deep heavy pot over medium heat. Soften the finely chopped onion for 5 minutes, season the lamb, and brown it for about 2 minutes per side.",
      "Add water to cover the lamb, bring to a boil, skim the surface, then simmer for 10 minutes. Drain away this first liquid while keeping the lamb and onion in the pot.",
      "Add the grated carrot, half the kabsa spice, bay leaves, cinnamon, dried lime, cardamom, and cloves. Stir over medium heat for 5 minutes until fragrant.",
      "Add the tomato puree and 4 cups water. Bring to a boil, cover, and simmer for 45 to 60 minutes until the lamb is tender but still holds its shape.",
      "Add the drained rice, remaining kabsa spice, and enough hot water to sit about 2 centimeters above the rice. Boil for 5 minutes, then cover and cook over low heat for about 15 minutes until fluffy.",
      "Rest the pot off the heat for 10 minutes. Toast the nuts in the remaining oil, arrange the rice and lamb on a platter, and scatter the nuts over the top."
    ],
    sourceUrl: "https://www.simplyleb.com/recipe/lamb-kabsa/",
    totalMinutes: 100,
    cookingMethod: "braise and rice pilaf",
    calories: 749,
    protein: 38,
    carbs: 80,
    fat: 30,
    allergenTags: ["tree nuts"],
    aliases: ["kabsa with lamb", "arabian lamb rice"]
  }),
  createMiddleEasternLambRecipe({
    id: "lamb-makloubeh",
    title: "Lamb Makloubeh",
    description: "Levantine upside-down rice layered with tender lamb, eggplant, cauliflower, warm spices, and toasted nuts.",
    ingredients: [
      ingredient("lamb shank", 700, "g"),
      ingredient("basmati rice", 2, "cups"),
      ingredient("eggplant", 2, "large"),
      ingredient("cauliflower", 1, "small"),
      ingredient("onion", 1, "large"),
      ingredient("lamb stock", 4, "cups"),
      ingredient("ground allspice", 1, "tsp"),
      ingredient("ground cinnamon", 0.5, "tsp"),
      ingredient("ground cumin", 0.5, "tsp"),
      ingredient("turmeric", 0.5, "tsp"),
      ingredient("olive oil", 3, "tbsp"),
      ingredient("almonds", 0.25, "cup", false),
      ingredient("salt", 1.5, "tsp"),
      ingredient("black pepper", 0.5, "tsp")
    ],
    steps: [
      "Cover the lamb with water in a heavy pot, add half the onion, and simmer gently for 60 to 75 minutes until tender. Strain and reserve 4 cups of the cooking stock.",
      "Rinse the rice until clear, soak it for 20 minutes, and drain. Slice the eggplants into 1-centimeter rounds and divide the cauliflower into small florets.",
      "Brush the eggplant and cauliflower with olive oil and roast at 220 C, turning once, until browned but still firm enough to layer.",
      "Oil a deep straight-sided pot. Arrange the lamb in the base, then add an even layer of eggplant and cauliflower.",
      "Mix the rice with allspice, cinnamon, cumin, turmeric, salt, and black pepper and spread it gently over the vegetables without compressing the layers.",
      "Pour in the hot reserved stock until it reaches about 1 centimeter above the rice. Bring to a boil, cover, and cook over very low heat for 30 minutes.",
      "Rest for 15 minutes. Set a large platter over the pot, invert it in one confident motion, lift away the pot, and garnish with toasted almonds."
    ],
    sourceUrl: "https://www.simplyleb.com/recipe/eggplant-makloubeh/",
    totalMinutes: 145,
    cookingMethod: "layered one-pot",
    calories: 690,
    protein: 36,
    carbs: 78,
    fat: 27,
    allergenTags: ["tree nuts"],
    aliases: ["lamb maqluba", "upside-down lamb and eggplant rice"]
  }),
  createMiddleEasternLambRecipe({
    id: "kibbeh-bil-sanieh",
    title: "Kibbeh Bil Sanieh",
    description: "Lebanese baked kibbeh layered with finely ground lamb and bulgur around a seven-spice onion and pine-nut filling.",
    ingredients: [
      ingredient("fine bulgur", 2, "cups"),
      ingredient("lean ground lamb", 900, "g"),
      ingredient("onion", 2, "medium"),
      ingredient("lebanese seven spice", 2, "tsp"),
      ingredient("ground cumin", 1, "tsp"),
      ingredient("pine nuts", 0.25, "cup"),
      ingredient("olive oil", 0.25, "cup"),
      ingredient("salt", 1.5, "tsp"),
      ingredient("black pepper", 0.5, "tsp")
    ],
    steps: [
      "Rinse the fine bulgur, cover it with cool water for 10 minutes, then squeeze it firmly so no excess water remains.",
      "Process half the onion until very fine. Knead it with the bulgur, two-thirds of the ground lamb, cumin, half the seven spice, salt, and black pepper until the mixture becomes smooth and cohesive.",
      "For the filling, finely chop the remaining onion and soften it in a tablespoon of olive oil. Add the remaining lamb and cook until browned, then add the pine nuts and remaining seven spice.",
      "Oil a round baking pan. With damp hands, press half the kibbeh mixture into an even 1-centimeter layer, taking care to seal the edges.",
      "Spread the cooked filling evenly over the base, then cover it with the remaining kibbeh mixture and smooth the surface with wet hands.",
      "Score the top into diamonds without cutting through the bottom layer and drizzle the remaining olive oil into the cuts.",
      "Bake at 190 C for 45 to 50 minutes until deeply browned at the edges. Rest for 10 minutes before cutting along the score lines."
    ],
    sourceUrl: "https://www.simplyleb.com/recipe/kibbeh-bil-sanieh/",
    totalMinutes: 110,
    cookingMethod: "layered bake",
    calories: 570,
    protein: 35,
    carbs: 38,
    fat: 32,
    allergenTags: ["gluten", "tree nuts"],
    aliases: ["baked Lebanese kibbeh", "kibbeh in a tray"]
  }),
  createMiddleEasternLambRecipe({
    id: "lebanese-kafta",
    title: "Lebanese Lamb Kafta",
    description: "Lebanese lamb kafta mixed with parsley, onion, and seven spice, shaped around skewers and grilled.",
    ingredients: [
      ingredient("ground lamb", 680, "g"),
      ingredient("onion", 1, "medium"),
      ingredient("flat-leaf parsley", 1, "cup"),
      ingredient("lebanese seven spice", 2, "tsp"),
      ingredient("salt", 1, "tsp"),
      ingredient("black pepper", 0.5, "tsp"),
      ingredient("olive oil", 1, "tbsp")
    ],
    steps: [
      "Finely chop the parsley. Pulse the quartered onion in a food processor until very fine, then squeeze away excess liquid so the kafta will hold its shape.",
      "Add the parsley, ground lamb, seven spice, salt, and black pepper and pulse only a few times, or knead by hand, until evenly combined without making the meat pasty.",
      "Cover and chill the mixture for 30 minutes. Divide it into equal portions and shape each into a long oval around a flat skewer, pressing firmly to remove air pockets.",
      "Heat a grill or ridged grill pan to medium-high and brush it lightly with olive oil.",
      "Grill the kafta for 4 to 5 minutes per side, turning once, until browned and the center reaches 71 C.",
      "Rest for 5 minutes and serve with chopped tomato, cucumber, parsley, and warm flatbread if desired."
    ],
    sourceUrl: "https://feelgoodfoodie.net/recipe/beef-kafta/",
    totalMinutes: 55,
    cookingMethod: "grill",
    calories: 480,
    protein: 37,
    carbs: 9,
    fat: 34,
    allergenTags: [],
    aliases: ["Lebanese kofta kebab", "grilled lamb kafta"]
  }),
  createItalianChickenRecipe({
    id: "chicken-piccata",
    title: "Chicken Piccata",
    description: "Italian chicken cutlets browned in a pan and finished in a bright lemon, caper, stock, and parsley sauce.",
    ingredients: [
      ingredient("chicken breast", 680, "g"),
      ingredient("salt", 0.75, "tsp"),
      ingredient("black pepper", 0.5, "tsp"),
      ingredient("all-purpose flour", 0.5, "cup"),
      ingredient("unsalted butter", 6, "tbsp"),
      ingredient("extra virgin olive oil", 5, "tbsp"),
      ingredient("lemon juice", 0.33, "cup"),
      ingredient("low-sodium chicken stock", 0.5, "cup"),
      ingredient("capers", 0.25, "cup"),
      ingredient("flat-leaf parsley", 0.33, "cup")
    ],
    steps: [
      "Butterfly the chicken breasts, cut each one into two cutlets, and pound them to an even 6-millimeter thickness so they cook at the same rate.",
      "Season both sides with salt and black pepper. Coat the cutlets lightly in flour and shake off every loose patch of flour.",
      "Heat 2 tablespoons of butter with 3 tablespoons of olive oil in a wide skillet over medium-high heat. Brown two cutlets for about 3 minutes per side, transfer them to a plate, and repeat with the remaining butter, oil, and chicken.",
      "Pour the lemon juice and chicken stock into the skillet, add the rinsed capers, and bring to a boil while scraping the browned residue from the pan into the sauce.",
      "Return the chicken to the skillet and simmer for 5 minutes, or until the thickest part reaches 74 C. Transfer the chicken to a warm platter.",
      "Whisk the remaining butter into the sauce until glossy, spoon it over the cutlets, and finish with the chopped parsley."
    ],
    sourceUrl: "https://www.foodnetwork.com/recipes/giada-de-laurentiis/chicken-piccata-recipe2-1913809",
    totalMinutes: 40,
    cookingMethod: "lemon-caper pan sauce",
    calories: 510,
    protein: 43,
    carbs: 15,
    fat: 31,
    allergenTags: ["gluten", "dairy"],
    aliases: ["Italian lemon caper chicken", "pollo piccata"]
  }),
  createItalianChickenRecipe({
    id: "herbed-chicken-marsala",
    title: "Herbed Chicken Marsala",
    description: "Thin chicken cutlets with mushrooms, sun-dried tomato, rosemary, and a reduced Marsala pan sauce.",
    ingredients: [
      ingredient("chicken breast", 454, "g"),
      ingredient("salt", 0.5, "tsp"),
      ingredient("black pepper", 0.75, "tsp"),
      ingredient("whole wheat flour", 0.33, "cup"),
      ingredient("extra virgin olive oil", 1.5, "tbsp"),
      ingredient("low-sodium chicken stock", 0.75, "cup"),
      ingredient("sun-dried tomato", 0.33, "cup"),
      ingredient("fresh rosemary", 0.5, "tsp"),
      ingredient("cremini mushrooms", 284, "g"),
      ingredient("marsala wine", 0.33, "cup"),
      ingredient("unsalted butter", 2, "tsp"),
      ingredient("flat-leaf parsley", 2, "tbsp")
    ],
    steps: [
      "Place each chicken cutlet between two sheets of parchment and pound it to an even 8-millimeter thickness, then season both sides with salt and black pepper.",
      "Spread the flour on a plate. Heat the olive oil in a large nonstick skillet over medium-high heat, coat the chicken lightly in flour, and shake off the excess.",
      "Cook the cutlets for about 4 minutes per side until golden and the center reaches 74 C, then transfer them to a platter and cover loosely to keep warm.",
      "Add half a cup of chicken stock, the finely sliced sun-dried tomato, and rosemary to the skillet. Stir for 1 minute while scraping up the browned residue.",
      "Add the sliced mushrooms and cook for about 5 minutes until tender. Pour in the Marsala, bring it to a boil, then add the remaining stock and butter and simmer for 30 seconds.",
      "Spoon the mushrooms and reduced sauce over the chicken, scatter over the parsley, and serve immediately."
    ],
    sourceUrl: "https://www.foodnetwork.com/recipes/food-network-kitchen/herbed-chicken-marsala-recipe-2121049",
    totalMinutes: 35,
    cookingMethod: "mushroom pan sauce",
    calories: 294,
    protein: 30,
    carbs: 19,
    fat: 11,
    allergenTags: ["gluten", "dairy"],
    aliases: ["healthy chicken marsala", "Italian mushroom chicken"]
  }),
  createItalianChickenRecipe({
    id: "chicken-pizzaiola",
    title: "Chicken Pizzaiola",
    description: "Italian chicken breast simmered in oregano tomato sauce and finished with basil and melted mozzarella.",
    ingredients: [
      ingredient("chicken breast", 640, "g"),
      ingredient("capers", 20, "g"),
      ingredient("tomato puree", 450, "g"),
      ingredient("mozzarella", 180, "g"),
      ingredient("garlic", 1, "clove"),
      ingredient("fresh basil", 6, "leaves"),
      ingredient("dried oregano", 1, "tsp"),
      ingredient("salt", 0.5, "tsp"),
      ingredient("black pepper", 0.5, "tsp"),
      ingredient("extra virgin olive oil", 1, "tbsp")
    ],
    steps: [
      "Trim the chicken breasts and cut them horizontally into four even cutlets. Pound any thick sections so every piece has the same thickness.",
      "Slice the mozzarella and leave it in a colander to drain while the chicken cooks so it does not water down the sauce.",
      "Crush the garlic and warm it with the olive oil in a wide nonstick skillet. Sear the chicken over high heat for about 3 minutes per side, season with salt and black pepper, and transfer it to a plate.",
      "Discard the garlic. Add the rinsed capers and tomato puree to the same skillet and simmer for 5 minutes, scraping the browned residue into the sauce.",
      "Return the chicken to the skillet, cover, and simmer for about 10 minutes until the center reaches 74 C.",
      "Tear the basil over the sauce, place the drained mozzarella on the chicken, sprinkle with oregano, cover, and cook over low heat only until the cheese melts."
    ],
    sourceUrl: "https://www.giallozafferano.com/recipes/chicken-pizzaiola.html",
    totalMinutes: 50,
    cookingMethod: "sear and simmer",
    calories: 354,
    protein: 47,
    carbs: 4,
    fat: 17,
    allergenTags: ["dairy"],
    aliases: ["Italian tomato mozzarella chicken", "pollo alla pizzaiola"]
  })
];

function createThaiSeafoodRecipe(input: CuratedRecipeInput): RecipeCatalogDoc {
  const requiredCanonicals = input.ingredients
    .filter((item) => item.required)
    .map((item) => item.canonical);
  const optionalCanonicals = input.ingredients
    .filter((item) => !item.required)
    .map((item) => item.canonical);
  const ingredientCanonicals = input.ingredients.map((item) => item.canonical);
  const prepMinutes = Math.max(10, Math.round(input.totalMinutes * 0.4));
  const cookMinutes = input.totalMinutes - prepMinutes;

  return {
    id: `trusted-source-thai-${input.id}`,
    title: input.title,
    slug: input.id,
    description: input.description,
    ingredients: input.ingredients,
    ingredientCanonicals,
    requiredCanonicals,
    optionalCanonicals,
    dietTags: ["pescatarian", "dairyFree"],
    allergenTags: input.allergenTags,
    mealType: "dinner",
    cuisine: "Thai",
    prepMinutes,
    cookMinutes,
    totalMinutes: input.totalMinutes,
    difficulty: "medium",
    calories: input.calories,
    protein: input.protein,
    carbs: input.carbs,
    fat: input.fat,
    fiber: 3,
    sugar: 6,
    sodium: 620,
    calorieBand: input.calories <= 300 ? "0_300" : input.calories <= 500 ? "301_500" : "501_700",
    servings: 4,
    steps: input.steps,
    image: {
      storagePath: "",
      sourceQuery: `${input.title} Thai finished plate`
    },
    source: {
      provider: "hot-thai-kitchen",
      url: input.sourceUrl
    },
    dishIntent: {
      dish_name: input.title,
      cuisine: "Thai",
      meal_type: "dinner",
      cooking_method: input.cookingMethod,
      visual_keywords: [input.title, ...input.aliases],
      exclude_keywords: ["raw ingredients", "preparation"]
    },
    regionalCuisines: ["Thai"],
    styleTags: [input.cookingMethod, "authentic", "seafood"],
    searchTokens: [input.title, input.description, ...input.aliases, ...ingredientCanonicals],
    popularityScore: 90,
    qualityScore: 96,
    isActive: true,
    createdAt: 0,
    updatedAt: 0
  };
}

function createTurkishGroundMeatRecipe(input: CuratedRecipeInput): RecipeCatalogDoc {
  const requiredCanonicals = input.ingredients
    .filter((item) => item.required)
    .map((item) => item.canonical);
  const optionalCanonicals = input.ingredients
    .filter((item) => !item.required)
    .map((item) => item.canonical);
  const ingredientCanonicals = input.ingredients.map((item) => item.canonical);
  const prepMinutes = Math.max(15, Math.round(input.totalMinutes * 0.4));
  const cookMinutes = input.totalMinutes - prepMinutes;

  return {
    id: `trusted-source-turkish-${input.id}`,
    title: input.title,
    slug: input.id,
    description: input.description,
    ingredients: input.ingredients,
    ingredientCanonicals,
    requiredCanonicals,
    optionalCanonicals,
    dietTags: [],
    allergenTags: input.allergenTags,
    mealType: "dinner",
    cuisine: "Turkish",
    prepMinutes,
    cookMinutes,
    totalMinutes: input.totalMinutes,
    difficulty: "medium",
    calories: input.calories,
    protein: input.protein,
    carbs: input.carbs,
    fat: input.fat,
    fiber: 5,
    sugar: 7,
    sodium: 520,
    calorieBand: input.calories <= 300 ? "0_300" : input.calories <= 500 ? "301_500" : "501_700",
    servings: 4,
    steps: input.steps,
    image: {
      storagePath: "",
      sourceQuery: `${input.title} Turkish finished plate`
    },
    source: {
      provider: input.sourceUrl.includes("vidarbergum.com") ? "a-kitchen-in-istanbul" : "ozlems-turkish-table",
      url: input.sourceUrl
    },
    dishIntent: {
      dish_name: input.title,
      cuisine: "Turkish",
      meal_type: "dinner",
      cooking_method: input.cookingMethod,
      visual_keywords: [input.title, ...input.aliases],
      exclude_keywords: ["raw ingredients", "preparation"]
    },
    regionalCuisines: ["Turkish"],
    styleTags: [input.cookingMethod, "authentic", "ground meat"],
    searchTokens: [input.title, input.description, ...input.aliases, ...ingredientCanonicals],
    popularityScore: 90,
    qualityScore: 96,
    isActive: true,
    createdAt: 0,
    updatedAt: 0
  };
}

function createMiddleEasternLambRecipe(input: CuratedRecipeInput): RecipeCatalogDoc {
  const requiredCanonicals = input.ingredients
    .filter((item) => item.required)
    .map((item) => item.canonical);
  const optionalCanonicals = input.ingredients
    .filter((item) => !item.required)
    .map((item) => item.canonical);
  const ingredientCanonicals = input.ingredients.map((item) => item.canonical);
  const prepMinutes = Math.max(15, Math.round(input.totalMinutes * 0.35));
  const cookMinutes = input.totalMinutes - prepMinutes;

  return {
    id: `trusted-source-middle-eastern-${input.id}`,
    title: input.title,
    slug: input.id,
    description: input.description,
    ingredients: input.ingredients,
    ingredientCanonicals,
    requiredCanonicals,
    optionalCanonicals,
    dietTags: [],
    allergenTags: input.allergenTags,
    mealType: "dinner",
    cuisine: "Middle Eastern",
    prepMinutes,
    cookMinutes,
    totalMinutes: input.totalMinutes,
    difficulty: input.totalMinutes >= 100 ? "hard" : "medium",
    calories: input.calories,
    protein: input.protein,
    carbs: input.carbs,
    fat: input.fat,
    fiber: 5,
    sugar: 6,
    sodium: 620,
    calorieBand: input.calories <= 300 ? "0_300" : input.calories <= 500 ? "301_500" : input.calories <= 700 ? "501_700" : "701_plus",
    servings: 4,
    steps: input.steps,
    image: {
      storagePath: "",
      sourceQuery: `${input.title} Middle Eastern finished plate`
    },
    source: {
      provider: input.sourceUrl.includes("feelgoodfoodie.net") ? "feel-good-foodie" : "simply-lebanese",
      url: input.sourceUrl
    },
    dishIntent: {
      dish_name: input.title,
      cuisine: "Middle Eastern",
      meal_type: "dinner",
      cooking_method: input.cookingMethod,
      visual_keywords: [input.title, ...input.aliases],
      exclude_keywords: ["raw ingredients", "preparation"]
    },
    regionalCuisines: ["Middle Eastern", "Levantine", "Arab"],
    styleTags: [input.cookingMethod, "authentic", "lamb"],
    searchTokens: [input.title, input.description, ...input.aliases, ...ingredientCanonicals],
    popularityScore: 92,
    qualityScore: 97,
    isActive: true,
    createdAt: 0,
    updatedAt: 0
  };
}

function createItalianChickenRecipe(input: CuratedRecipeInput): RecipeCatalogDoc {
  const requiredCanonicals = input.ingredients
    .filter((item) => item.required)
    .map((item) => item.canonical);
  const optionalCanonicals = input.ingredients
    .filter((item) => !item.required)
    .map((item) => item.canonical);
  const ingredientCanonicals = input.ingredients.map((item) => item.canonical);
  const prepMinutes = Math.max(10, Math.round(input.totalMinutes * 0.4));
  const cookMinutes = input.totalMinutes - prepMinutes;

  return {
    id: `trusted-source-italian-${input.id}`,
    title: input.title,
    slug: input.id,
    description: input.description,
    ingredients: input.ingredients,
    ingredientCanonicals,
    requiredCanonicals,
    optionalCanonicals,
    dietTags: [],
    allergenTags: input.allergenTags,
    mealType: "dinner",
    cuisine: "Italian",
    prepMinutes,
    cookMinutes,
    totalMinutes: input.totalMinutes,
    difficulty: "medium",
    calories: input.calories,
    protein: input.protein,
    carbs: input.carbs,
    fat: input.fat,
    fiber: 3,
    sugar: 5,
    sodium: 560,
    calorieBand: input.calories <= 300 ? "0_300" : input.calories <= 500 ? "301_500" : "501_700",
    servings: 4,
    steps: input.steps,
    image: {
      storagePath: "",
      sourceQuery: `${input.title} Italian finished plate`
    },
    source: {
      provider: input.sourceUrl.includes("giallozafferano.com") ? "giallo-zafferano" : "food-network",
      url: input.sourceUrl
    },
    dishIntent: {
      dish_name: input.title,
      cuisine: "Italian",
      meal_type: "dinner",
      cooking_method: input.cookingMethod,
      visual_keywords: [input.title, ...input.aliases],
      exclude_keywords: ["raw ingredients", "preparation"]
    },
    regionalCuisines: ["Italian", "Italian-American"],
    styleTags: [input.cookingMethod, "authentic", "chicken"],
    searchTokens: [input.title, input.description, ...input.aliases, ...ingredientCanonicals],
    popularityScore: 93,
    qualityScore: 97,
    isActive: true,
    createdAt: 0,
    updatedAt: 0
  };
}
