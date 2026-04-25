import path from "node:path";
import { config as loadEnv } from "dotenv";
import { getAdminDb, hasFirebaseAdminConfig } from "../src/lib/firebaseAdmin";

loadEnv({ path: path.join(process.cwd(), ".env.local") });

const COLLECTIONS = [
  "recipes",
  "ingredients",
  "ingredientAliases",
  "ingredientLexicon",
  "healthTags",
  "ingredientRecipeIndex"
] as const;

async function main() {
  if (!hasFirebaseAdminConfig()) {
    throw new Error("Firebase Admin credentials are not configured.");
  }

  const db = getAdminDb();
  const counts = await Promise.all(
    COLLECTIONS.map(async (name) => {
      const snapshot = await db.collection(name).count().get();
      return [name, snapshot.data().count] as const;
    })
  );

  process.stdout.write(`${JSON.stringify(Object.fromEntries(counts), null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
