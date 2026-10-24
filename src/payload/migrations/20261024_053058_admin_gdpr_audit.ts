import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_job_runs_task" ADD VALUE 'admin-gdpr';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "job_runs" ALTER COLUMN "task" SET DATA TYPE text;
  DROP TYPE "public"."enum_job_runs_task";
  CREATE TYPE "public"."enum_job_runs_task" AS ENUM('fetch-declarations', 'match-watch-areas', 'send-alerts', 'cleanup', 'export', 'delete-account');
  ALTER TABLE "job_runs" ALTER COLUMN "task" SET DATA TYPE "public"."enum_job_runs_task" USING "task"::"public"."enum_job_runs_task";`)
}
