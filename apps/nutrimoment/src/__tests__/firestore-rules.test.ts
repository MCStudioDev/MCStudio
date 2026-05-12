/**
 * Firestore security rule tests.
 *
 * Prerequisites:
 *   - Java (the Firebase Local Emulator Suite runs on the JVM).
 *   - `firebase-tools` installed globally (`npm install -g firebase-tools`).
 *
 * Run from `apps/nutrimoment` with:
 *   npm run test:rules
 *
 * The npm script wraps these tests with `firebase emulators:exec`, which
 * starts a Firestore emulator on port 8080, runs vitest, and stops the
 * emulator on exit.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import { setDoc } from "firebase/firestore";

const PROJECT_ID = "nutrimoment-rules-test";
const ALICE = "alice";
const BOB = "bob";
const ADMIN = "admin-1";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8"),
      host: "127.0.0.1",
      port: 8080
    }
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

function aliceDb() {
  return testEnv.authenticatedContext(ALICE).firestore();
}

function bobDb() {
  return testEnv.authenticatedContext(BOB).firestore();
}

function adminDb() {
  return testEnv.authenticatedContext(ADMIN, { role: "admin" }).firestore();
}

function anonDb() {
  return testEnv.unauthenticatedContext().firestore();
}

/**
 * Seed Firestore bypassing rules so individual tests can focus on read/write
 * paths instead of fixture setup.
 */
async function seed(seeder: (db: ReturnType<typeof aliceDb>) => Promise<void>) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await seeder(ctx.firestore());
  });
}

describe("users/{uid} profile", () => {
  it("owner can create profile without access fields", async () => {
    await assertSucceeds(
      setDoc(aliceDb().doc(`users/${ALICE}`), { displayName: "Alice", calorieTarget: 2000 })
    );
  });

  it("owner cannot create profile that contains role/tier/aiCreditsUsed", async () => {
    await assertFails(setDoc(aliceDb().doc(`users/${ALICE}`), { role: "admin" }));
    await assertFails(setDoc(aliceDb().doc(`users/${ALICE}`), { tier: "premium" }));
    await assertFails(setDoc(aliceDb().doc(`users/${ALICE}`), { aiCreditsUsed: 0 }));
    await assertFails(setDoc(aliceDb().doc(`users/${ALICE}`), { entitlement: { tier: "premium" } }));
  });

  it("owner cannot update access fields on existing profile", async () => {
    await seed(async (db) => {
      await setDoc(db.doc(`users/${ALICE}`), { displayName: "Alice", role: "user", tier: "free" });
    });

    await assertFails(setDoc(aliceDb().doc(`users/${ALICE}`), { role: "admin" }, { merge: true }));
    await assertFails(setDoc(aliceDb().doc(`users/${ALICE}`), { tier: "premium" }, { merge: true }));
    await assertFails(setDoc(aliceDb().doc(`users/${ALICE}`), { aiCreditsUsed: 99 }, { merge: true }));
  });

  it("owner can update non-access profile fields", async () => {
    await seed(async (db) => {
      await setDoc(db.doc(`users/${ALICE}`), { displayName: "Alice", role: "user", tier: "free" });
    });
    await assertSucceeds(
      setDoc(aliceDb().doc(`users/${ALICE}`), { calorieTarget: 2200 }, { merge: true })
    );
  });

  it("another user cannot read alice's profile", async () => {
    await seed(async (db) => {
      await setDoc(db.doc(`users/${ALICE}`), { displayName: "Alice" });
    });
    await assertFails(bobDb().doc(`users/${ALICE}`).get());
  });

  it("admin can read any user's profile", async () => {
    await seed(async (db) => {
      await setDoc(db.doc(`users/${ALICE}`), { displayName: "Alice" });
    });
    await assertSucceeds(adminDb().doc(`users/${ALICE}`).get());
  });
});

