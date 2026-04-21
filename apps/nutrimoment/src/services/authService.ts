export function getOptionalRequestUserId(request: Request): string | null {
  const explicitUser = request.headers.get("x-user-id");
  if (explicitUser) return explicitUser;

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  // Placeholder until Firebase Admin verification is added.
  // The Phase 1 security pass should replace this with real token verification.
  return null;
}
