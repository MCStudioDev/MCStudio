export const ARABIC_VALIDATOR_VERSION = "arabic-v4-facts";
// Legacy records are reusable only after the complete current validator runs.
export const ARABIC_READABLE_VERSIONS = new Set(["arabic-v3", ARABIC_VALIDATOR_VERSION]);
export const ARABIC_REQUEST_BUDGET_MS = 70_000;
export function arabicEnabled() { return process.env.ARABIC_GENERATION_ENABLED === "true"; }
export function arabicDisabledResponse() {
  return Response.json({ code: "ARABIC_GENERATION_DISABLED", error: "التوليد بالعربية غير متاح حاليًا. يمكنك التبديل إلى الإنجليزية والمتابعة." }, { status: 503 });
}