describe("users/{uid}/usage/{usageId}", () => {
  it("owner can read own usage docs", async () => {
    await seed(async (db) => {
      await setDoc(db.doc(`users/${ALICE}/usage/aiCredits`), { lifetimeUsed: 3 });
    });
    await assertSucceeds(aliceDb().doc(`users/${ALICE}/usage/aiCredits`).get());
  });

  it("owner cannot write to own usage docs (server-only)", async () => {
    await assertFails(setDoc(aliceDb().doc(`users/${ALICE}/usage/aiCredits`), { lifetimeUsed: 0 }));
  });

  it("other user cannot read alice's usage", async () => {
    await seed(async (db) => {
      await setDoc(db.doc(`users/${ALICE}/usage/aiCredits`), { lifetimeUsed: 3 });
    });
    await assertFails(bobDb().doc(`users/${ALICE}/usage/aiCredits`).get());
  });

  it("admin can read and write usage", async () => {
    await assertSucceeds(setDoc(adminDb().doc(`users/${ALICE}/usage/aiCredits`), { lifetimeUsed: 5 }));
    await assertSucceeds(adminDb().doc(`users/${ALICE}/usage/aiCredits`).get());
  });
});

describe("users/{uid}/pantry/{item}", () => {
  it("owner can read/write own pantry", async () => {
    await assertSucceeds(setDoc(aliceDb().doc(`users/${ALICE}/pantry/eggs`), { name: "eggs", quantity: "12" }));
    await assertSucceeds(aliceDb().doc(`users/${ALICE}/pantry/eggs`).get());
  });

  it("other user cannot access alice's pantry", async () => {
    await assertFails(setDoc(bobDb().doc(`users/${ALICE}/pantry/eggs`), { name: "eggs" }));
    await assertFails(bobDb().doc(`users/${ALICE}/pantry/eggs`).get());
  });
});

describe("users/{uid}/history/{historyId}", () => {
  it("owner can persist history", async () => {
    await assertSucceeds(setDoc(aliceDb().doc(`users/${ALICE}/history/abc`), { recipes: [] }));
  });

  it("other user cannot read alice's history", async () => {
    await seed(async (db) => {
      await setDoc(db.doc(`users/${ALICE}/history/abc`), { recipes: [] });
    });
    await assertFails(bobDb().doc(`users/${ALICE}/history/abc`).get());
  });
});

describe("users/{uid}/plans/{planId}", () => {
  it("owner can persist current weekly plan", async () => {
    await assertSucceeds(
      setDoc(aliceDb().doc(`users/${ALICE}/plans/currentWeekly`), { plan: [], shoppingList: [] })
    );
  });

  it("other user cannot read alice's plan", async () => {
    await seed(async (db) => {
      await setDoc(db.doc(`users/${ALICE}/plans/currentWeekly`), { plan: [] });
    });
    await assertFails(bobDb().doc(`users/${ALICE}/plans/currentWeekly`).get());
  });
});

describe("entitlements/{uid}", () => {
  it("owner can read own entitlement", async () => {
    await seed(async (db) => {
      await setDoc(db.doc(`entitlements/${ALICE}`), { tier: "premium", status: "active" });
    });
    await assertSucceeds(aliceDb().doc(`entitlements/${ALICE}`).get());
  });

  it("owner cannot write entitlement (admin-only)", async () => {
    await assertFails(setDoc(aliceDb().doc(`entitlements/${ALICE}`), { tier: "premium" }));
  });

  it("admin can write entitlement", async () => {
    await assertSucceeds(setDoc(adminDb().doc(`entitlements/${ALICE}`), { tier: "premium", status: "active" }));
  });

  it("other user cannot read alice's entitlement", async () => {
    await seed(async (db) => {
      await setDoc(db.doc(`entitlements/${ALICE}`), { tier: "premium" });
    });
    await assertFails(bobDb().doc(`entitlements/${ALICE}`).get());
  });
});

describe("globalControls/{controlId}", () => {
  it("authenticated user can read the kill-switch", async () => {
    await seed(async (db) => {
      await setDoc(db.doc("globalControls/replicateImages"), { enabled: true });
    });
    await assertSucceeds(aliceDb().doc("globalControls/replicateImages").get());
  });

  it("unauthenticated user cannot read", async () => {
    await seed(async (db) => {
      await setDoc(db.doc("globalControls/replicateImages"), { enabled: true });
    });
    await assertFails(anonDb().doc("globalControls/replicateImages").get());
  });

  it("non-admin user cannot flip the switch", async () => {
    await assertFails(setDoc(aliceDb().doc("globalControls/replicateImages"), { enabled: false }));
  });

  it("admin can flip the switch", async () => {
    await assertSucceeds(setDoc(adminDb().doc("globalControls/replicateImages"), { enabled: false }));
  });
});

