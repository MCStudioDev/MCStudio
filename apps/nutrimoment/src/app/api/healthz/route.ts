import { HAS_GEMINI_API_KEY, USE_MOCK } from "@/lib/openai";
import { hasFirebaseAdminConfig } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

export async function GET() {
  const hasReplicate = Boolean(process.env.REPLICATE_API_TOKEN?.trim());
  const hasAppUrl = Boolean(process.env.NEXT_PUBLIC_APP_URL?.trim());
  const mockEnabledInProd = USE_MOCK && process.env.NODE_ENV === "production";

  const checks = {
    aiProvider: USE_MOCK || HAS_GEMINI_API_KEY ? "ok" : "missing_config",
    firebaseAdmin: hasFirebaseAdminConfig() ? "ok" : "missing_config",
    nodeEnv: process.env.NODE_ENV ?? "unknown",
    appUrl: hasAppUrl ? "ok" : "missing_config",
    recipePhotoGeneration: hasReplicate ? "ok" : "missing_config",
    mockMode: mockEnabledInProd ? "danger" : "ok"
  };
  const requiredOk =
    checks.aiProvider === "ok" &&
    checks.firebaseAdmin === "ok" &&
    checks.appUrl === "ok" &&
    checks.recipePhotoGeneration === "ok" &&
    checks.mockMode === "ok";

  return Response.json(
    {
      checks,
      ok: requiredOk,
      service: "nutrimoment",
      timestamp: new Date().toISOString()
    },
    {
      headers: {
        "Cache-Control": "no-store"
      },
      status: requiredOk ? 200 : 503
    }
  );
}
