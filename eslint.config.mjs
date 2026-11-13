import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    "dist/**",
    ".vinext/**",
    ".wrangler/**",
    ".sites-runtime/**",
    "outputs/**",
    "work/**",
  ]),
  {
    // The inherited JSON record model permits legacy shapes; runtime writes are schema-validated.
    files: ["app/**/*.ts", "app/**/*.tsx", "lib/tracking.ts", "lib/item-validation.ts", "tests/**/*.ts"],
    rules: {"@typescript-eslint/no-explicit-any":"off"},
  },
  {
    // These views intentionally render wall-clock time and initialize from the browser.
    files: ["app/planner.tsx", "app/activity-log.tsx"],
    rules: {"react-hooks/purity":"off", "react-hooks/set-state-in-effect":"off", "@next/next/no-html-link-for-pages":"off"},
  },
  {
    files: ["components/ui/**/*.{ts,tsx}", "hooks/use-mobile.ts"],
    rules: {
      // These files are vendored verbatim from shadcn@4.17.0. Keep the
      // registry source intact while applying the stricter rules to Site code.
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
