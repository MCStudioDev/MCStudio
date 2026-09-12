import { z } from "zod";
import { getRequestAccess, accessErrorResponse, hasGeneratedRecipeImageAccess, hasFreeAiActionImageGrantForKey, consumeFreeAiActionImageGrant } from "@/services/authService";
import { loadGenerationRestrictions } from "@/services/generationProfileService";
import { applyRateLimit, rateLimitedResponse } from "@/services/rateLimitService";
import { arabicEnabled, arabicDisabledResponse } from "@/services/arabic/config";
import { readValidatedArabicEntry, resolveArabicImage } from "@/services/arabic/images";

export const runtime = "nodejs";
export const maxDuration = 90;
export async function POST(request: Request) {
  if (!arabicEnabled()) return arabicDisabledResponse();
  let authenticated = false;
  try {
    const access = await getRequestAccess(request); authenticated = true;
    const limit = applyRateLimit({ uid: access.uid, feature: "recipe_image", isPremium: access.isPremium, bypass: access.isAdmin });
    if (!limit.decision.allowed) return rateLimitedResponse(limit.decision, limit.config);
    const parsed = z.object({ recipeId: z.string().regex(/^ar-[a-f0-9]{24}$/), actionGrantId: z.string().regex(/^[\w-]{1,128}$/).optional() }).safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Invalid recipe" }, { status: 400 });
    const restrictions = await loadGenerationRestrictions(access.uid);
    const entry = await readValidatedArabicEntry(parsed.data.recipeId, restrictions);
    const grantKey = `arabic:${entry.id}`;
    const parentGrant = await hasFreeAiActionImageGrantForKey(access, parsed.data.actionGrantId, grantKey);
    const allowed = hasGeneratedRecipeImageAccess(access) || (parentGrant && await consumeFreeAiActionImageGrant(access, parsed.data.actionGrantId, grantKey));
    const imageUrl = await resolveArabicImage(entry, restrictions, access, allowed);
    return Response.json({ imageUrl, imageSource: "replicate" });
  } catch (error) {
    if (!authenticated) return accessErrorResponse(error);
    return Response.json({ error: "تعذر توفير صورة مطابقة للوصفة الآن." }, { status: 503 });
  }
}
