import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  test: {
    include: ["src/__tests__/**/*.test.ts"],
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
