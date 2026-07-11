import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    passWithNoTests: true,
    exclude: [...configDefaults.exclude, "**/.claude/worktrees/**"],
    coverage: {
      provider: "v8",
      include: [
        "src/tool/**",
        "src/reviewers/**",
        "src/judge/**",
        "src/hook/**",
        "src/config.ts",
        "src/doctor.ts",
        "src/server/**",
        "src/session/**",
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
      },
    },
  },
});
