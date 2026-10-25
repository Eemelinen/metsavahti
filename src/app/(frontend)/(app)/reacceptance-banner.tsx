'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Dialog } from 'radix-ui'
import { useId, useState, useTransition } from 'react'

import { FormError } from '@/components/forms/form-error'
import { useHydrated } from '@/components/forms/use-hydrated'
import { fi } from '@/i18n/fi'
import type { Reacceptance } from '@/lib/legal/reacceptance'

import { acceptLegalDocuments } from './actions'

const copy = fi.legal.reacceptance

const keepOpen = (event: Event) => event.preventDefault()

/**
 * Re-acceptance prompt (`01 §3.10`, `03-pages.md`, MV-086) for the terms / privacy versions the
 * account has not accepted (`loadReacceptance()`). Soft by default: a region above the page's
 * heading that leaves the page usable. When a pending document has `requiresReacceptance` it is
 * a modal that Escape, a backdrop click or a close button cannot dismiss; only "Hyväksyn" does.
 * "Lue muutokset" opens each document's change summary and a link to the full text (a legal
 * page, outside the app frame, so the modal is not in the way there). After a save the page
 * refreshes and the server no longer renders the prompt.
 */
export function ReacceptanceBanner({ reacceptance }: { reacceptance: Reacceptance }) {
  const router = useRouter()
  const hydrated = useHydrated()
  const id = useId()
  const [showChanges, setShowChanges] = useState(reacceptance.blocking)
  const [error, setError] = useState<string | null>(null)
  const [pending, startAccept] = useTransition()

  function accept() {
    setError(null)
    startAccept(async () => {
      const result = await acceptLegalDocuments({
        documents: reacceptance.documents.map(({ slug, version }) => ({ slug, version })),
      }).catch(() => null)
      if (!result?.ok) {
        setError(copy.failed)
        return
      }
      if (result.data.status === 'outdated') setError(copy.outdated)
      router.refresh()
    })
  }

  const Title = reacceptance.blocking ? Dialog.Title : 'h2'
  const Body = reacceptance.blocking ? Dialog.Description : 'p'
  const content = (
    <div className="flex flex-col gap-3.5" data-hydrated={hydrated ? '' : undefined}>
      {/* In the modal Radix wires the title and description ids itself. */}
      <Title
        className="text-lg font-bold text-forest-700"
        {...(reacceptance.blocking ? {} : { id: `${id}-title` })}
      >
        {copy.title}
      </Title>
      <Body className="text-base">{reacceptance.blocking ? copy.blockingBody : copy.softBody}</Body>
      <div>
        <button
          aria-controls={`${id}-changes`}
          aria-expanded={showChanges}
          className="min-h-11 cursor-pointer py-2 font-semibold text-forest-600 hover:underline"
          type="button"
          onClick={() => setShowChanges((shown) => !shown)}
        >
          {showChanges ? copy.hideChanges : copy.readChanges}
        </button>
        <ul className="flex flex-col gap-2.5" hidden={!showChanges} id={`${id}-changes`}>
          {reacceptance.documents.map((doc) => (
            <li className="rounded-lg border border-line bg-paper-raised p-3.5" key={doc.slug}>
              <Link
                className="font-semibold text-forest-600 underline hover:text-forest-700"
                href={doc.href}
              >
                {doc.title}
              </Link>
              <span className="text-ink-muted">, {copy.version(doc.version)}</span>
              <p className="mt-1 text-sm text-ink-muted">{doc.changeSummary ?? copy.noSummary}</p>
            </li>
          ))}
        </ul>
      </div>
      <FormError>{error}</FormError>
      <div>
        <button
          className="min-h-11 min-w-40 cursor-pointer rounded-lg bg-forest-700 px-4.5 py-3 font-semibold text-white hover:bg-forest-600 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={pending}
          type="button"
          onClick={accept}
        >
          {copy.accept}
        </button>
      </div>
    </div>
  )

  if (!reacceptance.blocking) {
    return (
      <section
        aria-labelledby={`${id}-title`}
        className="rounded-xl border border-forest-200 bg-forest-50 p-5 text-ink"
        data-testid="reacceptance-banner"
      >
        {content}
      </section>
    )
  }

  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4">
          <Dialog.Content
            className="max-h-full w-full max-w-130 overflow-y-auto rounded-xl bg-paper-raised p-6 text-ink shadow-pop"
            data-testid="reacceptance-modal"
            onEscapeKeyDown={keepOpen}
            onInteractOutside={keepOpen}
          >
            {content}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
