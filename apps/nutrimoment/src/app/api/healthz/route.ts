import { HAS_GEMINI_API_KEY, USE_MOCK } from "@/lib/openai";
import { hasFirebaseAdminConfig } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

export async function GET() {
  const checks = {
    aiProvider: USE_MOCK || HAS_GEMINI_API_KEY ? "ok" : "missing_config",
    firebaseAdmin: hasFirebaseAdminConfig() ? "ok" : "missing_config",
    nodeEnv: process.env.NODE_ENV ?? "unknown",
    recipePhotos: process.env.UNSPLASH_ACCESS_KEY || process.env.PEXELS_API_KEY ? "ok" : "optional_missing"
  };
  const requiredOk = checks.aiProvider === "ok" && checks.firebaseAdmin === "ok";

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
