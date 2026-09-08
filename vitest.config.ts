import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      exclude: ["references/**", "tools/oxlint/anti-slop/**"],
    },
    exclude: ["**/dist/**", "**/node_modules/**", "references/**", "tools/oxlint/anti-slop/**"],
    include: ["packages/**/*.test.ts", "fixtures/**/*.test.ts", "scripts/**/*.test.ts"],
    passWithNoTests: true,
  },
});
