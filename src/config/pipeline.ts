/**
 * What `/api/health` reports about the pipeline (`01 §10`, MV-075). The pipeline runs at
 * 09:30 and 21:30 Finnish time (`01 §2`), at most 12 h apart.
 */
export const pipelineHealth = {
  /** The last run is `stale` once it finished longer ago than this: one run was missed. */
  staleAfterMs: 14 * 60 * 60 * 1000,
  /** Timeout of the `?deep=1` GetCapabilities request; it is not retried. */
  wfsTimeoutMs: 5_000,
} as const
