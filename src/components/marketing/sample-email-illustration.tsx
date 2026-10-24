import { fi } from '@/i18n/fi'

const copy = fi.howItWorks.email.illustration

/**
 * What an alert email looks like (`/miten-se-toimii`, docs/design/Miten.dc.html): sender row,
 * subject, a small SVG map with the declared felling inside the watch area, the facts and the
 * button. The text is real text so it reads as the email would; the harvest colour is paired
 * with its label (docs/design/README.md rule 5).
 */
export function SampleEmailIllustration() {
  return (
    <figure className="w-full max-w-90 overflow-hidden rounded-xl border border-line bg-paper-raised text-sm shadow-pop">
      <figcaption className="sr-only">{copy.label}</figcaption>
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3.5">
        <span
          aria-hidden="true"
          className="inline-flex size-8 items-center justify-center rounded-full bg-forest-700 text-xs font-bold text-white"
        >
          {copy.senderInitial}
        </span>
        <p>
          <span className="block font-semibold">{copy.sender}</span>
          <span className="text-xs text-ink-muted">{copy.sentAt}</span>
        </p>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <p className="text-lg font-bold text-forest-700">{copy.subject}</p>
        <svg
          aria-label={copy.mapDescription}
          className="h-32 w-full rounded-lg border border-line bg-forest-50"
          preserveAspectRatio="xMidYMid slice"
          role="img"
          viewBox="0 0 320 128"
        >
          <path
            className="fill-forest-100"
            d="M0 0h110l-20 40 30 40-60 48H0Z M230 0h90v90l-50-20-30-40Z"
          />
          <path
            className="fill-none stroke-paper-raised"
            d="M0 96C80 90 140 104 200 92S280 60 320 66"
            strokeLinecap="round"
            strokeWidth="6"
          />
          <circle
            className="fill-forest-600/10 stroke-forest-600"
            cx="160"
            cy="64"
            r="54"
            strokeDasharray="5 4"
            strokeWidth="1.5"
          />
          <path
            className="fill-cut-uudistus/60 stroke-ember-700"
            d="M168 34l36-6 10 26-14 20-30-2-8-22Z"
            strokeWidth="1.5"
          />
          <circle className="fill-forest-700" cx="160" cy="64" r="4" />
        </svg>
        <div className="flex flex-col gap-1.5 text-ink-muted">
          <p className="flex items-center gap-2">
            <span aria-hidden="true" className="size-3 rounded-xs bg-cut-uudistus" />
            <span>
              <strong className="text-ink">{copy.cuttingType}</strong> · {copy.area}
            </span>
          </p>
          <p>{copy.distance}</p>
          <p>{copy.received}</p>
        </div>
        <span className="rounded-lg bg-forest-700 p-3 text-center font-semibold text-white">
          {copy.cta}
        </span>
      </div>
    </figure>
  )
}
