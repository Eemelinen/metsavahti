import { defineConfig } from 'vitest/config'

/**
 * Root config: wires the unit and integration projects together and owns
 * coverage (coverage can only be configured at the root when using projects).
 *
 *   pnpm test:unit         -> vitest run --project unit
 *   pnpm test:integration  -> vitest run --project integration (Testcontainers)
 *   pnpm test:coverage     -> both, with v8 coverage over src/lib
 */
export default defineConfig({
  test: {
    projects: ['./vitest.unit.config.ts', './vitest.integration.config.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.{ts,tsx}'],
      exclude: ['src/lib/utils.ts'],
      reporter: ['text', 'html', 'json-summary', 'json'],
      reportsDirectory: './coverage',
      thresholds: {
        'src/lib/geo/**': { lines: 80 },
        'src/lib/wfs/**': { lines: 80 },
      },
    },
  },
})
