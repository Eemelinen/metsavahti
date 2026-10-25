import { vi } from 'vitest'

/**
 * Stand-in for `next/cache` in integration tests (`tests/integration/setup.ts`): the real
 * functions need a Next.js request (`refresh`, `updateTag`, `revalidateTag`) or its incremental
 * cache (`unstable_cache`). Tests assert what the code asks of them; `unstable_cache` runs the
 * function uncached. One shared set of mocks: the files share modules (`isolate: false`), so
 * a module keeps whichever `next/cache` it was first imported with. Clear them in `beforeEach`.
 */
export const refresh = vi.fn()
export const updateTag = vi.fn()
export const revalidateTag = vi.fn()
export const unstable_cache = vi.fn(<T>(fn: T): T => fn)
