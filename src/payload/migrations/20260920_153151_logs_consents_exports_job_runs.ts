import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * MV-035: `notification_log` per `01 §3.6` and the new `consent_events` (`01 §3.7`),
 * `data_export_requests` (`01 §3.8`), `job_runs` (`01 §3.9`) and `exports` (`01 §4.5`,
 * upload collection) tables. Two generated diffs merged by hand (migrations README):
 * the new `notification_log` columns are added nullable, backfilled from the rows that
 * exist (every old row is a sent or failed alert email; `provider` keeps the old `channel`
 * value because the adapter that sent it is unknown) and only then set NOT NULL, and the
 * old `channel` column and its enum go last. The `queued` status value is new.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_notification_log_type" AS ENUM('alert_immediate', 'alert_digest', 'verify_email', 'password_reset', 'email_change', 'data_export', 'account_deleted');
  CREATE TYPE "public"."enum_consent_events_kind" AS ENUM('terms', 'privacy', 'marketing', 'cookies');
  CREATE TYPE "public"."enum_data_export_requests_status" AS ENUM('pending', 'ready', 'expired', 'failed');
  CREATE TYPE "public"."enum_job_runs_task" AS ENUM('fetch-declarations', 'match-watch-areas', 'send-alerts', 'cleanup', 'export', 'delete-account');
  CREATE TYPE "public"."enum_job_runs_status" AS ENUM('running', 'succeeded', 'failed');
  ALTER TYPE "public"."enum_notification_log_status" ADD VALUE 'queued' BEFORE 'sent';
  CREATE TABLE "consent_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer,
  	"kind" "enum_consent_events_kind" NOT NULL,
  	"version" varchar NOT NULL,
  	"granted" boolean DEFAULT false NOT NULL,
  	"ip" varchar,
  	"user_agent" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "data_export_requests" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"status" "enum_data_export_requests_status" DEFAULT 'pending' NOT NULL,
  	"file_id" integer,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "exports" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "job_runs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"task" "enum_job_runs_task" NOT NULL,
  	"started_at" timestamp(3) with time zone NOT NULL,
  	"finished_at" timestamp(3) with time zone,
  	"status" "enum_job_runs_status" DEFAULT 'running' NOT NULL,
  	"stats" jsonb,
  	"error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "notification_log" ADD COLUMN "type" "enum_notification_log_type";
  ALTER TABLE "notification_log" ADD COLUMN "provider" varchar;
  ALTER TABLE "notification_log" ADD COLUMN "provider_message_id" varchar;
  ALTER TABLE "notification_log" ADD COLUMN "sent_at" timestamp(3) with time zone;
  UPDATE "notification_log" SET
    "type" = 'alert_immediate',
    "provider" = "channel"::text,
    "sent_at" = CASE WHEN "status" = 'sent' THEN "created_at" ELSE NULL END;
  ALTER TABLE "notification_log" ALTER COLUMN "type" SET NOT NULL;
  ALTER TABLE "notification_log" ALTER COLUMN "provider" SET NOT NULL;
  ALTER TABLE "notification_log" DROP COLUMN "channel";
  DROP TYPE "public"."enum_notification_log_channel";
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "consent_events_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "data_export_requests_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "exports_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "job_runs_id" integer;
  ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "data_export_requests" ADD CONSTRAINT "data_export_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "data_export_requests" ADD CONSTRAINT "data_export_requests_file_id_exports_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."exports"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "exports" ADD CONSTRAINT "exports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "consent_events_user_idx" ON "consent_events" USING btree ("user_id");
  CREATE INDEX "consent_events_updated_at_idx" ON "consent_events" USING btree ("updated_at");
  CREATE INDEX "consent_events_created_at_idx" ON "consent_events" USING btree ("created_at");
  CREATE INDEX "data_export_requests_user_idx" ON "data_export_requests" USING btree ("user_id");
  CREATE INDEX "data_export_requests_status_idx" ON "data_export_requests" USING btree ("status");
  CREATE INDEX "data_export_requests_file_idx" ON "data_export_requests" USING btree ("file_id");
  CREATE INDEX "data_export_requests_expires_at_idx" ON "data_export_requests" USING btree ("expires_at");
  CREATE INDEX "data_export_requests_updated_at_idx" ON "data_export_requests" USING btree ("updated_at");
  CREATE INDEX "data_export_requests_created_at_idx" ON "data_export_requests" USING btree ("created_at");
  CREATE INDEX "exports_user_idx" ON "exports" USING btree ("user_id");
  CREATE INDEX "exports_updated_at_idx" ON "exports" USING btree ("updated_at");
  CREATE INDEX "exports_created_at_idx" ON "exports" USING btree ("created_at");
  CREATE UNIQUE INDEX "exports_filename_idx" ON "exports" USING btree ("filename");
  CREATE INDEX "job_runs_started_at_idx" ON "job_runs" USING btree ("started_at");
  CREATE INDEX "job_runs_updated_at_idx" ON "job_runs" USING btree ("updated_at");
  CREATE INDEX "job_runs_created_at_idx" ON "job_runs" USING btree ("created_at");
  CREATE INDEX "task_startedAt_idx" ON "job_runs" USING btree ("task","started_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_consent_events_fk" FOREIGN KEY ("consent_events_id") REFERENCES "public"."consent_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_data_export_requests_fk" FOREIGN KEY ("data_export_requests_id") REFERENCES "public"."data_export_requests"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_exports_fk" FOREIGN KEY ("exports_id") REFERENCES "public"."exports"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_job_runs_fk" FOREIGN KEY ("job_runs_id") REFERENCES "public"."job_runs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "notification_log_type_idx" ON "notification_log" USING btree ("type");
  CREATE INDEX "notification_log_status_idx" ON "notification_log" USING btree ("status");
  CREATE INDEX "payload_locked_documents_rels_consent_events_id_idx" ON "payload_locked_documents_rels" USING btree ("consent_events_id");
  CREATE INDEX "payload_locked_documents_rels_data_export_requests_id_idx" ON "payload_locked_documents_rels" USING btree ("data_export_requests_id");
  CREATE INDEX "payload_locked_documents_rels_exports_id_idx" ON "payload_locked_documents_rels" USING btree ("exports_id");
  CREATE INDEX "payload_locked_documents_rels_job_runs_id_idx" ON "payload_locked_documents_rels" USING btree ("job_runs_id");`)
}

/**
 * Reverses the above. `queued` rows have no pre-MV-035 equivalent and become `failed`
 * before the status enum is narrowed; `channel` comes back with its old default.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "consent_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "data_export_requests" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "exports" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "job_runs" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "consent_events" CASCADE;
  DROP TABLE "data_export_requests" CASCADE;
  DROP TABLE "exports" CASCADE;
  DROP TABLE "job_runs" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_consent_events_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_data_export_requests_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_exports_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_job_runs_fk";
  UPDATE "notification_log" SET "status" = 'failed' WHERE "status" = 'queued';
  ALTER TABLE "notification_log" ALTER COLUMN "status" SET DATA TYPE text;
  DROP TYPE "public"."enum_notification_log_status";
  CREATE TYPE "public"."enum_notification_log_status" AS ENUM('sent', 'failed');
  ALTER TABLE "notification_log" ALTER COLUMN "status" SET DATA TYPE "public"."enum_notification_log_status" USING "status"::"public"."enum_notification_log_status";
  CREATE TYPE "public"."enum_notification_log_channel" AS ENUM('email');
  ALTER TABLE "notification_log" ADD COLUMN "channel" "enum_notification_log_channel" DEFAULT 'email' NOT NULL;
  DROP INDEX "notification_log_type_idx";
  DROP INDEX "notification_log_status_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_consent_events_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_data_export_requests_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_exports_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_job_runs_id_idx";
  ALTER TABLE "notification_log" DROP COLUMN "type";
  ALTER TABLE "notification_log" DROP COLUMN "provider";
  ALTER TABLE "notification_log" DROP COLUMN "provider_message_id";
  ALTER TABLE "notification_log" DROP COLUMN "sent_at";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "consent_events_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "data_export_requests_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "exports_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "job_runs_id";
  DROP TYPE "public"."enum_notification_log_type";
  DROP TYPE "public"."enum_consent_events_kind";
  DROP TYPE "public"."enum_data_export_requests_status";
  DROP TYPE "public"."enum_job_runs_task";
  DROP TYPE "public"."enum_job_runs_status";`)
}
