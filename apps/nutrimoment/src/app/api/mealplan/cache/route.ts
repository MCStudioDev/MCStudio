import { z } from "zod";
import { normalizeMealPlanData } from "@/lib/mealPlan";
import { normalizePilotLanguage, recipeLanguageFromUiLanguage } from "@/lib/language";
import { accessErrorResponse, requireUser } from "@/services/authService";
import { logger } from "@/lib/logger";
import { persistGeneratedRecipeCache } from "@/services/userRecipeCacheService";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  mealPlan: z.unknown(),
  uiLanguage: z.string().optional()
});

export async function POST(request: Request) {
  try {
    const access = await requireUser(request);
    if (!access.isPremium) {
      return Response.json({ error: "Meal plan recipe caching is a premium feature." }, { status: 403 });
    }

    const parsed = requestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: "Meal plan data is required." }, { status: 400 });
    }

    const mealPlan = normalizeMealPlanData(parsed.data.mealPlan);
    if (!mealPlan) {
      return Response.json({ error: "Meal plan data was not usable." }, { status: 400 });
    }

    const recipeLanguage = recipeLanguageFromUiLanguage(normalizePilotLanguage(parsed.data.uiLanguage, "en"));
    const meals = mealPlan.plan.flatMap((day) => [day.breakfast, day.lunch, day.dinner]);
    await persistGeneratedRecipeCache({
      uid: access.uid,
      recipeLanguage,
      meals,
      recipes: mealPlan.recommendedRecipes
    });

    logger.info("Meal plan recipes persisted to recipe cache", {
      uid: access.uid,
      mealCount: meals.length,
      recipeCount: mealPlan.recommendedRecipes?.length ?? 0
    });

    return Response.json({ ok: true, mealCount: meals.length });
  } catch (error) {
    if (error instanceof Error && (error.message.includes("Sign in") || error.message.includes("Firebase Admin credentials"))) {
      return accessErrorResponse(error);
    }

    logger.warn("Meal plan recipe cache persistence failed", {
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    return Response.json({ error: "Meal plan recipe cache persistence failed." }, { status: 500 });
  }
}
