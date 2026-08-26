import path from "node:path";
import { config as loadEnv } from "dotenv";
import { FieldPath } from "firebase-admin/firestore";
import { getAdminDb, hasFirebaseAdminConfig } from "../src/lib/firebaseAdmin";

loadEnv({ path: path.join(process.cwd(), ".env.local") });

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 250;

async function main() {
  if (!hasFirebaseAdminConfig()) {
    throw new Error("Firebase Admin credentials are not configured.");
  }

  const dryRun = hasFlag("--dry-run");
  const confirmed = hasFlag("--confirm");
  if (!dryRun && !confirmed) {
    throw new Error(
      "Refusing to delete users without --confirm. Run with --dry-run first, then rerun with --confirm."
    );
  }

  const batchSize = Math.min(readNumberArg("--batch-size") ?? DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE);
  const db = getAdminDb();
  let lastUserId: string | undefined;
  let scanned = 0;
  let orphaned = 0;
  let deleted = 0;
  let skippedAfterRecheck = 0;

  process.stdout.write(
    `${dryRun ? "Dry run" : "Cleanup"}: users without matching entitlements documents.\n` +
      `Project: ${process.env.FIREBASE_ADMIN_PROJECT_ID ?? "unknown"}\n` +
      `Batch size: ${batchSize}\n`
  );

  while (true) {
    let query = db.collection("users").orderBy(FieldPath.documentId()).limit(batchSize);
    if (lastUserId) query = query.startAfter(lastUserId);

    const usersSnapshot = await query.get();
    if (usersSnapshot.empty) break;
    lastUserId = usersSnapshot.docs.at(-1)?.id;
    scanned += usersSnapshot.size;

    const entitlementSnapshots = await db.getAll(
      ...usersSnapshot.docs.map((userDocument) => db.doc(`entitlements/${userDocument.id}`))
    );

    for (let index = 0; index < usersSnapshot.docs.length; index += 1) {
      if (entitlementSnapshots[index]?.exists) continue;

      const userDocument = usersSnapshot.docs[index];
      orphaned += 1;
      const email = typeof userDocument.get("email") === "string" ? userDocument.get("email") : "no-email";
      process.stdout.write(`${dryRun ? "Would delete" : "Deleting"}: ${userDocument.id} (${email})\n`);

      if (dryRun) continue;

      const entitlementRecheck = await db.doc(`entitlements/${userDocument.id}`).get();
      if (entitlementRecheck.exists) {
        skippedAfterRecheck += 1;
        process.stdout.write(`Skipped after entitlement recheck: ${userDocument.id}\n`);
        continue;
      }

      await db.recursiveDelete(userDocument.ref);
      deleted += 1;
    }
  }

  process.stdout.write(
    `${dryRun ? "Dry run" : "Cleanup"} complete.\n` +
      `User documents scanned: ${scanned}\n` +
      `User documents without entitlements: ${orphaned}\n` +
      `${dryRun ? "User trees that would be deleted" : "User trees deleted"}: ${dryRun ? orphaned : deleted}\n` +
      `Skipped after entitlement recheck: ${skippedAfterRecheck}\n`
  );
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function readNumberArg(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return undefined;
  const value = Number.parseInt(process.argv[index + 1] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
