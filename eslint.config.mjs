import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import unusedImports from "eslint-plugin-unused-imports";

export default defineConfig([
  ...nextVitals,
  globalIgnores([
    ".cache/**",
    "src-tauri/target/**",
    "public/serviceWorker.js",
  ]),
  {
    plugins: { "unused-imports": unusedImports },
    rules: { "unused-imports/no-unused-imports": "warn" },
  },
  {
    files: ["app/**/*.{ts,tsx}"],
    // Keep the existing hooks checks strict. Surface the newly introduced
    // compiler diagnostics as warnings while React Compiler is disabled.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
]);
