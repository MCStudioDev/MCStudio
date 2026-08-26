import { accessErrorResponse, accessPayload, getRequestAccess } from "@/services/authService";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const access = await getRequestAccess(request, { ensureProfileDefaults: true });
    return Response.json({
      ok: true,
      access: accessPayload(access)
    });
  } catch (error) {
    return accessErrorResponse(error);
  }
}
