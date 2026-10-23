import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_locale" AS ENUM('fi', 'en');
  CREATE TYPE "public"."enum_users_notification_prefs_mode" AS ENUM('immediate', 'daily', 'weekly');
  CREATE TYPE "public"."enum_users_plan" AS ENUM('free');
  ALTER TABLE "users" ADD COLUMN "locale" "enum_users_locale" DEFAULT 'fi';
  ALTER TABLE "users" ADD COLUMN "timezone" varchar DEFAULT 'Europe/Helsinki';
  ALTER TABLE "users" ADD COLUMN "marketing_consent" boolean DEFAULT false;
  ALTER TABLE "users" ADD COLUMN "marketing_consent_at" timestamp(3) with time zone;
  ALTER TABLE "users" ADD COLUMN "notification_prefs_enabled" boolean DEFAULT true;
  ALTER TABLE "users" ADD COLUMN "notification_prefs_mode" "enum_users_notification_prefs_mode" DEFAULT 'immediate';
  ALTER TABLE "users" ADD COLUMN "notification_prefs_daily_hour" numeric DEFAULT 9;
  ALTER TABLE "users" ADD COLUMN "plan" "enum_users_plan" DEFAULT 'free';
  ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp(3) with time zone;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" DROP COLUMN "locale";
  ALTER TABLE "users" DROP COLUMN "timezone";
  ALTER TABLE "users" DROP COLUMN "marketing_consent";
  ALTER TABLE "users" DROP COLUMN "marketing_consent_at";
  ALTER TABLE "users" DROP COLUMN "notification_prefs_enabled";
  ALTER TABLE "users" DROP COLUMN "notification_prefs_mode";
  ALTER TABLE "users" DROP COLUMN "notification_prefs_daily_hour";
  ALTER TABLE "users" DROP COLUMN "plan";
  ALTER TABLE "users" DROP COLUMN "deleted_at";
  DROP TYPE "public"."enum_users_locale";
  DROP TYPE "public"."enum_users_notification_prefs_mode";
  DROP TYPE "public"."enum_users_plan";`)
}
