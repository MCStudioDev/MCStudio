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
