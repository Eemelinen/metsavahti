import vitest from '@vitest/eslint-plugin'
import betterTailwindcss from 'eslint-plugin-better-tailwindcss'
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier'
import playwright from 'eslint-plugin-playwright'
import tseslint from 'typescript-eslint'

/**
 * Design-system enforcement (docs/design/README.md, AGENTS.md → Constraints). Styling must use
 * the theme tokens in src/app/globals.css: no arbitrary values (`bg-[#000]`, `h-[420px]`), no
 * raw Tailwind palette colours (the palette is removed from the theme, so they are also unknown
 * classes), no inline `style` props outside the map container and email templates.
 */
const restrictedClasses = [
  {
    pattern: String.raw`^(?:[^\s:]+:)*[a-z][a-z0-9-]*-\[[^\]]+\]$`,
    message:
      'Arbitrary Tailwind value; use a theme token from src/app/globals.css (add one there if it is missing).',
  },
  {
    pattern: String.raw`^(?:[^\s:]+:)*(?:bg|text|border|ring|fill|stroke|from|via|to|outline|divide|accent|caret|decoration|shadow|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?:/\d+)?$`,
    message:
      'Raw Tailwind palette colour; use a design token (forest, sage, amber, ember, ink, paper, line, cut).',
  },
]

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      '.next-e2e/**',
      '.next-check/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'src/payload-types.ts',
      'src/app/(payload)/**',
      'src/payload/migrations/*.ts',
      '!src/payload/migrations/index.ts',
      'next-env.d.ts',
      // Claude Design prototypes (generated runtime + artboards), see docs/design/README.md
      'docs/design/**',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'better-tailwindcss': betterTailwindcss },
    settings: {
      'better-tailwindcss': { entryPoint: 'src/app/globals.css' },
    },
    rules: {
      'better-tailwindcss/no-unknown-classes': 'error',
      'better-tailwindcss/no-conflicting-classes': 'error',
      'better-tailwindcss/no-duplicate-classes': 'error',
      'better-tailwindcss/no-restricted-classes': ['error', { restrict: restrictedClasses }],
      'react/forbid-dom-props': [
        'error',
        {
          forbid: [
            {
              propName: 'style',
              message:
                'Inline styles bypass the design system; use theme classes (exceptions: the map container and email templates, see docs/design/README.md).',
            },
          ],
        },
      ],
      'react/forbid-component-props': [
        'error',
        {
          forbid: [
            {
              propName: 'style',
              message:
                'Inline styles bypass the design system; use theme classes (exceptions: the map container and email templates, see docs/design/README.md).',
            },
          ],
        },
      ],
    },
  },
  {
    // React Email renders inline styles by design; colours must come from src/lib/design-tokens.ts.
    files: ['src/emails/**/*.tsx', 'src/lib/notifications/**/*.tsx'],
    rules: {
      'react/forbid-dom-props': 'off',
      'react/forbid-component-props': 'off',
    },
  },
  {
    files: ['tests/e2e/**/*.ts'],
    ...playwright.configs['flat/recommended'],
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      'playwright/expect-expect': ['error', { assertFunctionNames: ['expectNoA11yViolations'] }],
    },
  },
  {
    files: ['tests/**/*.test.{ts,tsx}'],
    plugins: { vitest },
    rules: vitest.configs.recommended.rules,
  },
  {
    files: ['scripts/**/*.ts', 'tests/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  prettier,
)
