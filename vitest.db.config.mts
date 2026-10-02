import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests against a REAL PostgreSQL. Each test file gets its own database.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.db.test.ts"],
    globalSetup: ["src/test/db/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
