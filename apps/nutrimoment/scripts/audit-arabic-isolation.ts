import { config } from "dotenv";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { getAdminDb } from "../src/lib/firebaseAdmin";

config({ path: ".env.local", quiet: true });
type Snapshot = { project: string; uid: string; hashes: Record<string, string>; counts: Record<string, number> };
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
const fingerprint = (value: unknown) => createHash("sha256").update(stable(value)).digest("hex");

async function main() {
  const [mode, file, project, uid] = process.argv.slice(2);
  if (!["capture", "compare"].includes(mode) || !file || !project || !/^[\w-]+$/.test(uid ?? "")) throw new Error("Usage: capture|compare <snapshot-file> <project-id> <test-user-uid>");
  if (process.env.FIREBASE_ADMIN_PROJECT_ID !== project) throw new Error("Configured Firebase project does not match the explicitly requested project");
  const db = getAdminDb();
  const collections = ["sharedRecipesV2", "recipePhotoCache", `users/${uid}/offlineRecipeCache`, `users/${uid}/history`];
  const snapshot: Snapshot = { project, uid, hashes: {}, counts: {} };
  for (const name of collections) snapshot.counts[name] = (await db.collection(name).count().get()).data().count;
  const previous = mode === "compare" ? JSON.parse(await readFile(file, "utf8")) as Snapshot : null;
  if (previous && (previous.project !== project || previous.uid !== uid)) throw new Error("Snapshot project/account mismatch");
  const paths = previous ? Object.keys(previous.hashes) : [`users/${uid}/plans/currentWeekly`];
  if (!previous) for (const name of collections) {
    const sample = await db.collection(name).limit(10).get();
    paths.push(...sample.docs.map(doc => doc.ref.path));
  }
  for (const path of paths) {
    if (!(path === `users/${uid}/plans/currentWeekly` || collections.some(name => path.startsWith(`${name}/`) && path.slice(name.length + 1).indexOf("/") === -1))) throw new Error("Snapshot contains an unexpected path");
    const doc = await db.doc(path).get();
    snapshot.hashes[path] = fingerprint(doc.exists ? doc.data() : null);
  }
  if (!previous) {
    await writeFile(file, JSON.stringify(snapshot, null, 2), { flag: "wx" });
    console.log(`Captured ${paths.length} English record hashes. No Firebase writes performed.`);
  } else {
    const changed = paths.filter(path => snapshot.hashes[path] !== previous.hashes[path]);
    const countChanges = collections.filter(name => snapshot.counts[name] !== previous.counts[name]);
    console.log(JSON.stringify({ unchanged: changed.length === 0 && countChanges.length === 0, changedRecords: changed, changedCounts: countChanges }));
    if (changed.length || countChanges.length) process.exitCode = 1;
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Audit failed"); process.exitCode = 1; });
