// =====================================================================
// ESLint flat config (ESLint v9+)
// 仅扫本项目层；上游同步层 (templates/** + extract-html.ts) 不背锅。
// 详见 .trellis/spec/backend/quality-guidelines.md §Lint
// =====================================================================
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    ignores: [
      "src/templates/**",
      "src/extract-html.ts",
      "src/agents/detect.ts",
      "src/agents/argv.ts",
      "src/__tests__/fixtures/**",
      "dist/**",
      "dist-test/**",
      "ref/**",
      "node_modules/**",
      "scripts/**"
    ]
  },
  {
    files: [
      "src/cli.ts",
      "src/errors.ts",
      "src/logger.ts",
      "src/commands/**/*.ts",
      "src/agents/**/*.ts",
      "src/__tests__/**/*.test.ts"
    ],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module"
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-implicit-coercion": "error",
      "@typescript-eslint/no-explicit-any": "error"
    }
  }
];
