import type { Recipe } from "@/lib/types";
export const restrictions = { diets: ["pescatarian"], conditions: [], allergens: [] };
export const canonical: Recipe = {
  name: "Salmon Rice Bowl", cuisine: "Mediterranean",
  ingredients: ["200 g salmon", "1 cup rice", "1 cup water"], missing_ingredients: [],
  steps: ["Rinse the rice and put the rice and water in a saucepan.", "Cover and cook the rice for 15 minutes until tender.", "Cook the salmon in a hot pan for 10 minutes, then serve the salmon over the rice."],
  calories: 500, protein: "40g", carbs: "50g", fat: "15g", cook_time: "25 minutes", difficulty: "Easy"
};
export const arabic: Recipe = {
  name: "طبق السلمون مع الأرز", cuisine: "متوسطية",
  ingredients: ["٢٠٠ غرام سلمون", "١ كوب أرز", "١ كوب ماء"], missing_ingredients: [],
  steps: ["اغسل الأرز ثم ضع الأرز والماء في قدر.", "غط القدر واطبخ الأرز لمدة ١٥ دقيقة حتى ينضج.", "اطبخ السلمون في مقلاة ساخنة لمدة ١٠ دقائق ثم قدم السلمون فوق الأرز."],
  calories: 500, protein: "٤٠ غرام", carbs: "٥٠ غرام", fat: "١٥ غرام", cook_time: "٢٥ دقيقة", difficulty: "سهل"
};

export const veganCanonical: Recipe = {
  name: "Egyptian Fava Bean and Tomato Rice", cuisine: "Egyptian",
  ingredients: ["200 g fava beans", "1 cup rice", "1 piece tomato", "1 tbsp olive oil", "1/2 tsp cumin", "0.25 tsp salt", "4 cup water"], missing_ingredients: [],
  steps: [
    "Rinse the fava beans, then boil the fava beans in water for 60 minutes until tender.",
    "Drain the fava beans. Rinse the rice and cut the tomato into small pieces.",
    "Add the olive oil, tomato and cumin to a pot and cook for 5 minutes.",
    "Add the rice, fava beans, salt and water. Cover and simmer for 20 minutes, then serve the rice."
  ],
  calories: 450, protein: "15g", carbs: "80g", fat: "8g", cook_time: "85 minutes", difficulty: "Easy"
};
export const veganArabic: Recipe = {
  name: "أرز مصري بالفول والطماطم", cuisine: "مصري",
  ingredients: ["٢٠٠ غرام فول", "١ كوب أرز", "١ حبة طماطم", "١ ملعقة كبيرة زيت زيتون", "½ ملعقة صغيرة كمون", "٠٫٢٥ ملعقة صغيرة ملح", "٤ كوب ماء"], missing_ingredients: [],
  steps: [
    "اغسل الفول ثم اسلق الفول في الماء لمدة ٦٠ دقيقة حتى ينضج.",
    "صف الفول. اغسل الأرز وقطع الطماطم إلى قطع صغيرة.",
    "أضف زيت الزيتون والطماطم والكمون إلى قدر واطه المزيج لمدة ٥ دقائق.",
    "أضف الأرز والفول والملح والماء. غط القدر واتركه يغلي على نار هادئة لمدة ٢٠ دقيقة ثم قدم الأرز."
  ],
  calories: 450, protein: "١٥ غرام", carbs: "٨٠ غرام", fat: "٨ غرام", cook_time: "٨٥ دقيقة", difficulty: "سهل"
};
