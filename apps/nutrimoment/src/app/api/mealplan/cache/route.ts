import { z } from "zod";
import { normalizeMealPlanData } from "@/lib/mealPlan";
import { normalizePilotLanguage, recipeLanguageFromUiLanguage } from "@/lib/language";
import { accessErrorResponse, hasFreeAiActionImageGrant, requireUser } from "@/services/authService";
import { logger } from "@/lib/logger";
import { persistGeneratedRecipeCache } from "@/services/userRecipeCacheService";
import type { DietEnforcementContext } from "@/lib/dietEnforcement";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { validateMealPlanRecipeContracts } from "@/services/mealPlanRecipeContractService";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  actionGrantId: z.string().min(1).max(128).optional(),
  allergens: z.array(z.string()).optional(),
  conditions: z.array(z.string()).optional(),
  diets: z.array(z.string()).optional(),
  mealPlan: z.unknown(),
  preferredCuisine: z.string().optional(),
  uiLanguage: z.string().optional()
});

export async function POST(request: Request) {
  try {
    const access = await requireUser(request);
    const parsed = requestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: "Meal plan data is required." }, { status: 400 });
    }
    const hasActionGrant = await hasFreeAiActionImageGrant(access, parsed.data.actionGrantId);
    if (!access.isPremium && !access.isAdmin && !hasActionGrant) {
      return Response.json({ error: "Meal plan recipe caching is a premium feature." }, { status: 403 });
    }

    const mealPlan = normalizeMealPlanData(parsed.data.mealPlan);
    if (!mealPlan) {
      return Response.json({ error: "Meal plan data was not usable." }, { status: 400 });
    }

    const recipeLanguage = recipeLanguageFromUiLanguage(normalizePilotLanguage(parsed.data.uiLanguage, "en"));
    const meals = mealPlan.plan.flatMap((day) => [day.breakfast, day.lunch, day.dinner]);
    const profile = await loadMealPlanContractProfile(access.uid, {
      diets: parsed.data.diets ?? [],
      allergens: parsed.data.allergens ?? []
    });
    const conditions = mergeStrings(parsed.data.conditions ?? [], profile.conditions);
    const contractIssues = validateMealPlanRecipeContracts(mealPlan, {
      conditions,
      dietContext: profile.dietContext,
      preferredCuisine: parsed.data.preferredCuisine,
      recipeLanguage
    });
    if (contractIssues.length) {
      logger.warn("Rejected noncompliant meal plan recipe cache write", {
        uid: access.uid,
        issueCount: contractIssues.length,
        reasons: Array.from(new Set(contractIssues.flatMap((issue) => issue.reasons))).slice(0, 20)
      });
      return Response.json(
        { error: "Meal plan recipes must pass recipe validation before caching." },
        { status: 422 }
      );
    }
    await persistGeneratedRecipeCache({
      uid: access.uid,
      recipeLanguage,
      meals,
      dietContext: profile.dietContext
    });

    logger.info("Meal plan recipes persisted to recipe cache", {
      uid: access.uid,
      mealCount: meals.length
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

async function loadMealPlanContractProfile(
  uid: string,
  requestContext: DietEnforcementContext
): Promise<{ conditions: string[]; dietContext: DietEnforcementContext }> {
  try {
    const snapshot = await getAdminDb().doc(`users/${uid}/profile/health`).get();
    const data = snapshot.data();
    return {
      conditions: readStringArray(data?.conditions),
      dietContext: {
        diets: mergeStrings(requestContext.diets, readStringArray(data?.diets)),
        allergens: mergeStrings(requestContext.allergens, readStringArray(data?.allergens))
      }
    };
  } catch (error) {
    logger.warn("Meal plan cache diet context read failed; using request context", {
      uid,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    return { conditions: [], dietContext: requestContext };
  }
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function mergeStrings(...groups: string[][]) {
  return Array.from(new Set(groups.flat().map((value) => value.trim()).filter(Boolean)));
}