describe("public catalog (recipes/ingredients/aliases/index)", () => {
  it("any user can read recipes (public catalog)", async () => {
    await seed(async (db) => {
      await setDoc(db.doc("recipes/koshary"), { title: "Koshary" });
    });
    await assertSucceeds(anonDb().doc("recipes/koshary").get());
    await assertSucceeds(aliceDb().doc("recipes/koshary").get());
  });

  it("no one can write to the public catalog (client-side)", async () => {
    await assertFails(setDoc(aliceDb().doc("recipes/koshary"), { title: "Hacked" }));
    await assertFails(setDoc(adminDb().doc("recipes/koshary"), { title: "Hacked" }));
  });
});

describe("recipePhotoCache/{photoId}", () => {
  it("authenticated user can read shared photo cache", async () => {
    await seed(async (db) => {
      await setDoc(db.doc("recipePhotoCache/sig123"), { imageUrl: "https://example.com/a.jpg" });
    });
    await assertSucceeds(aliceDb().doc("recipePhotoCache/sig123").get());
  });

  it("unauthenticated user cannot read shared photo cache", async () => {
    await seed(async (db) => {
      await setDoc(db.doc("recipePhotoCache/sig123"), { imageUrl: "https://example.com/a.jpg" });
    });
    await assertFails(anonDb().doc("recipePhotoCache/sig123").get());
  });

  it("client-side writes to photo cache are denied (server-only)", async () => {
    await assertFails(setDoc(aliceDb().doc("recipePhotoCache/sig123"), { imageUrl: "https://x.test/a.jpg" }));
    await assertFails(setDoc(adminDb().doc("recipePhotoCache/sig123"), { imageUrl: "https://x.test/a.jpg" }));
  });
});

describe("scans/{scanId}", () => {
  it("user can create a scan tagged with their own uid", async () => {
    await assertSucceeds(
      setDoc(aliceDb().doc("scans/scan-alice-1"), { uid: ALICE, ingredients: ["egg"] })
    );
  });

  it("user cannot create a scan tagged with another uid", async () => {
    await assertFails(
      setDoc(aliceDb().doc("scans/scan-bob-1"), { uid: BOB, ingredients: ["egg"] })
    );
  });

  it("user cannot read another user's scan", async () => {
    await seed(async (db) => {
      await setDoc(db.doc("scans/scan-alice-1"), { uid: ALICE });
    });
    await assertFails(bobDb().doc("scans/scan-alice-1").get());
  });

  it("user cannot rewrite scan ownership", async () => {
    await seed(async (db) => {
      await setDoc(db.doc("scans/scan-alice-1"), { uid: ALICE });
    });
    await assertFails(
      setDoc(aliceDb().doc("scans/scan-alice-1"), { uid: BOB }, { merge: true })
    );
  });
});

describe("metrics/{...}", () => {
  it("non-admin cannot read or write metrics", async () => {
    await assertFails(aliceDb().doc("metrics/imageAi").get());
    await assertFails(setDoc(aliceDb().doc("metrics/imageAi"), { count: 1 }));
  });

  it("admin can read and write metrics", async () => {
    await assertSucceeds(setDoc(adminDb().doc("metrics/imageAi"), { count: 1 }));
    await assertSucceeds(adminDb().doc("metrics/imageAi").get());
  });
});

describe("catch-all deny", () => {
  it("unknown collection is denied for everyone", async () => {
    await assertFails(setDoc(aliceDb().doc("some_unknown_collection/doc"), { foo: 1 }));
    await assertFails(setDoc(adminDb().doc("some_unknown_collection/doc"), { foo: 1 }));
    await assertFails(setDoc(anonDb().doc("some_unknown_collection/doc"), { foo: 1 }));
    await assertFails(aliceDb().doc("some_unknown_collection/doc").get());
  });

  it("internal staging collections are admin-denied client-side", async () => {
    // recipeRawImports / recipeCanonicalStaging are server-only.
    await assertFails(adminDb().doc("recipeRawImports/import-1").get());
    await assertFails(setDoc(adminDb().doc("recipeCanonicalStaging/staging-1"), { title: "x" }));
  });
});
