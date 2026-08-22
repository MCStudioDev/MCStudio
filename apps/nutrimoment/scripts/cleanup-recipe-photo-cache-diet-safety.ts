import path from "node:path";
import { config as loadEnv } from "dotenv";
import { getAdminDb, hasFirebaseAdminConfig } from "../src/lib/firebaseAdmin";

loadEnv({ path: path.join(process.cwd(), ".env.local") });

const COLLECTION_NAME = "recipePhotoCache";
const DELETE_BATCH_SIZE = 400;
const CONFIRMED_GLOBALLY_MISLEADING_IMAGE_MARKERS = [
  "37164878", // Lamb stew returned for vegetarian/vegan bamia.
  "1751199393315" // Fried food returned for rice with tomato sauce.
];
const CONFIRMED_MEAT_IMAGE_MARKER = "22890025";

type Candidate = {
  docId: string;
  imageUrl: string;
  query: string;
  reason: string;
  ref: FirebaseFirestore.DocumentReference;
  signature: string;
};

async function main() {
  if (!hasFirebaseAdminConfig()) {
    throw new Error("Firebase Admin credentials are not configured.");
  }

  const apply = process.argv.includes("--confirm");
  const db = getAdminDb();
  const snapshot = await db.collection(COLLECTION_NAME).get();
  const candidates: Candidate[] = [];

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const imageUrl = readString(data.imageUrl);
    const query = readString(data.query);
    const signature = readString(data.signature) || docSnap.id;
    const globallyMisleading = CONFIRMED_GLOBALLY_MISLEADING_IMAGE_MARKERS.find((marker) => imageUrl.includes(marker));
    const exactAliasValue = docSnap.id.startsWith("exact:")
      ? docSnap.id
      : signature.startsWith("exact:") ? signature : "";
    const aliasDish = normalizeExactAlias(exactAliasValue).toLowerCase();
    const queryText = query.toLowerCase();
    const confirmedMeatAliasMismatch = Boolean(
      exactAliasValue &&
      imageUrl.includes(CONFIRMED_MEAT_IMAGE_MARKER) &&
      !/\b(kebab|kebda|halla|kofta|meat|beef|lamb)\b/.test(aliasDish)
    );
    const confirmedTomatoSoupAliasMismatch = Boolean(
      exactAliasValue &&
      /\btomato soup\b/.test(aliasDish) &&
      !/\bsoup\b/.test(queryText)
    );

    if (!globallyMisleading && !confirmedMeatAliasMismatch && !confirmedTomatoSoupAliasMismatch) continue;
    candidates.push({
      docId: docSnap.id,
      imageUrl,
      query,
      reason: globallyMisleading
        ? `confirmed-image:${globallyMisleading}`
        : confirmedMeatAliasMismatch
          ? "confirmed-meat-image-alias-mismatch"
          : "confirmed-tomato-soup-alias-mismatch",
      ref: docSnap.ref,
      signature
    });
  }

  process.stdout.write(
    `${apply ? "Apply" : "Dry run"} recipe photo cache diet-safety cleanup.\n` +
      `Scanned: ${snapshot.size}\n` +
      `${apply ? "Deleting" : "Would delete"}: ${candidates.length}\n` +
      `${JSON.stringify(candidates.map(({ docId, query, reason, signature }) => ({ docId, query, reason, signature })), null, 2)}\n`
  );

  if (!apply || !candidates.length) return;

  for (let index = 0; index < candidates.length; index += DELETE_BATCH_SIZE) {
    const batch = db.batch();
    candidates.slice(index, index + DELETE_BATCH_SIZE).forEach((candidate) => batch.delete(candidate.ref));
    await batch.commit();
  }

  process.stdout.write(`Deleted ${candidates.length} confirmed unsafe or mismatched cache documents.\n`);
}

function normalizeExactAlias(value: string) {
  return value
    .replace(/^exact:(?:ar|en):/i, "")
    .replace(/^exact:cuisine:[^:]+:/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
