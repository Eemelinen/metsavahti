import pino from 'pino'

import { env } from '@/lib/env'

/**
 * Application logger. Pretty-printed in development, JSON elsewhere.
 * Use `logger.child({ jobRunId })` inside jobs so every line carries the run id.
 */
export const logger = pino({
  // env is unvalidated under SKIP_ENV_VALIDATION (lint/knip); fall back to info.
  level: env.LOG_LEVEL ?? 'info',
  ...(env.NODE_ENV === 'development'
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {}),
})

export type Logger = typeof logger
