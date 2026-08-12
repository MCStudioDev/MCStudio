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
    // Catalog integration cases intentionally exercise repeated full-pool
    // searches. Keep the ceiling above their measured worst case while the
    // M2 indexing work removes that latency from both tests and production.
    testTimeout: 180_000,
    hookTimeout: 60_000,
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1
  }
});
