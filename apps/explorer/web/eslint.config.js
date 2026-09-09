import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    // The base config intentionally does not install eslint-plugin-react, so
    // core no-unused-vars cannot see JSX-only use of callback/destructured
    // component aliases such as `Icon`. Scope the exception to the two Social
    // surfaces that render those aliases instead of weakening the repository
    // rule globally. `setValue` is retained in Composer's controlled-component
    // contract even though the collapsed preview currently only reads `value`.
    files: [
      'src/components/social/NetworkSocialModal.jsx',
      'src/pages/SocialTestV2.jsx',
    ],
    rules: {
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^[A-Z_]',
        argsIgnorePattern: '^(Icon|setValue)$',
      }],
    },
  },
])
