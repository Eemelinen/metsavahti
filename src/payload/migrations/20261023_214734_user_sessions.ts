import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "user_sessions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer,
  	"sid" varchar NOT NULL,
  	"user_agent" varchar,
  	"last_seen_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "user_sessions_id" integer;
  ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "user_sessions_user_idx" ON "user_sessions" USING btree ("user_id");
  CREATE UNIQUE INDEX "user_sessions_sid_idx" ON "user_sessions" USING btree ("sid");
  CREATE INDEX "user_sessions_updated_at_idx" ON "user_sessions" USING btree ("updated_at");
  CREATE INDEX "user_sessions_created_at_idx" ON "user_sessions" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_user_sessions_fk" FOREIGN KEY ("user_sessions_id") REFERENCES "public"."user_sessions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_user_sessions_id_idx" ON "payload_locked_documents_rels" USING btree ("user_sessions_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   -- Hand-ordered like 20261023_121838_rate_limit_buckets: the generated down dropped the table
  -- (and with CASCADE its FK) before dropping the constraint by name, which fails.
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_user_sessions_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_user_sessions_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "user_sessions_id";
  DROP TABLE IF EXISTS "user_sessions" CASCADE;`)
}
