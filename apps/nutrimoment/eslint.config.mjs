import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    ".claude/**",
    "next-env.d.ts",
    // Test sources use a different module system + dev-only deps; vitest
    // handles type checking instead of next/eslint.
    "src/__tests__/**",
    "vitest.config.ts",
  ]),
]);

export default eslintConfig;
