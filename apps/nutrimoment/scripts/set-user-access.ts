import { config } from "dotenv";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../src/lib/firebaseAdmin";

config({ path: ".env.local" });

async function main() {
  const [, , identifier, tierArg = "premium", roleArg = "user"] = process.argv;
  if (!identifier) {
    throw new Error("Usage: npm run set:user-access -- user@example.com premium admin");
  }

  const tier = tierArg === "premium" ? "premium" : "free";
  const role = roleArg === "admin" ? "admin" : "user";
  const auth = getAdminAuth();
  const db = getAdminDb();
  const user = identifier.includes("@") ? await auth.getUserByEmail(identifier) : await auth.getUser(identifier);
  const existingClaims = user.customClaims ?? {};

  await auth.setCustomUserClaims(user.uid, {
    ...existingClaims,
    tier,
    role
  });

  await db.doc(`entitlements/${user.uid}`).set(
    {
      uid: user.uid,
      email: user.email ?? null,
      role,
      tier,
      status: tier === "premium" ? "active" : "free",
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  console.log(`Updated ${user.email ?? user.uid}: role=${role}, tier=${tier}`);
  console.log("Ask the user to sign out/in or refresh their token before testing the new access.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
