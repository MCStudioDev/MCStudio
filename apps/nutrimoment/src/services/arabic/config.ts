export const ARABIC_VALIDATOR_VERSION = "arabic-v1";
export const ARABIC_REQUEST_BUDGET_MS = 70_000;
export function arabicEnabled() { return process.env.ARABIC_GENERATION_ENABLED === "true"; }
export function arabicDisabledResponse() {
  return Response.json({ code: "ARABIC_GENERATION_DISABLED", error: "التوليد بالعربية غير متاح حاليًا. يمكنك التبديل إلى الإنجليزية والمتابعة." }, { status: 503 });
}
