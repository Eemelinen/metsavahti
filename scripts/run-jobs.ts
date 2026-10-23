/**
 * Run the sync-declarations workflow once, locally, using the current .env.
 *   pnpm jobs:run
 */
import 'dotenv/config'
import { getPayload } from 'payload'

async function main() {
  const { default: config } = await import('../src/payload.config')
  const payload = await getPayload({ config })
  const job = await payload.jobs.queue({ workflow: 'sync-declarations', input: {} })
  const result = await payload.jobs.run({ allQueues: true })
  console.log(
    JSON.stringify({ jobId: job.id, status: result.jobStatus?.[String(job.id)]?.status }, null, 2),
  )
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
