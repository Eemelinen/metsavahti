import { setupServer } from 'msw/node'

/** Shared msw server for unit and integration tests. Handlers are added per test. */
export const server = setupServer()
