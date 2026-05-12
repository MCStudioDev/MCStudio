import { HAS_GEMINI_API_KEY, USE_MOCK } from "@/lib/openai";
import { hasFirebaseAdminConfig } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

export async function GET() {
  const hasUnsplash = Boolean(process.env.UNSPLASH_ACCESS_KEY?.trim());
  const hasPexels = Boolean(process.env.PEXELS_API_KEY?.trim());
  const hasReplicate = Boolean(process.env.REPLICATE_API_TOKEN?.trim());
  const hasAppUrl = Boolean(process.env.NEXT_PUBLIC_APP_URL?.trim());
  const mockEnabledInProd = USE_MOCK && process.env.NODE_ENV === "production";

  const checks = {
    aiProvider: USE_MOCK || HAS_GEMINI_API_KEY ? "ok" : "missing_config",
    firebaseAdmin: hasFirebaseAdminConfig() ? "ok" : "missing_config",
    nodeEnv: process.env.NODE_ENV ?? "unknown",
    appUrl: hasAppUrl ? "ok" : "missing_config",
    recipePhotosFreeTier: hasUnsplash || hasPexels ? "ok" : "missing_config",
    premiumImageGeneration: hasReplicate ? "ok" : "missing_optional",
    mockMode: mockEnabledInProd ? "danger" : "ok"
  };
  const requiredOk =
    checks.aiProvider === "ok" &&
    checks.firebaseAdmin === "ok" &&
    checks.appUrl === "ok" &&
    checks.recipePhotosFreeTier === "ok" &&
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
