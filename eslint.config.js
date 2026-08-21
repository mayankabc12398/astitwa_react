import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

/**
 * Layer names, in one place, so a new folder cannot quietly escape the rule.
 * Section 3.1: a lower layer may reference an upper layer, never the reverse.
 */
const UPPER_LAYERS = [
  { name: 'addons', layer: 3 },
  { name: 'integrations', layer: 4 },
  { name: 'extensions', layer: 5 },
]

/** Both relative (`../../addons/x`) and aliased (`@/addons/x`) spellings. */
const forbid = ({ name, layer }) => ({
  group: [`**/${name}`, `**/${name}/**`, `@/${name}`, `@/${name}/*`, `@/${name}/**`],
  message:
    `Layer 1 must not import src/${name}/ (layer ${layer}). ` +
    `Base code depends on contracts in src/core/, never on an add-on, an integration ` +
    `or a stored script. See section 3.1 of the build prompt.`,
})

export default [
  { ignores: ['dist/**', 'node_modules/**', 'public/hook-sandbox.js'] },

  js.configs.recommended,

  // Build tooling runs in Node, not the browser.
  {
    files: ['vite.config.js', 'eslint.config.js', 'scripts/**/*.js'],
    languageOptions: { globals: { ...globals.node } },
  },

  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'react/prop-types': 'off',
      'no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
    },
  },

  /*
   * Section 3.2, frontend half. src/modules/ and src/core/ are Layer 1: they may
   * never reach into layers 3, 4 or 5. Add-ons are wired in through the route
   * registry in src/core/, which is a contract, not an import.
   */
  {
    files: ['src/modules/**/*.{js,jsx}', 'src/core/**/*.{js,jsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: UPPER_LAYERS.map(forbid) }],
    },
  },

  /*
   * Layer 2 is configuration. It may be consumed by Layer 1, but it must not
   * depend on an add-on, an integration or the script engine either.
   */
  {
    files: ['src/config/**/*.{js,jsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: UPPER_LAYERS.map(forbid) }],
    },
  },

  /*
   * Add-ons and integrations must stay independent of each other. Payroll may use
   * src/core/ and src/config/; it may not reach sideways into src/integrations/.
   */
  {
    files: ['src/addons/**/*.{js,jsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: UPPER_LAYERS.filter((l) => l.name !== 'addons').map(forbid) },
      ],
    },
  },
  {
    files: ['src/integrations/**/*.{js,jsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: UPPER_LAYERS.filter((l) => l.name !== 'integrations').map(forbid) },
      ],
    },
  },
]
