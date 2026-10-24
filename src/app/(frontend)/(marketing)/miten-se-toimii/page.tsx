import type { Metadata } from 'next'
import Link from 'next/link'

import { CheckCycleIllustration } from '@/components/marketing/check-cycle-illustration'
import { SampleEmailIllustration } from '@/components/marketing/sample-email-illustration'
import { fi } from '@/i18n/fi'
import { SITE_OPEN_GRAPH } from '@/lib/seo'

const copy = fi.howItWorks

const PATH = '/miten-se-toimii'

export const metadata: Metadata = {
  title: copy.meta.title,
  description: copy.meta.description,
  alternates: { canonical: PATH },
  openGraph: {
    ...SITE_OPEN_GRAPH,
    url: PATH,
    title: copy.meta.title,
    description: copy.meta.description,
  },
}

/** Number badges of the four cycle steps, in the artboard's order (paper → forest → amber). */
const stepBadges = [
  'bg-paper-sunken text-ink',
  'bg-forest-50 text-forest-700',
  'bg-forest-700 text-white',
  'bg-amber-300 text-ink',
] as const

/**
 * `/miten-se-toimii` (MV-101, docs/design/Miten.dc.html): the long-form explainer. Hero, the
 * twice-daily check cycle with its dial, the sample alert email, what the service does not do
 * and the closing CTA → `/rekisteroidy` (as on the landing page, `03-pages.md`). Static content.
 */
export default function HowItWorksPage() {
  return (
    <div className="flex flex-col gap-18">
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-5 pt-8 sm:pt-16">
        <p className="text-sm font-semibold tracking-wider text-ink-muted uppercase">
          {copy.eyebrow}
        </p>
        <h1 className="text-3xl font-bold text-balance text-forest-700 sm:text-4xl">
          {copy.title}
        </h1>
        <p className="text-lg text-pretty text-ink-muted sm:text-xl">{copy.lead}</p>
      </section>

      <section
        aria-labelledby="kierto-title"
        className="grid items-center gap-9 rounded-2xl border border-line bg-paper-raised px-7 py-9 md:grid-cols-2"
      >
        <div className="flex flex-col gap-3.5">
          <h2 className="text-2xl font-bold text-forest-700" id="kierto-title">
            {copy.cycle.title}
          </h2>
          <p className="text-pretty text-ink-muted">{copy.cycle.body}</p>
          <ol className="flex flex-col gap-3">
            {copy.cycle.steps.map((step, index) => (
              <li key={step.title} className="flex items-start gap-3.5">
                <span
                  aria-hidden="true"
                  className={`inline-flex size-7.5 flex-none items-center justify-center rounded-full text-sm font-bold ${stepBadges[index]}`}
                >
                  {index + 1}
                </span>
                <p>
                  <strong className="block">{step.title}</strong>
                  <span className="text-sm text-ink-muted">{step.body}</span>
                </p>
              </li>
            ))}
          </ol>
        </div>
        <CheckCycleIllustration />
      </section>

      <section
        aria-labelledby="sahkoposti-title"
        className="grid items-center gap-12 md:grid-cols-2"
      >
        <div className="flex flex-col gap-3.5">
          <h2 className="text-2xl font-bold text-forest-700" id="sahkoposti-title">
            {copy.email.title}
          </h2>
          <p className="text-pretty text-ink-muted">{copy.email.body}</p>
          <ul className="flex flex-col gap-2.5">
            {copy.email.points.map((point) => (
              <li key={point} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="mt-2 size-2 flex-none rounded-full bg-forest-600"
                />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex justify-center">
          <SampleEmailIllustration />
        </div>
      </section>

      <section aria-labelledby="ei-tee-title">
        <h2 className="mb-6 text-2xl font-bold text-forest-700" id="ei-tee-title">
          {copy.notDoing.title}
        </h2>
        <ul className="grid gap-5 md:grid-cols-3">
          {copy.notDoing.items.map((item) => (
            <li key={item.title} className="rounded-xl border border-line bg-paper-raised p-5.5">
              <strong className="block">{item.title}</strong>
              <span className="text-ink-muted">{item.body}</span>
            </li>
          ))}
        </ul>
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
          href="/rekisteroidy"
        >
          {copy.cta.button}
        </Link>
      </section>
    </div>
  )
}
