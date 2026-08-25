import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

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
  // jsx-a11y: full "strict" ruleset elevated to `error` so accessibility
  // regressions fail the build (eslint-config-next only ships a handful of
  // jsx-a11y rules at "warn" — this supersedes that with the complete
  // strict rule set as errors, gating all future storefront/checkout PRs).
  // See docs/standards/accessibility.md for the conventions these enforce.
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    rules: {
      ...jsxA11y.flatConfigs.strict.rules,
      // Not applicable: this repo has no <marquee>/deprecated media usage
      // requiring captions/audio-description tracks yet (no video/audio
      // components exist in the storefront). Re-enable when M05 adds media.
      "jsx-a11y/media-has-caption": "off",
    },
  },
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
