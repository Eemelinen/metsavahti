'use client'

import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

/**
 * `false` during server rendering and hydration, `true` once the component runs on the
 * client. The auth forms expose it as `data-hydrated` on their `<form>`: react-hook-form
 * resets uncontrolled inputs to their default values when it mounts, so anything typed into
 * the server-rendered form before hydration is lost; the e2e helpers wait for the attribute
 * before filling (`tests/e2e/accounts.ts`).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
}
