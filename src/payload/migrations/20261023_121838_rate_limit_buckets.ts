import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "rate_limit_buckets" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"hits" jsonb NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "rate_limit_buckets_id" integer;
  CREATE UNIQUE INDEX "rate_limit_buckets_key_idx" ON "rate_limit_buckets" USING btree ("key");
  CREATE INDEX "rate_limit_buckets_expires_at_idx" ON "rate_limit_buckets" USING btree ("expires_at");
  CREATE INDEX "rate_limit_buckets_updated_at_idx" ON "rate_limit_buckets" USING btree ("updated_at");
  CREATE INDEX "rate_limit_buckets_created_at_idx" ON "rate_limit_buckets" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_rate_limit_buckets_fk" FOREIGN KEY ("rate_limit_buckets_id") REFERENCES "public"."rate_limit_buckets"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_rate_limit_buckets_id_idx" ON "payload_locked_documents_rels" USING btree ("rate_limit_buckets_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   -- Hand-ordered like 20260920_162232_legal_documents: the generated down dropped the table
  -- (and with CASCADE its FK) before dropping the constraint by name, which fails.
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_rate_limit_buckets_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_rate_limit_buckets_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "rate_limit_buckets_id";
  DROP TABLE IF EXISTS "rate_limit_buckets" CASCADE;`)
}
