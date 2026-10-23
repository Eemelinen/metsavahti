import { defineConfig } from 'vitest/config'

/** Opt-in contract test against the real Metsäkeskus WFS. `pnpm test:live`. */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    name: 'live',
    environment: 'node',
    include: ['tests/live/**/*.live.test.ts'],
    testTimeout: 120_000,
  },
})
