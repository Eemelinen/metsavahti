import type { FaqEntry } from '@/content/faq'

/**
 * FAQ accordion (docs/design/Landing.dc.html#faq). Native `<details>` / `<summary>`: keyboard
 * and screen-reader support come with the element and it works before (and without) any
 * JavaScript. The first answer starts open, as on the artboard.
 */
export function FaqAccordion({ entries }: { entries: readonly FaqEntry[] }) {
  return (
    <div className="flex min-w-0 flex-col border-t border-line">
      {entries.map((entry, index) => (
        <details
          key={entry.id}
          className="group border-b border-line"
          id={`ukk-${entry.id}`}
          open={index === 0}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4.5 text-lg font-semibold text-ink hover:text-forest-700">
            {entry.question}
            <span
              aria-hidden="true"
              className="inline-flex size-6 flex-none items-center justify-center rounded-full border border-line-strong font-normal text-ink-muted transition-transform group-open:rotate-45 motion-reduce:transition-none"
            >
              +
            </span>
          </summary>
          <p className="mb-4.5 leading-relaxed text-pretty text-ink-muted">{entry.answer}</p>
        </details>
      ))}
    </div>
  )
}
