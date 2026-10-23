import * as Sentry from '@sentry/nextjs'

/** Next.js instrumentation hook. Sentry is only enabled when SENTRY_DSN is set. */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.SENTRY_DSN) {
    Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 })
  }
}

export const onRequestError = Sentry.captureRequestError
