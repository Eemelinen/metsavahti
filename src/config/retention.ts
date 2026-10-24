import { fi } from '@/i18n/fi'

/**
 * Retention rules (`01 §4.4`, `01 §8`, ledger R12). The weekly `cleanup` task
 * (`lib/jobs/cleanup.ts`) has one handler per key, and the privacy page (MV-092) builds its
 * retention table from the same entries, so the policy and the code cannot drift. `days` is
 * counted from the moment `start` names; the Finnish copy lives in `fi.retention` (R8) and
 * `description` is built from the numbers here.
 */
export type RetentionRule = {
  /** What the rule covers (Finnish, privacy-page table). */
  data: string
  /** Days kept after `start`. */
  days: number
  /** The moment the period starts. */
  start: string
  /** The rule as one Finnish sentence. */
  description: string
}

/** An expired declaration stays while it has an alert younger than this (`01 §4.4`). */
export const DECLARATION_ALERT_GRACE_DAYS = 90

type RuleCopy = { data: string; start: string; description: (days: number) => string }

function rule(days: number, copy: RuleCopy): RetentionRule {
  return { days, data: copy.data, start: copy.start, description: copy.description(days) }
}

const t = fi.retention

export const retention = {
  declarations: rule(30, {
    ...t.declarations,
    description: (days) => t.declarations.description(days, DECLARATION_ALERT_GRACE_DAYS),
  }),
  declarationRevisions: rule(365, t.declarationRevisions),
  dataExports: rule(0, t.dataExports),
  jobRuns: rule(90, t.jobRuns),
  rateLimitBuckets: rule(0, t.rateLimitBuckets),
} satisfies Record<string, RetentionRule>

export type RetentionRuleId = keyof typeof retention
