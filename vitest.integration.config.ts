import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * Integration tests: real Payload + real PostGIS (Testcontainers) + real Mailpit
 * (Testcontainers). The WFS is stubbed with msw. One shared Payload instance per run:
 * files run sequentially in a single worker without module isolation.
 */
export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    name: 'integration',
    environment: 'node',
    include: ['tests/integration/**/*.int.test.ts'],
    globalSetup: ['./tests/integration/global-setup.ts'],
    setupFiles: ['./tests/integration/setup.ts'],
    maxWorkers: 1,
    sequence: { groupOrder: 1 },
    isolate: false,
    testTimeout: 60_000,
    hookTimeout: 180_000,
    teardownTimeout: 30_000,
  },
})
