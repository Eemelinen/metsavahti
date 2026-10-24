import type { Metadata } from 'next'
import Link from 'next/link'

import { FaqAccordion } from '@/components/marketing/faq-accordion'
import { HeroMapMock } from '@/components/marketing/hero-map-mock'
import { plans } from '@/config/plans'
import { FAQ } from '@/content/faq'
import { fi } from '@/i18n/fi'
import { env } from '@/lib/env'
import { SITE_OPEN_GRAPH, faqPageJsonLd, organizationJsonLd, serializeJsonLd } from '@/lib/seo'
import { MAX_RADIUS_M, MIN_RADIUS_M } from '@/lib/watch-areas/watch-area-schema'

const copy = fi.landing

export const metadata: Metadata = {
  title: { absolute: copy.meta.title },
  description: copy.meta.description,
  alternates: { canonical: '/' },
  openGraph: {
    ...SITE_OPEN_GRAPH,
    url: '/',
    title: copy.meta.title,
    description: copy.meta.description,
  },
}

/**
 * Where "Luo vahtialue" leads a visitor (`03-pages.md`: CTA → `/rekisteroidy`); a signed-in
 * user is sent on from there by `redirectSignedInUser()`.
 */
const SIGN_UP_PATH = '/rekisteroidy'

const primaryCta =
  'inline-flex items-center rounded-full bg-forest-700 px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-forest-600'

/**
 * Landing page (MV-100, docs/design/Landing.dc.html hero B): hero, illustrative map, the
 * 3-step strip, the "what is a declaration" explainer, the trust row, the FAQ and the closing
 * CTA. Static apart from the per-request render every frontend page gets (root layout); the
 * Organization and FAQPage structured data are built from the same content the page shows.
 */
export default function LandingPage() {
  const steps = copy.steps.items(MIN_RADIUS_M, MAX_RADIUS_M / 1000)
  const trust = [
    copy.trust.source,
    copy.trust.privacy,
    { title: copy.trust.price.title, body: copy.trust.price.body(plans.free.maxWatchAreas) },
  ]

  return (
    <div className="flex flex-col gap-18">
      <script
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(organizationJsonLd(env.NEXT_PUBLIC_SERVER_URL)),
        }}
        type="application/ld+json"
      />
      <script
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqPageJsonLd(FAQ)) }}
        type="application/ld+json"
      />

      <section aria-labelledby="hero-title" className="flex flex-col gap-10">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-7 pt-8 text-center sm:pt-16">
          <h1
            className="text-3xl font-bold text-balance text-forest-700 sm:text-4xl"
            id="hero-title"
          >
            {copy.hero.title}
          </h1>
          <p className="max-w-xl text-lg text-pretty text-ink-muted sm:text-xl">{copy.hero.lead}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link className={primaryCta} href={SIGN_UP_PATH}>
              {copy.hero.primaryCta}
            </Link>
            <Link
              className="inline-flex items-center rounded-full border border-line bg-paper-raised px-6 py-3.5 text-base font-semibold text-forest-700 transition-colors hover:border-line-strong"
              href="#miten"
            >
              {copy.hero.secondaryCta}
            </Link>
          </div>
        </div>
        <HeroMapMock />
      </section>

      <section aria-labelledby="miten-title" className="scroll-mt-20" id="miten">
        <h2 className="mb-8 text-3xl font-bold text-forest-700" id="miten-title">
          {copy.steps.title}
        </h2>
        <ol className="grid gap-5 md:grid-cols-3">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="flex flex-col gap-3.5 rounded-xl border border-line bg-paper-raised p-6"
            >
              <span
                aria-hidden="true"
                className="inline-flex size-9 items-center justify-center rounded-full bg-forest-50 font-bold text-forest-700"
              >
                {index + 1}
              </span>
              <h3 className="text-lg font-bold text-ink">{step.title}</h3>
              <p className="text-pretty text-ink-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="explainer-title"
        className="grid gap-8 rounded-2xl bg-forest-50 p-6 sm:p-9 md:grid-cols-2"
      >
        <div>
          <h2 className="mb-3 text-2xl font-bold text-forest-700" id="explainer-title">
            {copy.explainer.title}
          </h2>
          <p className="leading-relaxed text-pretty">{copy.explainer.body}</p>
        </div>
        <ul className="flex flex-col gap-3">
          {copy.explainer.points.map((point) => (
            <li key={point} className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-2 size-2 flex-none rounded-full bg-forest-600"
              />
              {point}
            </li>
          ))}
        </ul>
      </section>

      <section aria-label={copy.trust.label} className="grid gap-5 md:grid-cols-3">
        {trust.map((item) => (
          <div key={item.title} className="flex flex-col gap-2 px-1">
            <h2 className="text-sm font-semibold tracking-wider text-ink-muted uppercase">
              {item.title}
            </h2>
            <p className="text-pretty">{item.body}</p>
          </div>
        ))}
      </section>

      <section
        aria-labelledby="ukk-title"
        className="grid items-start gap-x-12 gap-y-6 md:grid-cols-3"
        id="ukk"
      >
        <h2 className="text-2xl font-bold text-forest-700" id="ukk-title">
          {copy.faqTitle}
        </h2>
        <div className="min-w-0 md:col-span-2">
          <FaqAccordion entries={FAQ} />
        </div>
      </section>

      <section
        aria-labelledby="cta-title"
        className="mb-8 flex flex-col items-center gap-5 rounded-2xl bg-forest-700 px-9 py-12 text-center text-white"
      >
        <h2 className="text-2xl font-bold text-balance sm:text-3xl" id="cta-title">
          {copy.cta.title}
        </h2>
        <Link
          className="inline-flex items-center rounded-full bg-amber-300 px-7 py-3.5 text-base font-semibold text-ink transition-colors hover:bg-amber-100"
          href={SIGN_UP_PATH}
        >
          {copy.cta.button}
        </Link>
      </section>
    </div>
  )
}
