import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  // Global ignores must be first
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "coverage/**",
      "node_modules/**",
      "dist/**",
      "*.config.js",
      ".env",
      ".env.local",
      ".env.*.local",
      "**/*.d.ts",
    ],
  },
  // Next.js Web Vitals & TypeScript configs
  ...nextVitals,
  ...nextTs,
  // Additional strict rules for JavaScript and TypeScript
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    rules: {
      "no-console": [
        "warn",
        {
          allow: ["warn", "error"],
        },
      ],
      "prefer-const": "error",
      "no-var": "error",
      eqeqeq: ["error", "always"],
      "no-implicit-coercion": "error",
    },
  },
  // Allow console in logging infrastructure and scripts
  {
    files: ["scripts/**/*.ts", "prisma/seed.ts", "src/lib/logger.ts"],
    rules: {
      "no-console": "off",
    },
  },
]);

export default eslintConfig;
