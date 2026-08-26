import { POST as generateRecipes } from "@/app/api/generate-recipes/route";

// Legacy compatibility endpoint. Keep one recipe policy by delegating every
// request to the canonical generation route.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  return generateRecipes(request);
}
