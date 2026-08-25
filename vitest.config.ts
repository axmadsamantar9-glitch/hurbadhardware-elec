import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    server: {
      deps: {
        inline: [/next-intl/, /next-auth/, /@auth\/prisma-adapter/],
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/lib/**", "src/app/api/**", "src/i18n.ts"],
      exclude: [
        "**/*.test.ts",
        "src/lib/db.ts",
        "src/auth.ts",
        "src/proxy.ts",
        "src/app/**/*.tsx",
        "src/lib/api/schemas/**",
      ],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 70,
      },
    },
  },
});
