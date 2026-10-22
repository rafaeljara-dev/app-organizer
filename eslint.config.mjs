import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default defineConfig([
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, ...globals.serviceworker },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true }],
    },
  },
  globalIgnores([
    ".next/**",
    ".preview/**",
    "out/**",
    "build/**",
    "design/**",
    "next-env.d.ts",
    "public/sw.js",
    "public/sw.js.map",
  ]),
]);
