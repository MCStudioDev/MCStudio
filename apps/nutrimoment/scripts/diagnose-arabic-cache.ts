import { getAdminDb, getAdminAuth } from "../src/lib/firebaseAdmin";
import { revalidateArabicEntry } from "../src/services/arabic/validation";
import { loadGenerationRestrictions } from "../src/services/generationProfileService";
import type { ArabicRecipeEntry } from "../src/services/arabic/types";
async function main() {
  const account = process.argv[2]; if (!account?.includes("@")) throw new Error("An explicit test account email is required");
  const uid = (await getAdminAuth().getUserByEmail(account)).uid, db = getAdminDb();
  const restrictions = await loadGenerationRestrictions(uid);
  const history = await db.collection(`users/${uid}/historyArabicV1`).orderBy("timestamp", "desc").limit(1).get();
  for (const item of history.docs) for (const recipe of item.data().recipes || []) {
    if (!/^ar-[a-f0-9]{24}$/.test(recipe.id)) continue;
    const stored = (await db.doc(`sharedRecipesArabicV1/${recipe.id}`).get()).data() as ArabicRecipeEntry | undefined;
    if (!stored) { console.log(JSON.stringify({ id: recipe.id, missing: true })); continue; }
    const checked = await revalidateArabicEntry(stored, restrictions);
    console.log(JSON.stringify({ id: recipe.id, version: stored.validatorVersion, reasons: checked.reasons, sameFingerprint: checked.entry?.fingerprint === stored.fingerprint, sameId: checked.entry?.id === recipe.id }));
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Diagnostic failed"); process.exitCode = 1; });
