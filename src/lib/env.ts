import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

const logLevels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const

/**
 * Validated environment. Import `env` instead of touching `process.env`.
 *
 * Fails fast at boot when something required is missing. Set
 * `SKIP_ENV_VALIDATION=1` for tooling that only needs to parse the code
 * (lint, knip, type generation without a database).
 */
export const env = createEnv({
  server: {
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    /** Set by Next.js itself (`phase-production-build` during `next build`); never configured. */
    NEXT_PHASE: z.string().min(1).optional(),
    DATABASE_URL: z.url().startsWith('postgres'),
    PAYLOAD_SECRET: z.string().min(16),
    /** HS256 key of the app's signed links (`lib/tokens.ts`, `01 §9`); unset = derived from `PAYLOAD_SECRET`. */
    TOKEN_SECRET: z.string().min(32).optional(),
    WFS_BASE_URL: z.url(),
    WFS_LAYER: z.string().min(1).default('v1:forestusedeclaration'),
    CRON_SECRET: z.string().min(8),
    EMAIL_FROM: z.string().min(3),
    /** Inbox of the `/yhteystiedot` form (`ContactReceived`, MV-095); unset = `DEFAULT_CONTACT_EMAIL`. */
    CONTACT_EMAIL: z.email().optional(),
    /** Data-protection inbox of the `/tietopyynto` form (`DataRequestReceived`, MV-095); unset = `DEFAULT_DPO_EMAIL`. */
    DPO_EMAIL: z.email().optional(),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(1025),
    RESEND_API_KEY: z.string().min(1).optional(),
    MAILPIT_API_URL: z.url().optional(),
    MML_API_KEY: z.string().min(1).optional(),
    SENTRY_DSN: z.string().min(1).optional(),
    LOG_LEVEL: z.enum(logLevels).default('info'),
    /** `1` exposes `/virhe`, a route that throws so the e2e suite can test `error.tsx`. */
    ENABLE_ERROR_TEST_ROUTE: z.enum(['0', '1']).default('0'),
    /** `1` sends every request to `/huolto` (pages) or answers 503 (`/api/*`), except `/api/health`. */
    MAINTENANCE_MODE: z.enum(['0', '1']).default('0'),
    /** Shown on `/huolto` as "Palaamme noin klo …" (e.g. `07.00`); without it the page says "pian". */
    MAINTENANCE_RETURN_TIME: z.string().min(1).max(40).optional(),
    /** `1` serves `GET /api/alerts/[id]/map-image.png` (MV-077); `0` answers 404 there. */
    ENABLE_MAP_IMAGES: z.enum(['0', '1']).default('0'),
    /** `1` serves `/hinnoittelu` and shows it in the header and sitemap (MV-101); `0` answers 404. */
    SHOW_PRICING: z.enum(['0', '1']).default('0'),
    /** Auth Server Actions (registration) allowed per IP per hour (`01 §8`; ticket MV-042 says 5). */
    AUTH_RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(5),
    /** Local directory for the `exports` upload collection (relative to the working directory). */
    EXPORTS_DIR: z.string().min(1).default('exports'),
    /** When set, `exports` files go to this S3-compatible bucket instead of `EXPORTS_DIR` (D-013). */
    S3_BUCKET: z.string().min(1).optional(),
    S3_REGION: z.string().min(1).default('auto'),
    S3_ENDPOINT: z.url().optional(),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  },
  client: {
    NEXT_PUBLIC_SERVER_URL: z.url(),
    NEXT_PUBLIC_SENTRY_DSN: z.string().min(1).optional(),
    /** Analytics script (Plausible/Umami, MV-126), loaded only after analytics consent (MV-090); unset = none. */
    NEXT_PUBLIC_ANALYTICS_SCRIPT_URL: z.url().optional(),
  },
  // Only NEXT_PUBLIC_* keys must be listed; server keys are read from process.env.
  experimental__runtimeEnv: {
    NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_ANALYTICS_SCRIPT_URL: process.env.NEXT_PUBLIC_ANALYTICS_SCRIPT_URL,
  },
  emptyStringAsUndefined: true,
  skipValidation: Boolean(process.env.SKIP_ENV_VALIDATION),
})
