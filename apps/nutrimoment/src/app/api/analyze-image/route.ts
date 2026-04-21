import { USE_MOCK, callOpenAIVision, ensureAiAvailable, extractJson } from "@/lib/openai";

export async function POST(request: Request) {
  try {
    const { image } = await request.json();

    if (!image) {
      return Response.json(
        { error: "No image provided" },
        { status: 400 }
      );
    }

    if (USE_MOCK) {
      const mockIngredients = ["chicken", "garlic", "onion", "tomato", "olive oil", "basil"];
      return Response.json({ ingredients: mockIngredients });
    }

    ensureAiAvailable();
    const prompt = `Analyze this image and extract all food ingredients visible in it.

Return ONLY a JSON object with this exact format:
{
  "ingredients": ["ingredient1", "ingredient2", "ingredient3"]
}

Important:
- Only include actual food ingredients
- Use singular form for ingredients
- Return an empty array if no food items are visible
- Return ONLY the JSON and no other text.`;

    const text = await callOpenAIVision(prompt, image, "gemini-2.5-flash");
    const json = extractJson(text);
    const parsedResult = JSON.parse(json);

    return Response.json(parsedResult);
  } catch (error) {
    console.error("Error analyzing image:", error);
    const message = error instanceof Error ? error.message : "Failed to analyze image";

    return Response.json(
      { error: message, ingredients: [] },
      { status: message.includes("GEMINI_API_KEY") ? 503 : 500 }
    );
  }
}
