# Migrations

The committed files in this directory are the only source of the database schema (`push: false`
everywhere, `docs/DECISIONS.md` D-004). Payload has no PostGIS field type, so every geometry
statement is raw SQL inside a migration (D-003).

## Commands

| Command | What it does |
| --- | --- |
| `pnpm db:migrate` | Applies pending migrations to the dev database (`DATABASE_URL`). |
| `pnpm db:migrate:status` | Lists which migrations have run. |
| `pnpm db:migrate:create <name>` | Diffs the Payload schema against the latest `*.json` snapshot and writes `YYYYMMDD_HHMMSS_<name>.ts`. |
| `pnpm db:reset` | `docker compose down -v` → `pnpm db:up` → `pnpm db:migrate`: a fresh dev database from history only. |
| `pnpm test:integration` | Runs `payload migrate` against a throwaway Testcontainers PostGIS before the tests. |

In production the same list is applied on boot through `prodMigrations` in `src/payload.config.ts`.

## Order and bookkeeping

- The CLI applies files in name order; `prodMigrations` uses the order of `index.ts`. Keep them
  identical (`enable-postgis-and-migration-scaffolding.int.test.ts` asserts that the applied list
  equals `index.ts`).
- PostGIS is enabled twice on purpose: `extensions: ['postgis']` on the adapter runs
  `CREATE EXTENSION IF NOT EXISTS` before every `migrate` (CLI and production boot), and the first
  statement of `20260906_125038_initial` repeats it inside the schema history. There is no separate
  `0001_postgis` file: Payload records each migration in `payload_migrations`, which the initial
  migration creates, so nothing can be recorded before it (ticket MV-030, ledger S17).
- Applied migrations are recorded by name. An applied file is never edited; fix a mistake with a
  new migration. Every statement is idempotent where SQL allows it (`IF NOT EXISTS`, `IF EXISTS`).
- `*.json` files are Drizzle schema snapshots consumed by the next `migrate:create`; a hand-written
  migration has none, which is fine because it never changes the Payload-managed schema.

## Raw-SQL pattern

`db` is the Drizzle instance; `sql` is the tag from `@payloadcms/db-postgres`. `up` and `down` run
inside one transaction each, so a failing statement rolls the whole migration back.

```ts
import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "declarations" ADD COLUMN IF NOT EXISTS "centroid" geometry(Point, 3067);
    CREATE INDEX IF NOT EXISTS "declarations_centroid_gist" ON "declarations" USING gist ("centroid");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "declarations_centroid_gist";
    ALTER TABLE "declarations" DROP COLUMN IF EXISTS "centroid";
  `)
}
```

Recipe for a schema change that mixes Payload fields and PostGIS:

1. Change the collection config; for geometry columns also register them in
   `src/payload/schema` (`afterSchemaInit`) so Drizzle knows they exist.
2. `pnpm db:migrate:create <name>` — generates the Payload-managed part and the snapshot.
3. Append the PostGIS statements to the generated `up`/`down` by hand, as above.
4. `pnpm db:migrate` locally, then `pnpm test:integration` (`payload-boot.int.test.ts` checks the
   geometry columns and GIST indexes; `enable-postgis-and-migration-scaffolding.int.test.ts` checks
   the extension and the migration order).
5. Runtime spatial SQL never lives in a migration or a collection hook; it belongs in
   `src/lib/geo/spatial-queries.ts`.

Renaming a field: when one table both gains and loses a column in the same diff, Drizzle asks
interactively whether the new column is a rename, and in a non-interactive session (loop driver,
no TTY) the command hangs. Generate two diffs instead — first add the new field while keeping the
old one, then remove the old one — and merge them by hand into one file whose `up` uses
`ALTER TABLE … RENAME COLUMN` (keeps the data) and whose `down` renames it back; keep the last
`*.json` snapshot and delete the intermediate one (`20260920_141524_watch_areas_fields`,
`20260920_143554_declarations_geom`, which renames six columns and adds a table, and
`20260920_145929_watch_area_declarations_alerts`, which converts the alert columns with `UPDATE`s and
seeds a new table from existing rows, and `20260920_153151_logs_consents_exports_job_runs`, which adds
NOT NULL columns as nullable, backfills them and only then tightens them, are the examples). Without a `.env` in the loop, run it as `pnpm exec dotenv -e .env.test -- pnpm db:migrate:create <name>`;
it only diffs the snapshot.
