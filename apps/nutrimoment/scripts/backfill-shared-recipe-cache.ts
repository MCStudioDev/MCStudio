import path from "node:path";
import { config as loadEnv } from "dotenv";
import { FieldPath } from "firebase-admin/firestore";
import type { MealPlanMeal, Recipe } from "../src/lib/types";
import { getAdminDb, hasFirebaseAdminConfig } from "../src/lib/firebaseAdmin";
import { persistSharedRecipeCache } from "../src/services/userRecipeCacheService";

loadEnv({ path: path.join(process.cwd(), ".env.local") });

const DEFAULT_USER_BATCH_SIZE = 25;
const DEFAULT_HISTORY_LIMIT = 80;

async function main() {
  if (!hasFirebaseAdminConfig()) {
    throw new Error("Firebase Admin credentials are not configured.");
  }

  const dryRun = hasFlag("--dry-run");
  const userLimit = readNumberArg("--user-limit");
  const userBatchSize = readNumberArg("--batch-size") ?? DEFAULT_USER_BATCH_SIZE;
  const historyLimit = readNumberArg("--history-limit") ?? DEFAULT_HISTORY_LIMIT;
  const sourceProvider = readStringArg("--source-provider") ?? "shared-backfill";

  const db = getAdminDb();
  let processedUsers = 0;
  let scannedUsers = 0;
  let usersWithRecipes = 0;
  let totalRecipes = 0;
  let totalMeals = 0;
  let failedUsers = 0;
  let lastUserId: string | null = null;

  process.stdout.write(
    `Starting shared recipe cache backfill${dryRun ? " (dry run)" : ""} with batch size ${userBatchSize} and history limit ${historyLimit}.\n`
  );

  while (true) {
    let query = db.collection("users").orderBy(FieldPath.documentId()).limit(userBatchSize);
    if (lastUserId) {
      query = query.startAfter(lastUserId);
    }

    const snapshot = await query.get();
    if (snapshot.empty) break;

    for (const userDoc of snapshot.docs) {
      if (userLimit != null && scannedUsers >= userLimit) {
        break;
      }

      scannedUsers += 1;
      lastUserId = userDoc.id;

      const { meals, recipeLanguage, recipes } = await loadUserRecipeData(db, userDoc.id, historyLimit);
      if (!recipes.length && !meals.length) {
        continue;
      }

      usersWithRecipes += 1;
      totalRecipes += recipes.length;
      totalMeals += meals.length;

      try {
        if (!dryRun) {
          await persistSharedRecipeCache({
            recipeLanguage,
            recipes,
            meals,
            sourceProvider
          });
          processedUsers += 1;
        }

        process.stdout.write(
          `${dryRun ? "Would backfill" : "Backfilled"} user ${userDoc.id}: ${recipes.length} recipes, ${meals.length} meals.\n`
        );
      } catch (error) {
        failedUsers += 1;
        process.stdout.write(
          `Failed user ${userDoc.id}: ${error instanceof Error ? error.message : String(error)}\n`
        );
      }
    }

    if (userLimit != null && scannedUsers >= userLimit) {
      break;
    }
  }

  process.stdout.write(
    `${dryRun ? "Dry run complete" : "Backfill complete"}.\n` +
      `Users scanned: ${scannedUsers}\n` +
      `Users with recipe data: ${usersWithRecipes}\n` +
      `${dryRun ? "Users that would be written" : "Users written"}: ${dryRun ? usersWithRecipes : processedUsers}\n` +
      `Users failed: ${failedUsers}\n` +
      `History recipes seen: ${totalRecipes}\n` +
      `Plan meals seen: ${totalMeals}\n`
  );
}

async function loadUserRecipeData(db: FirebaseFirestore.Firestore, uid: string, historyLimit: number) {
  const historySnapshot = await db
    .collection("users")
    .doc(uid)
    .collection("history")
    .orderBy("timestamp", "desc")
    .limit(historyLimit)
    .get()
    .catch(async () =>
      db.collection("users").doc(uid).collection("history").limit(historyLimit).get()
    );
  const planSnapshot = await db.collection("users").doc(uid).collection("plans").doc("currentWeekly").get();

  const recipes = historySnapshot.docs.flatMap((docSnap) => {
    const data = docSnap.data() as { recipes?: Recipe[] };
    return Array.isArray(data.recipes) ? data.recipes : [];
  });

  const planData = planSnapshot.exists
    ? (planSnapshot.data() as {
        mealPlan?: {
          plan?: Array<{
            breakfast?: MealPlanMeal;
            lunch?: MealPlanMeal;
            dinner?: MealPlanMeal;
          }>;
        };
      })
    : null;
  const meals = (planData?.mealPlan?.plan ?? []).flatMap((day) =>
    [day.breakfast, day.lunch, day.dinner].filter((meal): meal is MealPlanMeal => Boolean(meal))
  );

  return {
    recipes,
    meals,
    recipeLanguage: inferStoredLanguage({ recipes, meals })
  };
}

function inferStoredLanguage(input: { meals?: MealPlanMeal[]; recipes?: Recipe[] }) {
  const sample = [
    ...(input.recipes ?? []).map((recipe) => `${recipe.name} ${recipe.steps.join(" ")}`),
    ...(input.meals ?? []).map((meal) => `${meal.name} ${(meal.steps ?? []).join(" ")}`)
  ]
    .join(" ")
    .slice(0, 2000);

  return /[\u0600-\u06FF]/.test(sample) ? "Arabic" : "English";
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function readStringArg(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

function readNumberArg(flag: string) {
  const value = readStringArg(flag);
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
