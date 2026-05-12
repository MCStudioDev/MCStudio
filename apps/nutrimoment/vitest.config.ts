import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Keep the test surface narrow for now — rules tests are the only suite.
    // When we add unit tests for ranking/normalization, broaden this glob.
    include: ["src/__tests__/firestore-rules.test.ts"],
    // Rules tests need a running Firestore emulator and may take several
    // seconds per case while documents round-trip through it.
    testTimeout: 20_000,
    hookTimeout: 30_000,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true
      }
    }
  }
});
