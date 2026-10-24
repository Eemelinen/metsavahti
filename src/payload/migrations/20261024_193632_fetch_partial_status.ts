import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_job_runs_status" ADD VALUE 'partial' BEFORE 'failed';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "job_runs" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "job_runs" ALTER COLUMN "status" SET DEFAULT 'running'::text;
  DROP TYPE "public"."enum_job_runs_status";
  CREATE TYPE "public"."enum_job_runs_status" AS ENUM('running', 'succeeded', 'failed');
  ALTER TABLE "job_runs" ALTER COLUMN "status" SET DEFAULT 'running'::"public"."enum_job_runs_status";
  ALTER TABLE "job_runs" ALTER COLUMN "status" SET DATA TYPE "public"."enum_job_runs_status" USING "status"::"public"."enum_job_runs_status";`)
}
