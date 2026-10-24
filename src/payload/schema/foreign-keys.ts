import type { PostgresAdapterArgs } from '@payloadcms/db-postgres'

type PostgresSchemaHook = NonNullable<PostgresAdapterArgs['beforeSchemaInit']>[number]

/**
 * Relationship columns whose rows go with the row they point at. Payload gives every single
 * relationship column `ON DELETE set null`, which a NOT NULL column turns into a refused
 * delete. Keyed by table, then by the field name of the relationship.
 */
const CASCADING_RELATIONSHIPS: Record<string, string[]> = {
  // Deleting a watch area deletes its alerts (MV-064, migration `alerts_watch_area_cascade`).
  // `watch_area_declarations` cascades too, but through MV-034's hand-edited migration: listing
  // it here would make the next generated `down` reset those keys to `set null`.
  alerts: ['watchArea'],
}

/**
 * `beforeSchemaInit` hook: sets `ON DELETE cascade` on the foreign keys above in Payload's raw
 * schema, before it becomes the Drizzle schema. `payload migrate:create` diffs that schema, so
 * the generated migration and its snapshot carry the cascade and later diffs keep it.
 */
export const cascadeDeletes: PostgresSchemaHook = ({ adapter, schema }) => {
  for (const [tableName, fields] of Object.entries(CASCADING_RELATIONSHIPS)) {
    const table = adapter.rawTables[tableName]
    for (const field of fields) {
      const reference = table?.columns[field]?.reference
      if (!reference) {
        throw new Error(
          `Expected a relationship column ${tableName}.${field} in the Payload schema`,
        )
      }
      reference.onDelete = 'cascade'
    }
  }
  return schema
}
