import { z } from "zod";
import { USE_MOCK, callOpenAIText, ensureAiAvailable, extractJson } from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  prompt: z.string().min(20)
});

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const MOCK_MEAL_PLAN = {
  plan: DAYS.map((day) => ({
    day,
    breakfast: { name: "Greek yogurt with berries and granola", calories: 380, protein: "20g", carbs: "45g", fat: "10g" },
    lunch: { name: "Quinoa salad with grilled chicken", calories: 520, protein: "38g", carbs: "55g", fat: "16g" },
    dinner: { name: "Salmon with roasted vegetables", calories: 580, protein: "42g", carbs: "30g", fat: "26g" }
  })),
  shoppingList: [
    "Greek yogurt",
    "Mixed berries",
    "Granola",
    "Quinoa",
    "Chicken breast",
    "Salmon fillets",
    "Asparagus",
    "Sweet potato",
    "Lemon",
    "Olive oil"
  ]
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }

    if (USE_MOCK) {
      return Response.json({ result: JSON.stringify(MOCK_MEAL_PLAN) });
    }

    ensureAiAvailable();
    const text = await callOpenAIText(parsed.data.prompt);
    const json = extractJson(text);
    return Response.json({ result: json });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Meal plan generation failed";
    return Response.json({ error: message }, { status: message.includes("OPENAI_API_KEY") ? 503 : 500 });
  }
}
