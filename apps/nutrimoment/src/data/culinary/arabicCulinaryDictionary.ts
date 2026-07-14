/** Curated Arabic culinary terminology. Source recipes and UI formatters use
 * this deterministic vocabulary; model output is never used as a dictionary. */
export const ARABIC_CULINARY_DICTIONARY = {
  ingredients: {
    "ground lamb": "لحم غنم مفروم",
    "lamb tail fat": "لية خروف مفرومة",
    "red bell pepper": "فليفلة حمراء حلوة",
    "red onion": "بصل أحمر",
    garlic: "ثوم",
    parsley: "بقدونس طازج",
    "aleppo pepper": "فلفل حلبي",
    paprika: "بابريكا حمراء",
    cumin: "كمون",
    "ground coriander": "كزبرة جافة",
    "black pepper": "فلفل أسود",
    lavash: "خبز لافاش",
    sumac: "سماق",
    "egyptian rice": "أرز مصري",
    "black lentils": "عدس بجبة",
    "short pasta": "مكرونة صغيرة",
    spaghetti: "مكرونة إسباجيتي",
    vermicelli: "شعرية",
    chickpeas: "حمص مسلوق",
    "crispy onions": "بصل مقرمش",
    "tomato sauce": "صلصة طماطم",
    dukkah: "دقة الكشري",
    "chili oil": "زيت شطة",
    "grape leaves": "أوراق عنب",
    "cabbage leaves": "أوراق ملفوف",
    "short grain rice": "أرز قصير الحبة",
    mint: "نعناع طازج",
    "dried mint": "نعناع مجفف",
    "tomato paste": "معجون طماطم",
    "pepper paste": "معجون فلفل",
    "olive oil": "زيت زيتون",
    "mixed spices": "بهارات مشكلة",
    cinnamon: "قرفة"
  },
  techniques: {
    mince: "يُفرم ناعماً",
    saute: "تشويح",
    cook: "طهي",
    bake: "خبز",
    roast: "تحمير",
    boil: "سلق",
    steam: "طهي بالبخار",
    whisk: "خفق",
    fold: "تقليب برفق",
    mix: "خلط",
    dice: "تقطيع إلى مكعبات",
    slice: "تقطيع إلى شرائح",
    brown: "تحمير حتى يكتسب لوناً ذهبياً",
    season: "تتبيل",
    marinate: "نقع في التتبيلة",
    simmer: "طهي على نار هادئة",
    garnish: "تزيين",
    drain: "يُصفّى جيداً من السوائل الزائدة",
    knead: "يُعجن جيداً حتى يتماسك",
    chill: "يُبرّد في الثلاجة",
    shape: "يُشكّل على أسياخ الشواء",
    grill: "يُشوى على الفحم أو الشواية",
    turn: "يُقلّب بانتظام حتى ينضج ويتحمّر",
    serve: "يُقدّم ساخناً"
  },
  measurements: {
    kg: "كيلوغرام",
    g: "غرام",
    tbsp: "ملعقة كبيرة",
    tsp: "ملعقة صغيرة",
    cup: "كوب",
    clove: "فص"
  }
} as const;

export const FORBIDDEN_ARABIC_RECIPE_TRANSLITERATIONS = [
  "باد كرا باو",
  "دومبلنجس",
  "ستير فراي",
  "جرافي",
  "كاشاتوري",
  "كراباو",
  "سويت اند ساور"
] as const;

export const ARABIC_RECIPE_CUISINES = [
  "Egyptian",
  "Turkish",
  "Italian",
  "Greek",
  "Mexican",
  "Indian",
  "Japanese",
  "Chinese",
  "Thai",
  "French",
  "American",
  "Middle Eastern"
] as const;
