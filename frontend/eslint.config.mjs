import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

const eslintConfig = defineConfig([
  globalIgnores([".next/**", "dist/**", "test-results/**", "playwright-report/**", "next-env.d.ts"]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  { files: ["src/**/*.{ts,tsx}"], plugins: { "react-hooks": reactHooks },
    rules: { ...reactHooks.configs.recommended.rules } },
]);

export default eslintConfig;
