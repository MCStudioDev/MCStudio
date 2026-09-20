/** Retire old clients before authentication, billing, cache lookup or history writes. */
export async function rejectLegacyArabicGeneration(
  request: Request,
  replacement: "/api/ar/generate-recipes" | "/api/ar/mealplan"
): Promise<Response | null> {
  let body: unknown;
  try {
    // Leave the original stream and its existing English error handling untouched.
    body = await request.clone().json();
  } catch {
    return null;
  }
  if (!body || typeof body !== "object" || !("uiLanguage" in body) || body.uiLanguage !== "ar") return null;
  return Response.json({
    code: "LEGACY_ARABIC_WORKFLOW_RETIRED",
    error: "تم تحديث توليد الوصفات العربية. حدّث الصفحة ثم حاول مجددًا. لم يتم خصم رصيد أو تغيير نتائجك السابقة.",
    replacement
  }, { status: 410, headers: { "Cache-Control": "no-store" } });
}
