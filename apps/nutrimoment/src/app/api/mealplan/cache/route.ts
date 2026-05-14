import { z } from "zod";
import { normalizeMealPlanData } from "@/lib/mealPlan";
import { normalizePilotLanguage, recipeLanguageFromUiLanguage } from "@/lib/language";
import { accessErrorResponse, requireUser } from "@/services/authService";
import { logger } from "@/lib/logger";
import { persistGeneratedRecipeCache } from "@/services/userRecipeCacheService";
import type { DietEnforcementContext } from "@/lib/dietEnforcement";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  allergens: z.array(z.string()).optional(),
  diets: z.array(z.string()).optional(),
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
    const dietContext = await loadDietContextForUser(access.uid, {
      diets: parsed.data.diets ?? [],
      allergens: parsed.data.allergens ?? []
    });
    await persistGeneratedRecipeCache({
      uid: access.uid,
      recipeLanguage,
      meals,
      recipes: mealPlan.recommendedRecipes,
      dietContext
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

async function loadDietContextForUser(uid: string, requestContext: DietEnforcementContext): Promise<DietEnforcementContext> {
  try {
    const snapshot = await getAdminDb().doc(`users/${uid}/profile/health`).get();
    const data = snapshot.data();
    return {
      diets: mergeStrings(requestContext.diets, readStringArray(data?.diets)),
      allergens: mergeStrings(requestContext.allergens, readStringArray(data?.allergens))
    };
  } catch (error) {
    logger.warn("Meal plan cache diet context read failed; using request context", {
      uid,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    return requestContext;
  }
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function mergeStrings(...groups: string[][]) {
  return Array.from(new Set(groups.flat().map((value) => value.trim()).filter(Boolean)));
}
