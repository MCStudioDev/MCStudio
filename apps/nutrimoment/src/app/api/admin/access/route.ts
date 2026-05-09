import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { accessErrorResponse, requireAdmin, type AccessRole, type AccessTier } from "@/services/authService";

export const runtime = "nodejs";

const requestSchema = z
  .object({
    uid: z.string().optional(),
    email: z.string().email().optional(),
    role: z.enum(["admin", "user"]).optional(),
    tier: z.enum(["free", "premium"]).optional()
  })
  .refine((value) => Boolean(value.uid || value.email), {
    message: "Provide uid or email."
  });

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin(request);
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid access update", details: parsed.error.format() }, { status: 400 });
    }

    const auth = getAdminAuth();
    const db = getAdminDb();
    const targetUser = parsed.data.uid
      ? await auth.getUser(parsed.data.uid)
      : await auth.getUserByEmail(parsed.data.email!);

    const existingClaims = targetUser.customClaims ?? {};
    const role = (parsed.data.role ?? existingClaims.role ?? "user") as AccessRole;
    const tier = (parsed.data.tier ?? existingClaims.tier ?? "free") as AccessTier;
    const nextClaims = { ...existingClaims, role, tier };

    await auth.setCustomUserClaims(targetUser.uid, nextClaims);

    await db.doc(`entitlements/${targetUser.uid}`).set(
      {
        uid: targetUser.uid,
        email: targetUser.email ?? parsed.data.email ?? null,
        role,
        tier,
        status: tier === "premium" ? "active" : "free",
        features: {
          "pantry.manual": true,
          "pantry.imageScan": tier === "premium",
          "recipes.offline": true,
          "recipes.api": true,
          "recipes.imageLookup": tier === "premium",
          "mealPlan.weekly": true,
          "shoppingList.quantities": true
        },
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    await db.collection("adminAuditLogs").add({
      actorUid: actor.uid,
      actorEmail: actor.email,
      targetUid: targetUser.uid,
      targetEmail: targetUser.email ?? parsed.data.email ?? null,
      action: "set_access",
      before: {
        role: existingClaims.role ?? "user",
        tier: existingClaims.tier ?? "free"
      },
      after: { role, tier },
      createdAt: FieldValue.serverTimestamp()
    });

    return Response.json({
      ok: true,
      uid: targetUser.uid,
      email: targetUser.email ?? null,
      role,
      tier
    });
  } catch (error) {
    return accessErrorResponse(error);
  }
}
