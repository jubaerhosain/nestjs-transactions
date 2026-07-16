import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  // `docs/` is the Docusaurus site — it has its own toolchain and is excluded
  // from the library lint so `eslint .` (the CI `lint` job) stays green.
  { ignores: ['**/dist/', '**/coverage/', '**/node_modules/', 'docs/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['**/*.js'],
    languageOptions: { globals: { module: 'writable', require: 'readonly' } },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },
);
