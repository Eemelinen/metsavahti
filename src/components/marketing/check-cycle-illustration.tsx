import { fi } from '@/i18n/fi'

const copy = fi.howItWorks.cycle.illustration

const pill = 'absolute rounded-full px-3 py-1.5 text-sm font-semibold whitespace-nowrap'

/**
 * The twice-daily check cycle on `/miten-se-toimii` (docs/design/Miten.dc.html): a dashed
 * 24-hour dial with the two check times, the Metsäkeskus publication and the email around it.
 * The side labels sit on the ring above and below the centre text (the artboard's overlap it),
 * and the artboard's rotating sweep is drawn still, so the page has no animation to switch off and
 * the visual snapshots stay stable. The labels are decorative; the caption describes the figure.
 */
export function CheckCycleIllustration() {
  return (
    <figure className="flex justify-center p-3">
      <div aria-hidden="true" className="relative aspect-square w-full max-w-75">
        <svg className="absolute inset-0 size-full" viewBox="0 0 200 200">
          <path className="fill-forest-600/20" d="M100 100V2A98 98 0 0 1 163 24.9Z" />
          <circle
            className="fill-none stroke-line-strong"
            cx="100"
            cy="100"
            r="98"
            strokeDasharray="4 3"
            strokeWidth="1.5"
          />
        </svg>
        <span className={`${pill} -top-4 left-1/2 -translate-x-1/2 bg-forest-700 text-white`}>
          {copy.morning}
        </span>
        <span className={`${pill} -bottom-4 left-1/2 -translate-x-1/2 bg-forest-700 text-white`}>
          {copy.evening}
        </span>
        <span
          className={`${pill} top-1/4 right-0 -translate-y-1/2 border border-line bg-paper-raised font-normal text-ink-muted`}
        >
          {copy.source}
        </span>
        <span className={`${pill} bottom-1/4 left-0 translate-y-1/2 bg-amber-300 text-ink`}>
          {copy.email}
        </span>
        <p className="absolute inset-0 flex flex-col items-center justify-center text-center text-sm text-ink-muted">
          {copy.centreLabel}
          <strong className="text-xl text-forest-700">{copy.centreValue}</strong>
          {copy.centreNote}
        </p>
      </div>
      <figcaption className="sr-only">{copy.description}</figcaption>
    </figure>
  )
}
