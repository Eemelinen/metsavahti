/**
 * Plan limits (spec `01 §3.1`, ledger S15/R12). The only plan today is `free`;
 * `users.plan` is the key. `WatchAreas` enforces `maxWatchAreas` in a
 * `beforeValidate` hook, so the limit is one number here and nowhere else.
 */
export const plans = {
  free: {
    label: 'Ilmainen',
    /** Watch areas one account may own at the same time. */
    maxWatchAreas: 2,
  },
} as const

export type PlanId = keyof typeof plans

export const DEFAULT_PLAN: PlanId = 'free'

/** Limits for a plan id; unknown or missing ids fall back to the free plan. */
export function planLimits(plan: string | null | undefined): (typeof plans)[PlanId] {
  return plan && plan in plans ? plans[plan as PlanId] : plans[DEFAULT_PLAN]
}
