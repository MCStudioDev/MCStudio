import { getRequestAccess, accessErrorResponse } from "@/services/authService";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { arabicPaths, readArabicHistory, removeArabicHistory } from "@/services/arabic/repository";
import { readEnglishSource, englishSourceFingerprint } from "@/services/arabic/englishSources";

// Existing Arabic results remain readable even when new Arabic generation is disabled.
export async function GET(request: Request) {
  try {
    const { uid } = await getRequestAccess(request);
    const [items, plan] = await Promise.all([readArabicHistory(uid), getAdminDb().doc(arabicPaths.plan(uid)).get()]);
    const currentSources = new Map<string, Promise<string | null>>();
    const blocked = async (refs: Record<string, { id: string; fingerprint: string }> = {}) => {
      const ids = new Set<string>();
      for (const [recipeId, reference] of Object.entries(refs)) {
        if (!currentSources.has(reference.id)) currentSources.set(reference.id, readEnglishSource(reference.id).then(source => source ? englishSourceFingerprint(source) : null).catch(() => null));
        if (await currentSources.get(reference.id) !== reference.fingerprint) ids.add(recipeId);
      }
      return ids;
    };
    const visibleItems = [];
    for (const item of items) {
      const invalid = await blocked(item.englishSources);
      visibleItems.push({ ...item, recipes: item.recipes.filter(recipe => !invalid.has(recipe.id ?? "")), ...(invalid.size ? { generationMessage: "بعض الوصفات غير متاحة لأن مصدرها تغير أو لم يعد معتمدًا." } : {}) });
    }
    const planData = plan.data();
    const invalidPlanSources = await blocked(planData?.englishSources);
    return Response.json({ items: visibleItems, mealPlan: invalidPlanSources.size ? null : planData?.mealPlan ?? null }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return accessErrorResponse(error); }
}
export async function DELETE(request: Request) {
  try {
    const { uid } = await getRequestAccess(request);
    const id = new URL(request.url).searchParams.get("id");
    if (!id || !/^[\w-]+$/.test(id)) return Response.json({ error: "Invalid history identifier" }, { status: 400 });
    await removeArabicHistory(uid, id);
    return Response.json({ ok: true });
  } catch (error) { return accessErrorResponse(error); }
}
