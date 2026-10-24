import type { Metadata } from 'next'

import { retention } from '@/config/retention'
import { fi } from '@/i18n/fi'
import { requireUser } from '@/lib/auth/guards'

import { DeleteAccountForm } from './delete-account-form'

const copy = fi.account.deleteAccount

export const metadata: Metadata = { title: fi.app.titles.deleteAccount }

/**
 * `/tili/poista` (App artboard `poista`, `03-pages.md`, `03b` §26, E08 MV-094): what goes and
 * what stays, then `POISTA` + password. What stays is built from `config/retention.ts`
 * (the job-run logs' period) and the `delete-account` job's consent rule (`01 §4.6`), so the
 * text follows the code. The form posts to `POST /api/account/delete`.
 */
export default async function DeleteAccountPage() {
  await requireUser({ next: '/tili/poista' })
  return (
    <section
      aria-labelledby="delete-account-title"
      className="flex max-w-140 flex-col gap-3.5 rounded-xl border border-line bg-paper-raised p-5"
    >
      <h2 className="text-lg font-semibold text-ember-700" id="delete-account-title">
        {copy.title}
      </h2>
      <p className="text-sm leading-relaxed text-ink-muted">{copy.body}</p>
      <div className="flex flex-col gap-1 text-sm" data-testid="deletion-explanation">
        <h3 className="font-semibold">{copy.deletedTitle}</h3>
        <ul className="list-disc pl-5 leading-relaxed text-ink-muted">
          {copy.deleted.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h3 className="mt-2 font-semibold">{copy.keptTitle}</h3>
        <ul className="list-disc pl-5 leading-relaxed text-ink-muted">
          <li>{copy.keptConsents}</li>
          <li>{copy.keptJobRuns(retention.jobRuns.days)}</li>
        </ul>
      </div>
      <DeleteAccountForm />
    </section>
  )
}
