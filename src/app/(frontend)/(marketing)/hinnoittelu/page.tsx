import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { plans } from '@/config/plans'
import { fi } from '@/i18n/fi'
import { env } from '@/lib/env'
import { PRICING_PATH } from '@/lib/marketing/routes'
import { SITE_OPEN_GRAPH } from '@/lib/seo'
import { MAX_RADIUS_M, MIN_RADIUS_M } from '@/lib/watch-areas/watch-area-schema'

const copy = fi.pricing

export const metadata: Metadata = {
  title: copy.meta.title,
  description: copy.meta.description,
  alternates: { canonical: PRICING_PATH },
  openGraph: {
    ...SITE_OPEN_GRAPH,
    url: PRICING_PATH,
    title: copy.meta.title,
    description: copy.meta.description,
  },
}

const cardCta =
  'mt-auto rounded-lg px-5 py-3.5 text-center text-base font-semibold transition-colors'

/**
 * `/hinnoittelu` (MV-101, docs/design/Hinnoittelu.dc.html), only with `SHOW_PRICING=1`; off it
 * is the 404 page and no link points here (`lib/marketing/routes.ts`). The free card is built
 * from `config/plans.ts` and the radius bounds; the "Tulossa" card is copy until a paid plan
 * exists, and its CTA leads to the contact form.
 */
export default function PricingPage() {
  if (env.SHOW_PRICING !== '1') notFound()

  const free = plans.free
  const freeFeatures = copy.free.features(free.maxWatchAreas, MIN_RADIUS_M, MAX_RADIUS_M / 1000)

  return (
    <div className="flex flex-col gap-10 pb-16">
      <section className="mx-auto flex max-w-3xl flex-col gap-4 pt-8 text-center sm:pt-16">
        <h1 className="text-3xl font-bold text-balance text-forest-700 sm:text-4xl">
          {copy.title}
        </h1>
        <p className="text-lg text-pretty text-ink-muted sm:text-xl">{copy.lead}</p>
      </section>

      <div className="mx-auto grid w-full max-w-4xl items-stretch gap-5 md:grid-cols-2">
        <section
          aria-labelledby="plan-free"
          className="flex flex-col gap-5 rounded-2xl border-2 border-forest-700 bg-paper-raised px-7 py-8"
        >
          <div>
            <h2
              className="text-sm font-semibold tracking-wider text-forest-600 uppercase"
              id="plan-free"
            >
              {free.label}
            </h2>
            <p className="mt-2 flex items-baseline gap-1.5">
              <span className="text-4xl font-bold text-forest-700">
                {copy.price(free.monthlyPriceEur)}
              </span>
              <span className="text-ink-muted">{copy.perMonth}</span>
            </p>
          </div>
          <ul className="flex flex-col gap-3">
            {freeFeatures.map((feature) => (
              <li key={feature} className="flex gap-3">
                <span aria-hidden="true" className="flex-none font-bold text-forest-600">
                  ✓
                </span>
                {feature}
              </li>
            ))}
          </ul>
          <Link
            className={`${cardCta} bg-forest-700 text-white hover:bg-forest-600`}
            href="/rekisteroidy"
          >
            {copy.free.cta}
          </Link>
        </section>
        <section
          aria-labelledby="plan-upcoming"
          className="flex flex-col gap-5 rounded-2xl border border-dashed border-line-strong bg-paper-sunken px-7 py-8"
        >
          <div>
            <p className="text-sm font-semibold tracking-wider text-ink-muted uppercase">
              {copy.upcoming.eyebrow}
            </p>
            <h2 className="mt-2 text-4xl font-bold text-ink-muted" id="plan-upcoming">
              {copy.upcoming.name}
            </h2>
          </div>
          <ul className="flex flex-col gap-3 text-ink-muted">
            {copy.upcoming.features.map((feature) => (
              <li key={feature} className="flex gap-3">
                <span aria-hidden="true" className="flex-none">
                  –
                </span>
                {feature}
              </li>
            ))}
          </ul>
          <Link
            className={`${cardCta} border border-line bg-paper-raised text-forest-700 hover:border-line-strong`}
            href="/yhteystiedot"
          >
            {copy.upcoming.cta}
          </Link>
        </section>
      </div>
    </div>
  )
}
