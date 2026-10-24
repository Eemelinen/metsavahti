/**
 * Run the sync-declarations workflow (or the weekly cleanup) once, locally, using the current .env.
 *   pnpm jobs:run            # sync-declarations
 *   pnpm jobs:run cleanup
 */
import 'dotenv/config'
import { getPayload } from 'payload'

async function main() {
  const [{ default: config }, { RUNNABLE_JOBS, runJobNow }] = await Promise.all([
    import('../src/payload.config'),
    import('../src/lib/jobs/run-now'),
  ])
  const job = process.argv[2] ?? 'sync-declarations'
  if (!(RUNNABLE_JOBS as readonly string[]).includes(job)) {
    throw new Error(`Unknown job "${job}"; expected one of ${RUNNABLE_JOBS.join(', ')}`)
  }
  const payload = await getPayload({ config })
  const summary = await runJobNow(payload, job as (typeof RUNNABLE_JOBS)[number])
  console.log(JSON.stringify(summary, null, 2))
  process.exit(summary.status === 'error' ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
