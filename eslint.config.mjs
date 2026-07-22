// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Strict, enterprise-grade ESLint configuration.
 *
 * WHY stricter than the Nest CLI default: Architecture-Rules mandates
 * "Strict TypeScript only" and "No any". The default Nest CLI template
 * disables `no-explicit-any` and downgrades unsafe-* rules to warnings,
 * which would let untyped code pass CI silently. We flip these back to
 * errors so ESLint actually fails the build on violations, matching
 * TypeScript-Rules ("Enable every strict compiler option") and
 * Output-Rules ("Never assume defaults").
 */
export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', 'dist/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/explicit-member-accessibility': 'error',
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
);
