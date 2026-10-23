import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/** Fast, hermetic unit tests. No database, no network (msw errors on unhandled requests). */
export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    name: 'unit',
    environment: 'node',
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/unit/setup.ts'],
    // Projects with different worker settings need distinct group orders when run together.
    sequence: { groupOrder: 0 },
    // Component tests opt in with `// @vitest-environment jsdom` at the top of the file.
    testTimeout: 10_000,
  },
})
