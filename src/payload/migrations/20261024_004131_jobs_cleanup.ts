import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'cleanup';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'cleanup';
  ALTER TABLE "declaration_revisions" DROP CONSTRAINT "declaration_revisions_declaration_id_declarations_id_fk";
  
  ALTER TABLE "alerts" DROP CONSTRAINT "alerts_declaration_id_declarations_id_fk";
  
  ALTER TABLE "job_runs" ADD COLUMN "run_id" varchar;
  ALTER TABLE "declaration_revisions" ADD CONSTRAINT "declaration_revisions_declaration_id_declarations_id_fk" FOREIGN KEY ("declaration_id") REFERENCES "public"."declarations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "alerts" ADD CONSTRAINT "alerts_declaration_id_declarations_id_fk" FOREIGN KEY ("declaration_id") REFERENCES "public"."declarations"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "job_runs_run_id_idx" ON "job_runs" USING btree ("run_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "declaration_revisions" DROP CONSTRAINT "declaration_revisions_declaration_id_declarations_id_fk";
  
  ALTER TABLE "alerts" DROP CONSTRAINT "alerts_declaration_id_declarations_id_fk";
  
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'fetch-declarations', 'match-watch-areas', 'send-alerts');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'fetch-declarations', 'match-watch-areas', 'send-alerts');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX "job_runs_run_id_idx";
  ALTER TABLE "declaration_revisions" ADD CONSTRAINT "declaration_revisions_declaration_id_declarations_id_fk" FOREIGN KEY ("declaration_id") REFERENCES "public"."declarations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "alerts" ADD CONSTRAINT "alerts_declaration_id_declarations_id_fk" FOREIGN KEY ("declaration_id") REFERENCES "public"."declarations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "job_runs" DROP COLUMN "run_id";`)
}
