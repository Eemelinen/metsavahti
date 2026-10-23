/**
 * Seed the development database with an admin user, a sample watch area and the four
 * placeholder legal documents (idempotent).
 *   pnpm db:seed   (uses .env; refuses to run against a *_test/_e2e database)
 */
import 'dotenv/config'
import { getPayload } from 'payload'

import { seedLegalDocuments } from '../src/lib/legal/documents'

async function main() {
  const dbName = new URL(process.env.DATABASE_URL ?? '').pathname.slice(1)
  if (/(_test|_e2e)$/.test(dbName)) {
    throw new Error(`Refusing to seed test database ${dbName}; use the test setups instead.`)
  }
  const { default: config } = await import('../src/payload.config')
  const payload = await getPayload({ config })

  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@metsavahti.local'
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'admin-password-change-me'

  const existing = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
  })
  const admin =
    existing.docs[0] ??
    (await payload.create({
      collection: 'users',
      data: { email, password, name: 'Admin', role: 'admin', _verified: true },
    }))

  const areas = await payload.count({
    collection: 'watch-areas',
    where: { owner: { equals: admin.id } },
  })
  if (areas.totalDocs === 0) {
    await payload.create({
      collection: 'watch-areas',
      data: { name: 'Esimerkki: Nuuksio', center: [24.53, 60.31], radiusM: 2000, owner: admin.id },
    })
  }
  const legal = await seedLegalDocuments(payload)
  console.log(
    `Seeded ${legal.length} placeholder legal documents (${legal.length === 0 ? 'already present' : legal.map((d) => d.slug).join(', ')}).`,
  )
  console.log(`Seeded admin ${email} (password: ${password}) and a sample watch area.`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
