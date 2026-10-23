import type { ReactNode } from 'react'

/**
 * Centered system page (docs/design/App.dc.html#route=404 … rajoitus): a small code label,
 * a title, one explanatory paragraph and a row of actions. Used by not-found, the error
 * boundaries, `/huolto` and `/liikaa-pyyntoja`.
 */
export function SystemPage({
  code,
  title,
  children,
  actions,
  details,
}: {
  /** Short label above the title: `404`, `500`, `HUOLTO`, `429`. */
  code: string
  title: string
  /** The explanatory paragraph. */
  children: ReactNode
  actions: ReactNode
  /** Optional last line, e.g. an error id the user can quote in support requests. */
  details?: ReactNode
}) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-4 py-8 text-center">
      <p className="font-mono text-sm tracking-widest text-ink-muted" data-testid="system-code">
        {code}
      </p>
      <h1 className="text-3xl font-bold text-balance text-forest-700">{title}</h1>
      <p className="max-w-md text-pretty text-ink-muted">{children}</p>
      <div className="flex flex-wrap justify-center gap-2.5">{actions}</div>
      {details ? <p className="text-xs text-ink-muted">{details}</p> : null}
    </section>
  )
}

const actionBase =
  'inline-flex min-h-11 items-center justify-center rounded-lg px-5 py-3 text-base font-semibold transition-colors'

/** Button-like classes for the actions row; `Link` and `button` share them. */
export const systemAction = {
  primary: `${actionBase} bg-forest-700 text-white hover:bg-forest-600`,
  secondary: `${actionBase} border border-line bg-paper-raised text-forest-700 hover:bg-forest-50`,
  link: `${actionBase} text-forest-600 hover:underline`,
} as const
