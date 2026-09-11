import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts"],
    // Steps 0/0b land the runner before the first spec exists (Step 1);
    // without this the bare-runner gate would be red by construction.
    passWithNoTests: true,
  },
});
