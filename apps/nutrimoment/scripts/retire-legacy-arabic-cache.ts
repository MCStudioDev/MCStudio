import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "dotenv";
import { FieldPath, FieldValue, Timestamp } from "firebase-admin/firestore";
import type { RecipeCatalogDoc } from "../src/lib/domain";
import { assertLegacyArabicTarget, cleanupFingerprint, LEGACY_ARABIC_COLLECTION, LEGACY_ARABIC_FIELD, withoutLegacyArabic } from "./lib/legacy-arabic-cleanup";

type BackupRecord = {
  path: string;
  arabic: unknown;
  remainingHash: string;
  englishSourceFingerprint: string;
  searchable: boolean;
  updateTime: { seconds: number; nanoseconds: number };
};
type Backup = { version: 1; project: string; createdAt: string; records: BackupRecord[] };

config({ path: ".env.local", quiet: true });
const option = (name: string) => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
const mode = option("--mode") ?? "backup";
if (!["backup", "apply", "verify"].includes(mode)) throw new Error("Use --mode backup|apply|verify");
const backupFile = path.resolve(option("--backup") ?? `.generated/legacy-arabic-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

async function main() {
  const { getAdminDb } = await import("../src/lib/firebaseAdmin");
  const { englishSourceFingerprint } = await import("../src/services/arabic/englishSources");
  const { isSharedRecipeV2Searchable } = await import("../src/services/sharedRecipeV2PolicyService");
  const db = getAdminDb();
  // Exposed by the Google Cloud Firestore runtime; absent from the Admin re-export's type.
  const projectId = (db as unknown as { projectId: string }).projectId;
  if (typeof projectId !== "string" || !projectId) throw new Error("Cannot verify the connected Firebase project");
  if (process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID && process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID !== "(default)") throw new Error("This cleanup is restricted to the default database");
  if (mode === "backup") {
    const records: BackupRecord[] = [];
    let cursor: string | undefined;
    while (true) {
      let query = db.collection(LEGACY_ARABIC_COLLECTION).orderBy(FieldPath.documentId()).limit(100);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      if (page.empty) break;
      for (const doc of page.docs) {
        const data = doc.data();
        if (!data.localized || !Object.hasOwn(data.localized, "Arabic")) continue;
        assertLegacyArabicTarget(doc.ref.path);
        records.push({ path: doc.ref.path, arabic: data.localized.Arabic,
          remainingHash: cleanupFingerprint(withoutLegacyArabic(data)),
          englishSourceFingerprint: englishSourceFingerprint({ ...data, id: doc.id } as RecipeCatalogDoc),
          searchable: isSharedRecipeV2Searchable(data as RecipeCatalogDoc),
          updateTime: { seconds: doc.updateTime.seconds, nanoseconds: doc.updateTime.nanoseconds } });
      }
      cursor = page.docs.at(-1)!.id;
    }
    const backup: Backup = { version: 1, project: projectId, createdAt: new Date().toISOString(), records };
    await mkdir(path.dirname(backupFile), { recursive: true });
    await writeFile(backupFile, JSON.stringify(backup, null, 2), { flag: "wx" });
    await writeFile(`${backupFile}.sha256`, cleanupFingerprint(backup), { flag: "wx" });
    console.log(JSON.stringify({ mode, project: backup.project, records: records.length, backupFile }));
    return;
  }
  const backup = JSON.parse(await readFile(backupFile, "utf8")) as Backup;
  const checksum = (await readFile(`${backupFile}.sha256`, "utf8")).trim();
  if (cleanupFingerprint(backup) !== checksum || backup.version !== 1 || backup.project !== projectId) throw new Error("Invalid backup checksum, format or Firebase project");
  if (new Set(backup.records.map(item => item.path)).size !== backup.records.length) throw new Error("Duplicate backup targets");
  for (const record of backup.records) assertLegacyArabicTarget(record.path);
  if (mode === "apply") {
    if (option("--confirm-project") !== backup.project || Number(option("--expected-count")) !== backup.records.length) throw new Error("Apply requires matching --confirm-project and --expected-count");
    // A live guard is mandatory: an old deployment could recreate the removed data.
    const origin = new URL(option("--guard-origin") ?? "");
    if (origin.protocol !== "https:" || origin.pathname !== "/") throw new Error("Use the deployed HTTPS origin");
    for (const endpoint of ["generate-recipes", "recipes", "mealplan"]) {
      const response = await fetch(new URL(`/api/${endpoint}`, origin), { method: "POST", redirect: "error", signal: AbortSignal.timeout(30_000),
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uiLanguage: "ar" }) });
      const body = await response.json();
      if (response.status !== 410 || body.code !== "LEGACY_ARABIC_WORKFLOW_RETIRED") throw new Error(`Live retirement guard missing: ${endpoint}`);
    }
  }
  let removed = 0;
  let alreadyRemoved = 0;
  for (const record of backup.records) {
    const ref = db.doc(record.path);
    const snapshot = await ref.get();
    const data = snapshot.data();
    if (!data || cleanupFingerprint(withoutLegacyArabic(data)) !== record.remainingHash
      || englishSourceFingerprint({ ...data, id: ref.id } as RecipeCatalogDoc) !== record.englishSourceFingerprint
      || isSharedRecipeV2Searchable(data as RecipeCatalogDoc) !== record.searchable) throw new Error(`Non-Arabic fields changed: ${record.path}`);
    if (!data.localized || !Object.hasOwn(data.localized, "Arabic")) { alreadyRemoved++; continue; }
    if (mode === "verify") throw new Error(`Legacy field still exists: ${record.path}`);
    if (cleanupFingerprint(data.localized.Arabic) !== cleanupFingerprint(record.arabic)) throw new Error(`Arabic field changed since backup: ${record.path}`);
    const updateTime = new Timestamp(record.updateTime.seconds, record.updateTime.nanoseconds);
    if (!snapshot.updateTime?.isEqual(updateTime)) throw new Error(`Document changed since backup: ${record.path}`);
    // No set(), document deletion, updatedAt change, image write or cache helper.
    await ref.update({ [LEGACY_ARABIC_FIELD]: FieldValue.delete() }, { lastUpdateTime: updateTime });
    removed++;
    if (removed % 100 === 0) console.log(JSON.stringify({ removed, total: backup.records.length }));
  }
  const remaining = await db.collection(LEGACY_ARABIC_COLLECTION).where("localized.Arabic.name", ">", "").count().get();
  const result = { mode, project: backup.project, checked: backup.records.length, removed, alreadyRemoved, remainingNamedLegacyVariants: remaining.data().count, backupFile };
  await writeFile(`${backupFile}.${mode}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  if (remaining.data().count !== 0) throw new Error("Additional legacy variants remain outside the backup");
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Cleanup failed"); process.exitCode = 1; });
