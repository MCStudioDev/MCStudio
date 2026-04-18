import { USE_MOCK, callOpenAIText, ensureAiAvailable, extractJson } from "@/lib/openai";

const MOCK_RECIPES = {
  recipes: [
    {
      name: "Classic Garlic Chicken with Tomatoes",
      cuisine: "Italian",
      ingredients: ["chicken", "garlic", "tomato", "olive oil", "basil"],
      missing_ingredients: ["parmesan cheese"],
      steps: [
        "Heat olive oil in a large pan over medium heat",
        "Add minced garlic and saute until fragrant (1 minute)",
        "Add chicken pieces and cook until golden (8-10 minutes)",
        "Add chopped tomatoes and simmer for 15 minutes",
        "Season with salt, pepper, and fresh basil",
        "Serve hot with pasta or rice"
      ],
      calories: 450,
      protein: "38g",
      carbs: "12g",
      fat: "28g",
      cook_time: "30 mins",
      difficulty: "Easy"
    },
    {
      name: "Creamy Garlic Chicken Pasta",
      cuisine: "Italian-American",
      ingredients: ["chicken", "garlic", "tomato", "olive oil", "basil", "onion"],
      missing_ingredients: ["cream", "parmesan"],
      steps: [
        "Cook pasta according to package directions",
        "Pan-fry chicken with garlic and onions",
        "Add crushed tomatoes and simmer",
        "Combine pasta with the sauce",
        "Top with fresh basil",
        "Serve immediately"
      ],
      calories: 520,
      protein: "42g",
      carbs: "45g",
      fat: "15g",
      cook_time: "25 mins",
      difficulty: "Easy"
    },
    {
      name: "Tomato and Basil Chicken Skewers",
      cuisine: "Mediterranean",
      ingredients: ["chicken", "tomato", "basil", "garlic", "olive oil"],
      missing_ingredients: ["bell peppers"],
      steps: [
        "Cut chicken into cubes",
        "Thread onto skewers alternating with tomatoes",
        "Brush with garlic-infused olive oil",
        "Grill for 12-15 minutes, turning occasionally",
        "Season with basil, salt and pepper",
        "Rest for 2 minutes before serving"
      ],
      calories: 380,
      protein: "40g",
      carbs: "8g",
      fat: "22g",
      cook_time: "20 mins",
      difficulty: "Medium"
    }
  ]
};

export async function POST(request: Request) {
  try {
    const { ingredients } = await request.json();

    if (!ingredients || ingredients.length === 0) {
      return Response.json(
        { error: "No ingredients provided" },
        { status: 400 }
      );
    }

    if (USE_MOCK) {
      return Response.json(MOCK_RECIPES);
    }

    ensureAiAvailable();

    const prompt = `Generate 3 creative and delicious recipes based on these ingredients: ${ingredients.join(", ")}

For each recipe, provide the response in the following JSON format:
{
  "recipes": [
    {
      "name": "Recipe Name",
      "cuisine": "Cuisine Type",
      "ingredients": ["ingredient1", "ingredient2"],
      "missing_ingredients": ["optional missing ingredient"],
      "steps": ["Step 1", "Step 2"],
      "calories": 450,
      "protein": "35g",
      "carbs": "45g",
      "fat": "15g",
      "cook_time": "30 mins",
      "difficulty": "Easy"
    }
  ]
}

Make sure the recipes are:
1. Creative and interesting
2. Using mostly the provided ingredients
3. Include realistic nutrition information
4. Include clear cooking steps
5. Vary the cuisine types

Return ONLY the JSON and no other text.`;

    const text = await callOpenAIText(prompt, "gpt-4.1-mini");
    const json = extractJson(text);
    const recipes = JSON.parse(json);

    return Response.json(recipes);
  } catch (error) {
    console.error("Error generating recipes:", error);
    const message = error instanceof Error ? error.message : "Failed to generate recipes";
    return Response.json(
      { error: message },
      { status: message.includes("OPENAI_API_KEY") ? 503 : 500 }
    );
  }
}
