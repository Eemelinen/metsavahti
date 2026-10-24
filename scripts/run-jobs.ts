/**
 * Run the sync-declarations workflow (or the weekly cleanup) once, locally, using the current .env.
 *   pnpm jobs:run            # sync-declarations
 *   pnpm jobs:run cleanup
 */
import 'dotenv/config'
import { getPayload } from 'payload'

async function main() {
  const [{ default: config }, { RUNNABLE_JOBS, runJobNow, runnableJobSchema }] = await Promise.all([
    import('../src/payload.config'),
    import('../src/lib/jobs/run-now'),
  ])
  const job = runnableJobSchema.safeParse(process.argv[2])
  if (!job.success) {
    throw new Error(`Unknown job "${process.argv[2]}"; expected one of ${RUNNABLE_JOBS.join(', ')}`)
  }
  const payload = await getPayload({ config })
  const summary = await runJobNow(payload, job.data)
  console.log(JSON.stringify(summary, null, 2))
  process.exit(summary.ok ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
