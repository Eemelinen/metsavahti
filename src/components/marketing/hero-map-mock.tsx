import { fi } from '@/i18n/fi'

const copy = fi.landing.mapMock

/**
 * Illustrative map under the landing hero (docs/design/Landing.dc.html, hero B): a static SVG
 * instead of a live MapLibre map, so the landing page ships no map JavaScript or tiles
 * (MV-100, Lighthouse budget). Colours are theme utilities; every harvest colour is paired
 * with a label in the legend (docs/design/README.md rule 5).
 */
export function HeroMapMock() {
  return (
    <figure className="relative h-80 overflow-hidden rounded-2xl border border-line bg-paper-sunken shadow-pop sm:h-96 lg:h-130">
      <svg
        aria-hidden="true"
        className="absolute inset-0 size-full"
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 1120 520"
      >
        {/* Forest patches */}
        <path
          className="fill-forest-100"
          d="M0 0h420l-40 120 60 90-120 70L0 250Z M760 0h360v300l-140-40-90-110-70-40Z M0 380l180-40 150 60 40 120H0Z M700 520l60-110 170-50 190 40v120Z"
        />
        <path
          className="fill-forest-50"
          d="M440 0h300l-20 70 50 60-150 20-140-40Z M200 300l110-30 70 60-60 60-130-20Z M880 330l120-20 120 40v60l-200-10Z"
        />
        {/* Roads */}
        <path
          className="fill-none stroke-line-strong"
          d="M0 300C200 280 330 330 470 310S760 210 1120 240 M560 520C540 420 600 360 580 260S520 80 560 0"
          strokeLinecap="round"
          strokeWidth="14"
        />
        <path
          className="fill-none stroke-paper-raised"
          d="M0 300C200 280 330 330 470 310S760 210 1120 240 M560 520C540 420 600 360 580 260S520 80 560 0"
          strokeLinecap="round"
          strokeWidth="9"
        />
        {/* Declarations */}
        <path
          className="fill-cut-uudistus/70 stroke-ember-700"
          d="M630 170l90-30 40 70-30 60-90 10-30-60Z"
          strokeWidth="2"
        />
        <path
          className="fill-cut-harvennus/80 stroke-amber-700"
          d="M400 300l80-20 50 50-20 70-90 10-40-50Z"
          strokeWidth="2"
        />
        <path
          className="fill-cut-harvennus/80 stroke-amber-700"
          d="M840 380l90-10 30 60-60 50-70-30Z"
          strokeWidth="2"
        />
        <path
          className="fill-cut-muu/70 stroke-sage-700"
          d="M180 120l70-20 40 60-50 50-70-20Z"
          strokeWidth="2"
        />
        {/* Watch area */}
        <circle
          className="fill-forest-600/10 stroke-forest-600"
          cx="560"
          cy="260"
          r="190"
          strokeDasharray="10 8"
          strokeWidth="3"
        />
        <circle
          className="fill-forest-700 stroke-paper-raised"
          cx="560"
          cy="260"
          r="10"
          strokeWidth="4"
        />
      </svg>
      <span
        aria-hidden="true"
        className="absolute top-1/2 left-1/2 size-30 -translate-1/2 rounded-full bg-forest-600/25 motion-safe:animate-ping"
      />
      <figcaption className="sr-only">{copy.description}</figcaption>
      <ul
        aria-label={copy.label}
        className="absolute top-3.5 left-3.5 flex flex-col gap-1.5 rounded-xl bg-paper-raised px-3 py-2.5 text-xs shadow-card"
      >
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-3 rounded-xs bg-cut-uudistus/70" />
          {copy.legend.uudistus}
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-3 rounded-xs bg-cut-harvennus/80" />
          {copy.legend.harvennus}
        </li>
        <li className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-3 rounded-full border-2 border-dashed border-forest-600"
          />
          {copy.legend.watchArea}
        </li>
      </ul>
      <div className="absolute right-3.5 bottom-3.5 hidden max-w-65 items-center gap-2.5 rounded-xl bg-paper-raised px-3.5 py-3 shadow-card sm:flex">
        <span
          aria-hidden="true"
          className="inline-flex size-9 flex-none items-center justify-center rounded-lg bg-ember-100"
        >
          <span className="size-3.5 rounded-xs bg-cut-uudistus" />
        </span>
        <p className="text-sm">
          <strong className="block">{copy.alertTitle}</strong>
          <span className="text-ink-muted">{copy.alertBody}</span>
        </p>
      </div>
    </figure>
  )
}
