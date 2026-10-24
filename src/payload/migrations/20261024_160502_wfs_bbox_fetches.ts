import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "wfs_bbox_fetches" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"min_e" numeric NOT NULL,
  	"min_n" numeric NOT NULL,
  	"max_e" numeric NOT NULL,
  	"max_n" numeric NOT NULL,
  	"feature_count" numeric NOT NULL,
  	"fetched_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "wfs_bbox_fetches_id" integer;
  CREATE INDEX "wfs_bbox_fetches_fetched_at_idx" ON "wfs_bbox_fetches" USING btree ("fetched_at");
  CREATE INDEX "wfs_bbox_fetches_updated_at_idx" ON "wfs_bbox_fetches" USING btree ("updated_at");
  CREATE INDEX "wfs_bbox_fetches_created_at_idx" ON "wfs_bbox_fetches" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_wfs_bbox_fetches_fk" FOREIGN KEY ("wfs_bbox_fetches_id") REFERENCES "public"."wfs_bbox_fetches"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_wfs_bbox_fetches_id_idx" ON "payload_locked_documents_rels" USING btree ("wfs_bbox_fetches_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "wfs_bbox_fetches" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "wfs_bbox_fetches" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_wfs_bbox_fetches_fk";
  
  DROP INDEX "payload_locked_documents_rels_wfs_bbox_fetches_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "wfs_bbox_fetches_id";`)
}
