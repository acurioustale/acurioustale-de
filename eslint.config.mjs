import js from "@eslint/js";
import globals from "globals";
import html from "eslint-plugin-html";
import json from "@eslint/json";

export default [
  // Generated; not worth linting.
  { ignores: ["package-lock.json"] },

  // JavaScript: standalone files plus the inline <script> blocks in index.html,
  // which eslint-plugin-html extracts and lints.
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs", "**/*.html"],
    ...js.configs.recommended,
  },
  {
    // The inline <script> in index.html plus the browser modules in js/. Both
    // run in the browser; allow the same intentional patterns as the inline JS.
    files: ["**/*.html", "js/**/*.js"],
    plugins: { html },
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      // Empty catch blocks are intentional: localStorage access throws in some
      // privacy modes, and the guard simply falls back to the default theme.
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },

  // Node-run code: the test suite (node --test) and the dev-time CI checks.
  // tools/**/*.js is here for the mirrored bundle's tests, which live beside
  // the helpers they cover rather than in test/ (see CLAUDE.md).
  {
    files: ["test/**/*.js", "tools/**/*.mjs", "tools/**/*.js"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Playwright: the config and specs run in Node, but their page.evaluate
  // callbacks run in the browser, so allow both global sets.
  {
    files: ["e2e/**/*.js", "playwright.config.js"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },

  // JSON config/data files (duplicate keys, unsafe values, etc.).
  {
    files: ["**/*.json"],
    plugins: { json },
    language: "json/json",
    rules: json.configs.recommended.rules,
  },
  // JSONC allows comments; allowTrailingCommas matches what Prettier writes
  // (e.g. the markdownlint config).
  {
    files: ["**/*.jsonc"],
    plugins: { json },
    language: "json/jsonc",
    languageOptions: { allowTrailingCommas: true },
    rules: json.configs.recommended.rules,
  },
];
