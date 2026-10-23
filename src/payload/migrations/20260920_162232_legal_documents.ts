import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_legal_documents_slug" AS ENUM('privacy', 'terms', 'cookies', 'accessibility');
  CREATE TABLE "legal_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" "enum_legal_documents_slug" NOT NULL,
  	"version" varchar NOT NULL,
  	"published_at" timestamp(3) with time zone,
  	"requires_reacceptance" boolean DEFAULT false NOT NULL,
  	"change_summary" varchar,
  	"body" jsonb NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "legal_documents_id" integer;
  CREATE INDEX "legal_documents_slug_idx" ON "legal_documents" USING btree ("slug");
  CREATE INDEX "legal_documents_published_at_idx" ON "legal_documents" USING btree ("published_at");
  CREATE INDEX "legal_documents_updated_at_idx" ON "legal_documents" USING btree ("updated_at");
  CREATE INDEX "legal_documents_created_at_idx" ON "legal_documents" USING btree ("created_at");
  CREATE UNIQUE INDEX "slug_version_idx" ON "legal_documents" USING btree ("slug","version");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_legal_documents_fk" FOREIGN KEY ("legal_documents_id") REFERENCES "public"."legal_documents"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_legal_documents_id_idx" ON "payload_locked_documents_rels" USING btree ("legal_documents_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   -- Hand-ordered: the generated down dropped the table (and with CASCADE its FK) before
  -- dropping the constraint by name, which fails with "constraint does not exist".
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_legal_documents_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_legal_documents_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "legal_documents_id";
  DROP TABLE IF EXISTS "legal_documents" CASCADE;
  DROP TYPE IF EXISTS "public"."enum_legal_documents_slug";`)
}
