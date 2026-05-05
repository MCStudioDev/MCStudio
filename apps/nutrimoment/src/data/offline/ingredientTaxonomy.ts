import type { IngredientLexiconDoc } from "@/lib/domain";

export const OFFLINE_INGREDIENT_TAXONOMY: IngredientLexiconDoc[] = [
  {
    id: "ingredient-chicken-breast",
    canonical: "chicken breast",
    category: "protein",
    broadCategory: "meat",
    dietCompatibility: ["high-protein", "gluten-free"],
    commonSubstitutes: ["turkey breast", "tofu"],
    variants: [
      {
        locale: "en",
        values: ["chicken", "chicken breast", "chicken breasts", "boneless chicken", "skinless chicken"]
      },
      {
        locale: "ar",
        values: ["دجاج", "صدر دجاج", "صدور دجاج", "لحم دجاج"]
      },
      {
        locale: "ar",
        region: "egypt",
        values: ["فراخ", "لحمة فراخ"]
      }
    ],
    misspellings: ["chiken", "chciken", "chikcen", "cheicken", "فراخة"],
    relatedCanonicals: ["turkey breast"],
    isActive: true
  },
  {
    id: "ingredient-beef",
    canonical: "beef",
    category: "protein",
    broadCategory: "meat",
    dietCompatibility: ["high-protein", "gluten-free"],
    commonSubstitutes: ["lamb", "chicken breast", "lentils"],
    variants: [
      {
        locale: "en",
        values: ["beef", "meat", "beef cubes", "stew beef", "beef strips"]
      },
      {
        locale: "ar",
        values: ["لحم", "لحم بقري", "لحوم"]
      },
      {
        locale: "ar",
        region: "egypt",
        values: ["لحمة", "لحمه"]
      }
    ],
    misspellings: ["beeef"],
    relatedCanonicals: ["lamb"],
    isActive: true
  },
  {
    id: "ingredient-rice",
    canonical: "rice",
    category: "grain",
    broadCategory: "grain",
    dietCompatibility: ["gluten-free"],
    commonSubstitutes: ["quinoa", "cauliflower rice"],
    variants: [
      {
        locale: "en",
        values: ["rice", "white rice", "brown rice", "basmati rice"]
      },
      {
        locale: "ar",
        values: ["أرز", "رز"]
      }
    ],
    misspellings: ["riice"],
    relatedCanonicals: ["quinoa"],
    isActive: true
  },
  {
    id: "ingredient-broccoli",
    canonical: "broccoli",
    category: "vegetable",
    broadCategory: "produce",
    dietCompatibility: ["vegan", "vegetarian", "gluten-free"],
    commonSubstitutes: ["cauliflower", "green beans"],
    variants: [
      {
        locale: "en",
        values: ["broccoli"]
      },
      {
        locale: "ar",
        values: ["بروكلي"]
      }
    ],
    misspellings: ["brocolli", "broccolli"],
    relatedCanonicals: ["cauliflower"],
    isActive: true
  },
  {
    id: "ingredient-tomato",
    canonical: "tomato",
    category: "vegetable",
    broadCategory: "produce",
    dietCompatibility: ["vegan", "vegetarian", "gluten-free"],
    commonSubstitutes: ["red pepper"],
    variants: [
      {
        locale: "en",
        values: ["tomato", "tomatoes", "fresh tomato", "canned tomatoes"]
      },
      {
        locale: "ar",
        values: ["طماطم", "بندورة"]
      }
    ],
    misspellings: [],
    relatedCanonicals: [],
    isActive: true
  },
  {
    id: "ingredient-potato",
    canonical: "potato",
    category: "starch",
    broadCategory: "produce",
    dietCompatibility: ["vegan", "vegetarian", "gluten-free"],
    commonSubstitutes: ["sweet potato", "cauliflower"],
    variants: [
      {
        locale: "en",
        values: ["potato", "potatoes"]
      },
      {
        locale: "ar",
        values: ["بطاطس", "بطاطا"]
      }
    ],
    misspellings: ["potatos", "paotatos"],
    relatedCanonicals: ["sweet potato"],
    isActive: true
  },
  {
    id: "ingredient-eggplant",
    canonical: "eggplant",
    category: "vegetable",
    broadCategory: "produce",
    dietCompatibility: ["vegan", "vegetarian", "gluten-free"],
    commonSubstitutes: ["zucchini", "cauliflower"],
    variants: [
      {
        locale: "en",
        values: ["eggplant", "aubergine"]
      },
      {
        locale: "ar",
        values: ["باذنجان", "بتنجان"]
      }
    ],
    misspellings: [],
    relatedCanonicals: ["zucchini"],
    isActive: true
  },
  {
    id: "ingredient-cucumber",
    canonical: "cucumber",
    category: "vegetable",
    broadCategory: "produce",
    dietCompatibility: ["vegan", "vegetarian", "gluten-free"],
    commonSubstitutes: ["lettuce"],
    variants: [
      {
        locale: "en",
        values: ["cucumber", "cucumbers"]
      },
      {
        locale: "ar",
        values: ["خيار"]
      }
    ],
    misspellings: [],
    relatedCanonicals: [],
    isActive: true
  },
  {
    id: "ingredient-onion",
    canonical: "onion",
    category: "vegetable",
    broadCategory: "produce",
    dietCompatibility: ["vegan", "vegetarian", "gluten-free"],
    commonSubstitutes: ["shallot"],
    variants: [
      {
        locale: "en",
        values: ["onion", "onions"]
      },
      {
        locale: "ar",
        values: ["بصل"]
      }
    ],
    misspellings: [],
    relatedCanonicals: ["shallot"],
    isActive: true
  },
  {
    id: "ingredient-garlic",
    canonical: "garlic",
    category: "aromatic",
    broadCategory: "produce",
    dietCompatibility: ["vegan", "vegetarian", "gluten-free"],
    commonSubstitutes: ["garlic powder"],
    variants: [
      {
        locale: "en",
        values: ["garlic", "garlic cloves"]
      },
      {
        locale: "ar",
        values: ["ثوم"]
      }
    ],
    misspellings: ["garilic"],
    relatedCanonicals: [],
    isActive: true
  },
  {
    id: "ingredient-olive-oil",
    canonical: "olive oil",
    category: "fat",
    broadCategory: "pantry",
    dietCompatibility: ["vegan", "vegetarian", "gluten-free", "heart-healthy"],
    commonSubstitutes: ["avocado oil"],
    variants: [
      {
        locale: "en",
        values: ["olive oil", "extra virgin olive oil"]
      },
      {
        locale: "ar",
        values: ["زيت زيتون"]
      }
    ],
    misspellings: [],
    relatedCanonicals: ["avocado oil"],
    isActive: true
  },
  {
    id: "ingredient-chickpeas",
    canonical: "chickpeas",
    category: "legume",
    broadCategory: "pantry",
    dietCompatibility: ["vegan", "vegetarian", "gluten-free", "high-fiber"],
    commonSubstitutes: ["lentils", "canned beans"],
    variants: [
      {
        locale: "en",
        values: ["chickpeas", "garbanzo beans"]
      },
      {
        locale: "ar",
        values: ["حمص"]
      }
    ],
    misspellings: [],
    relatedCanonicals: ["lentils", "canned beans"],
    isActive: true
  },
  {
    id: "ingredient-lentils",
    canonical: "lentils",
    category: "legume",
    broadCategory: "pantry",
    dietCompatibility: ["vegan", "vegetarian", "gluten-free", "high-fiber"],
    commonSubstitutes: ["chickpeas", "canned beans"],
    variants: [
      {
        locale: "en",
        values: ["lentils", "red lentils", "brown lentils"]
      },
      {
        locale: "ar",
        values: ["عدس"]
      }
    ],
    misspellings: ["\u0639\u0646\u0633"],
    relatedCanonicals: ["chickpeas"],
    isActive: true
  },
  {
    id: "ingredient-canned-beans",
    canonical: "canned beans",
    category: "legume",
    broadCategory: "pantry",
    dietCompatibility: ["vegan", "vegetarian", "gluten-free", "high-fiber"],
    commonSubstitutes: ["chickpeas", "lentils"],
    variants: [
      {
        locale: "en",
        values: ["beans", "canned beans", "white beans", "kidney beans"]
      },
      {
        locale: "ar",
        values: ["فاصوليا", "فاصوليا معلبة"]
      },
      {
        locale: "ar",
        region: "egypt",
        values: ["فول"]
      }
    ],
    misspellings: [],
    relatedCanonicals: ["chickpeas", "lentils"],
    isActive: true
  },
  {
    id: "ingredient-egg",
    canonical: "egg",
    category: "protein",
    broadCategory: "protein",
    dietCompatibility: ["vegetarian", "gluten-free", "high-protein"],
    commonSubstitutes: ["tofu"],
    variants: [
      {
        locale: "en",
        values: ["egg", "eggs"]
      },
      {
        locale: "ar",
        values: ["بيض"]
      }
    ],
    misspellings: [],
    relatedCanonicals: [],
    isActive: true
  },
  {
    id: "ingredient-bread",
    canonical: "bread",
    category: "grain",
    broadCategory: "bakery",
    dietCompatibility: ["vegetarian"],
    commonSubstitutes: ["pita bread", "toast"],
    variants: [
      { locale: "en", values: ["bread", "toast", "sliced bread"] },
      { locale: "ar", values: ["خبز", "توست"] }
    ],
    misspellings: [],
    relatedCanonicals: [],
    isActive: true
  },
  {
    id: "ingredient-spinach",
    canonical: "spinach",
    category: "vegetable",
    broadCategory: "produce",
    dietCompatibility: ["vegan", "vegetarian", "gluten-free"],
    commonSubstitutes: ["greens", "kale"],
    variants: [
      { locale: "en", values: ["spinach"] },
      { locale: "ar", values: ["سبانخ"] }
    ],
    misspellings: [],
    relatedCanonicals: [],
    isActive: true
  },
  {
    id: "ingredient-basil",
    canonical: "basil",
    category: "herb",
    broadCategory: "produce",
    dietCompatibility: ["vegan", "vegetarian", "gluten-free"],
    commonSubstitutes: ["parsley"],
    variants: [
      { locale: "en", values: ["basil"] },
      { locale: "ar", values: ["ريحان"] }
    ],
    misspellings: [],
    relatedCanonicals: ["parsley"],
    isActive: true
  },
  {
    id: "ingredient-pasta",
    canonical: "pasta",
    category: "grain",
    broadCategory: "pantry",
    dietCompatibility: ["vegetarian"],
    commonSubstitutes: ["rice"],
    variants: [
      { locale: "en", values: ["pasta", "macaroni", "spaghetti"] },
      { locale: "ar", values: ["مكرونة", "معكرونة"] }
    ],
    misspellings: [],
    relatedCanonicals: ["rice"],
    isActive: true
  },
  {
    id: "ingredient-greek-yogurt",
    canonical: "greek yogurt",
    category: "dairy",
    broadCategory: "dairy",
    dietCompatibility: ["vegetarian", "high-protein"],
    commonSubstitutes: ["plain yogurt"],
    variants: [
      { locale: "en", values: ["greek yogurt", "plain yogurt"] },
      { locale: "ar", values: ["زبادي يوناني", "زبادي"] }
    ],
    misspellings: [],
    relatedCanonicals: [],
    isActive: true
  },
  {
    id: "ingredient-mixed-berries",
    canonical: "mixed berries",
    category: "fruit",
    broadCategory: "produce",
    dietCompatibility: ["vegan", "vegetarian", "gluten-free"],
    commonSubstitutes: ["strawberries", "blueberries"],
    variants: [
      { locale: "en", values: ["mixed berries", "berries"] },
      { locale: "ar", values: ["توت مشكل", "توت"] }
    ],
    misspellings: [],
    relatedCanonicals: [],
    isActive: true
  },
  {
    id: "ingredient-granola",
    canonical: "granola",
    category: "grain",
    broadCategory: "pantry",
    dietCompatibility: ["vegetarian"],
    commonSubstitutes: ["oats"],
    variants: [
      { locale: "en", values: ["granola"] },
      { locale: "ar", values: ["جرانولا"] }
    ],
    misspellings: [],
    relatedCanonicals: ["oats"],
    isActive: true
  },
  {
    id: "ingredient-oats",
    canonical: "oats",
    category: "grain",
    broadCategory: "pantry",
    dietCompatibility: ["vegan", "vegetarian"],
    commonSubstitutes: ["granola"],
    variants: [
      { locale: "en", values: ["oats", "oatmeal"] },
      { locale: "ar", values: ["شوفان"] }
    ],
    misspellings: [],
    relatedCanonicals: [],
    isActive: true
  },
  {
    id: "ingredient-banana",
    canonical: "banana",
    category: "fruit",
    broadCategory: "produce",
    dietCompatibility: ["vegan", "vegetarian", "gluten-free"],
    commonSubstitutes: ["dates"],
    variants: [
      { locale: "en", values: ["banana", "bananas"] },
      { locale: "ar", values: ["موز"] }
    ],
    misspellings: [],
    relatedCanonicals: [],
    isActive: true
  },
  {
    id: "ingredient-cinnamon",
    canonical: "cinnamon",
    category: "spice",
    broadCategory: "pantry",
    dietCompatibility: ["vegan", "vegetarian", "gluten-free"],
    commonSubstitutes: [],
    variants: [
      { locale: "en", values: ["cinnamon"] },
      { locale: "ar", values: ["قرفة"] }
    ],
    misspellings: [],
    relatedCanonicals: [],
    isActive: true
  },
  {
    id: "ingredient-avocado",
    canonical: "avocado",
    category: "fruit",
    broadCategory: "produce",
    dietCompatibility: ["vegan", "vegetarian", "gluten-free"],
    commonSubstitutes: ["cucumber"],
    variants: [
      { locale: "en", values: ["avocado"] },
      { locale: "ar", values: ["أفوكادو"] }
    ],
    misspellings: [],
    relatedCanonicals: [],
    isActive: true
  },
  {
    id: "ingredient-tofu",
    canonical: "tofu",
    category: "protein",
    broadCategory: "plant-protein",
    dietCompatibility: ["vegan", "vegetarian", "gluten-free", "high-protein"],
    commonSubstitutes: ["chicken breast", "egg"],
    variants: [
      { locale: "en", values: ["tofu"] },
      { locale: "ar", values: ["توفو"] }
    ],
    misspellings: [],
    relatedCanonicals: [],
    isActive: true
  },
  {
    id: "ingredient-turkey-breast",
    canonical: "turkey breast",
    category: "protein",
    broadCategory: "meat",
    dietCompatibility: ["high-protein", "gluten-free"],
    commonSubstitutes: ["chicken breast"],
    variants: [
      { locale: "en", values: ["turkey breast", "turkey"] },
      { locale: "ar", values: ["صدر ديك رومي", "ديك رومي"] }
    ],
    misspellings: [],
    relatedCanonicals: ["chicken breast"],
    isActive: true
  },
  {
    id: "ingredient-quinoa",
    canonical: "quinoa",
    category: "grain",
    broadCategory: "pantry",
    dietCompatibility: ["vegan", "vegetarian", "gluten-free", "high-fiber"],
    commonSubstitutes: ["rice"],
    variants: [
      { locale: "en", values: ["quinoa"] },
      { locale: "ar", values: ["كينوا"] }
    ],
    misspellings: [],
    relatedCanonicals: ["rice"],
    isActive: true
  },
  {
    id: "ingredient-salmon",
    canonical: "salmon",
    category: "protein",
    broadCategory: "seafood",
    dietCompatibility: ["high-protein", "gluten-free", "heart-healthy"],
    commonSubstitutes: ["white fish"],
    variants: [
      { locale: "en", values: ["salmon", "salmon fillets"] },
      { locale: "ar", values: ["سلمون", "شرائح سلمون"] }
    ],
    misspellings: [],
    relatedCanonicals: [],
    isActive: true
  },
  {
    id: "ingredient-shrimp",
    canonical: "shrimp",
    category: "protein",
    broadCategory: "seafood",
    dietCompatibility: ["high-protein", "gluten-free"],
    commonSubstitutes: ["prawns", "white fish"],
    variants: [
      { locale: "en", values: ["shrimp", "shrimps", "prawn", "prawns"] },
      { locale: "ar", values: ["جمبري", "روبيان", "قريدس"] }
    ],
    misspellings: [],
    relatedCanonicals: ["salmon"],
    isActive: true
  },
  {
    id: "ingredient-asparagus",
    canonical: "asparagus",
    category: "vegetable",
    broadCategory: "produce",
    dietCompatibility: ["vegan", "vegetarian", "gluten-free"],
    commonSubstitutes: ["broccoli"],
    variants: [
      { locale: "en", values: ["asparagus"] },
      { locale: "ar", values: ["هليون"] }
    ],
    misspellings: [],
    relatedCanonicals: ["broccoli"],
    isActive: true
  },
  {
    id: "ingredient-cauliflower",
    canonical: "cauliflower",
    category: "vegetable",
    broadCategory: "produce",
    dietCompatibility: ["vegan", "vegetarian", "gluten-free"],
    commonSubstitutes: ["broccoli"],
    variants: [
      { locale: "en", values: ["cauliflower"] },
      { locale: "ar", values: ["قرنبيط"] }
    ],
    misspellings: [],
    relatedCanonicals: ["broccoli"],
    isActive: true
  },
  {
    id: "ingredient-parsley",
    canonical: "parsley",
    category: "herb",
    broadCategory: "produce",
    dietCompatibility: ["vegan", "vegetarian", "gluten-free"],
    commonSubstitutes: ["basil"],
    variants: [
      { locale: "en", values: ["parsley"] },
      { locale: "ar", values: ["بقدونس"] }
    ],
    misspellings: [],
    relatedCanonicals: ["basil"],
    isActive: true
  },
  {
    id: "ingredient-lemon",
    canonical: "lemon",
    category: "fruit",
    broadCategory: "produce",
    dietCompatibility: ["vegan", "vegetarian", "gluten-free"],
    commonSubstitutes: ["lime"],
    variants: [
      { locale: "en", values: ["lemon"] },
      { locale: "ar", values: ["ليمون"] }
    ],
    misspellings: [],
    relatedCanonicals: [],
    isActive: true
  },
  {
    id: "ingredient-zucchini",
    canonical: "zucchini",
    category: "vegetable",
    broadCategory: "produce",
    dietCompatibility: ["vegan", "vegetarian", "gluten-free"],
    commonSubstitutes: ["eggplant"],
    variants: [
      { locale: "en", values: ["zucchini"] },
      { locale: "ar", values: ["كوسة", "كوسا"] }
    ],
    misspellings: [],
    relatedCanonicals: ["eggplant"],
    isActive: true
  },
  {
    id: "ingredient-bell-pepper",
    canonical: "bell pepper",
    category: "vegetable",
    broadCategory: "produce",
    dietCompatibility: ["vegan", "vegetarian", "gluten-free"],
    commonSubstitutes: ["tomato"],
    variants: [
      { locale: "en", values: ["bell pepper", "peppers"] },
      { locale: "ar", values: ["فلفل رومي", "فلفل"] }
    ],
    misspellings: [],
    relatedCanonicals: [],
    isActive: true
  },
  {
    id: "ingredient-fava-beans",
    canonical: "fava beans",
    category: "legume",
    broadCategory: "pantry",
    dietCompatibility: ["vegan", "vegetarian", "gluten-free", "high-fiber"],
    commonSubstitutes: ["canned beans", "chickpeas"],
    variants: [
      { locale: "en", values: ["fava beans", "broad beans"] },
      { locale: "ar", values: ["فول", "فول مدمس"] }
    ],
    misspellings: [],
    relatedCanonicals: ["canned beans"],
    isActive: true
  },
  {
    id: "ingredient-parmesan",
    canonical: "parmesan",
    category: "dairy",
    broadCategory: "dairy",
    dietCompatibility: ["vegetarian"],
    commonSubstitutes: ["mozzarella"],
    variants: [
      { locale: "en", values: ["parmesan", "parmesan cheese"] },
      { locale: "ar", values: ["بارميزان", "جبنة بارميزان"] }
    ],
    misspellings: [],
    relatedCanonicals: ["mozzarella"],
    isActive: true
  },
  {
    id: "ingredient-mozzarella",
    canonical: "mozzarella",
    category: "dairy",
    broadCategory: "dairy",
    dietCompatibility: ["vegetarian"],
    commonSubstitutes: ["parmesan"],
    variants: [
      { locale: "en", values: ["mozzarella", "mozzarella cheese"] },
      { locale: "ar", values: ["موتزاريلا", "جبنة موتزاريلا"] }
    ],
    misspellings: [],
    relatedCanonicals: ["parmesan"],
    isActive: true
  }
];
