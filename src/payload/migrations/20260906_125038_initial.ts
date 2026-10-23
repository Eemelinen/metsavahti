import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE EXTENSION IF NOT EXISTS postgis;
   CREATE TYPE "public"."enum_users_role" AS ENUM('user', 'admin');
  CREATE TYPE "public"."enum_alerts_kind" AS ENUM('new', 'changed');
  CREATE TYPE "public"."enum_alerts_status" AS ENUM('pending', 'sent', 'failed');
  CREATE TYPE "public"."enum_notification_log_channel" AS ENUM('email');
  CREATE TYPE "public"."enum_notification_log_status" AS ENUM('sent', 'failed');
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'fetch-declarations', 'match-watch-areas', 'send-alerts');
  CREATE TYPE "public"."enum_payload_jobs_log_state" AS ENUM('failed', 'succeeded');
  CREATE TYPE "public"."enum_payload_jobs_workflow_slug" AS ENUM('sync-declarations');
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'fetch-declarations', 'match-watch-areas', 'send-alerts');
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"role" "enum_users_role" DEFAULT 'user' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"_verified" boolean,
  	"_verificationtoken" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "watch_areas" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"center" geometry(Point) NOT NULL,
  	"radius_m" numeric DEFAULT 1000 NOT NULL,
  	"owner_id" integer NOT NULL,
  	"notify_by_email" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"geom_3067" geometry(Polygon,3067) GENERATED ALWAYS AS (ST_Buffer(ST_Transform(ST_SetSRID("center", 4326), 3067), "radius_m"::double precision)) STORED
  );
  
  CREATE TABLE "declarations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"metsakeskus_id" varchar NOT NULL,
  	"declaration_number" varchar NOT NULL,
  	"hakkuutapa" numeric,
  	"area_ha" numeric,
  	"arrival_date" timestamp(3) with time zone,
  	"updated_at_source" timestamp(3) with time zone,
  	"geom_hash" varchar NOT NULL,
  	"first_seen" timestamp(3) with time zone NOT NULL,
  	"last_seen" timestamp(3) with time zone NOT NULL,
  	"properties" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"geom" geometry(MultiPolygon,3067)
  );
  
  CREATE TABLE "alerts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"watch_area_id" integer NOT NULL,
  	"declaration_id" integer NOT NULL,
  	"kind" "enum_alerts_kind" NOT NULL,
  	"distance_m" numeric,
  	"geom_hash" varchar NOT NULL,
  	"status" "enum_alerts_status" DEFAULT 'pending' NOT NULL,
  	"sent_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "notification_log" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer,
  	"recipient" varchar,
  	"channel" "enum_notification_log_channel" DEFAULT 'email' NOT NULL,
  	"status" "enum_notification_log_status" NOT NULL,
  	"error" varchar,
  	"job_run_id" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "notification_log_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"alerts_id" integer
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_jobs_log" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"executed_at" timestamp(3) with time zone NOT NULL,
  	"completed_at" timestamp(3) with time zone NOT NULL,
  	"task_slug" "enum_payload_jobs_log_task_slug" NOT NULL,
  	"task_i_d" varchar NOT NULL,
  	"input" jsonb,
  	"output" jsonb,
  	"state" "enum_payload_jobs_log_state" NOT NULL,
  	"error" jsonb
  );
  
  CREATE TABLE "payload_jobs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"input" jsonb,
  	"completed_at" timestamp(3) with time zone,
  	"total_tried" numeric DEFAULT 0,
  	"has_error" boolean DEFAULT false,
  	"error" jsonb,
  	"workflow_slug" "enum_payload_jobs_workflow_slug",
  	"task_slug" "enum_payload_jobs_task_slug",
  	"queue" varchar DEFAULT 'default',
  	"wait_until" timestamp(3) with time zone,
  	"processing" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"watch_areas_id" integer,
  	"declarations_id" integer,
  	"alerts_id" integer,
  	"notification_log_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "watch_areas" ADD CONSTRAINT "watch_areas_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "alerts" ADD CONSTRAINT "alerts_watch_area_id_watch_areas_id_fk" FOREIGN KEY ("watch_area_id") REFERENCES "public"."watch_areas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "alerts" ADD CONSTRAINT "alerts_declaration_id_declarations_id_fk" FOREIGN KEY ("declaration_id") REFERENCES "public"."declarations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "notification_log_rels" ADD CONSTRAINT "notification_log_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."notification_log"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "notification_log_rels" ADD CONSTRAINT "notification_log_rels_alerts_fk" FOREIGN KEY ("alerts_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_jobs_log" ADD CONSTRAINT "payload_jobs_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."payload_jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_watch_areas_fk" FOREIGN KEY ("watch_areas_id") REFERENCES "public"."watch_areas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_declarations_fk" FOREIGN KEY ("declarations_id") REFERENCES "public"."declarations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_alerts_fk" FOREIGN KEY ("alerts_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_notification_log_fk" FOREIGN KEY ("notification_log_id") REFERENCES "public"."notification_log"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE INDEX "watch_areas_owner_idx" ON "watch_areas" USING btree ("owner_id");
  CREATE INDEX "watch_areas_updated_at_idx" ON "watch_areas" USING btree ("updated_at");
  CREATE INDEX "watch_areas_created_at_idx" ON "watch_areas" USING btree ("created_at");
  CREATE UNIQUE INDEX "declarations_metsakeskus_id_idx" ON "declarations" USING btree ("metsakeskus_id");
  CREATE INDEX "declarations_declaration_number_idx" ON "declarations" USING btree ("declaration_number");
  CREATE INDEX "declarations_geom_hash_idx" ON "declarations" USING btree ("geom_hash");
  CREATE INDEX "declarations_last_seen_idx" ON "declarations" USING btree ("last_seen");
  CREATE INDEX "declarations_updated_at_idx" ON "declarations" USING btree ("updated_at");
  CREATE INDEX "declarations_created_at_idx" ON "declarations" USING btree ("created_at");
  CREATE INDEX "alerts_user_idx" ON "alerts" USING btree ("user_id");
  CREATE INDEX "alerts_watch_area_idx" ON "alerts" USING btree ("watch_area_id");
  CREATE INDEX "alerts_declaration_idx" ON "alerts" USING btree ("declaration_id");
  CREATE INDEX "alerts_geom_hash_idx" ON "alerts" USING btree ("geom_hash");
  CREATE INDEX "alerts_status_idx" ON "alerts" USING btree ("status");
  CREATE INDEX "alerts_updated_at_idx" ON "alerts" USING btree ("updated_at");
  CREATE INDEX "alerts_created_at_idx" ON "alerts" USING btree ("created_at");
  CREATE INDEX "notification_log_user_idx" ON "notification_log" USING btree ("user_id");
  CREATE INDEX "notification_log_job_run_id_idx" ON "notification_log" USING btree ("job_run_id");
  CREATE INDEX "notification_log_updated_at_idx" ON "notification_log" USING btree ("updated_at");
  CREATE INDEX "notification_log_created_at_idx" ON "notification_log" USING btree ("created_at");
  CREATE INDEX "notification_log_rels_order_idx" ON "notification_log_rels" USING btree ("order");
  CREATE INDEX "notification_log_rels_parent_idx" ON "notification_log_rels" USING btree ("parent_id");
  CREATE INDEX "notification_log_rels_path_idx" ON "notification_log_rels" USING btree ("path");
  CREATE INDEX "notification_log_rels_alerts_id_idx" ON "notification_log_rels" USING btree ("alerts_id");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_jobs_log_order_idx" ON "payload_jobs_log" USING btree ("_order");
  CREATE INDEX "payload_jobs_log_parent_id_idx" ON "payload_jobs_log" USING btree ("_parent_id");
  CREATE INDEX "payload_jobs_completed_at_idx" ON "payload_jobs" USING btree ("completed_at");
  CREATE INDEX "payload_jobs_total_tried_idx" ON "payload_jobs" USING btree ("total_tried");
  CREATE INDEX "payload_jobs_has_error_idx" ON "payload_jobs" USING btree ("has_error");
  CREATE INDEX "payload_jobs_workflow_slug_idx" ON "payload_jobs" USING btree ("workflow_slug");
  CREATE INDEX "payload_jobs_task_slug_idx" ON "payload_jobs" USING btree ("task_slug");
  CREATE INDEX "payload_jobs_queue_idx" ON "payload_jobs" USING btree ("queue");
  CREATE INDEX "payload_jobs_wait_until_idx" ON "payload_jobs" USING btree ("wait_until");
  CREATE INDEX "payload_jobs_processing_idx" ON "payload_jobs" USING btree ("processing");
  CREATE INDEX "payload_jobs_updated_at_idx" ON "payload_jobs" USING btree ("updated_at");
  CREATE INDEX "payload_jobs_created_at_idx" ON "payload_jobs" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_watch_areas_id_idx" ON "payload_locked_documents_rels" USING btree ("watch_areas_id");
  CREATE INDEX "payload_locked_documents_rels_declarations_id_idx" ON "payload_locked_documents_rels" USING btree ("declarations_id");
  CREATE INDEX "payload_locked_documents_rels_alerts_id_idx" ON "payload_locked_documents_rels" USING btree ("alerts_id");
  CREATE INDEX "payload_locked_documents_rels_notification_log_id_idx" ON "payload_locked_documents_rels" USING btree ("notification_log_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
  await db.execute(sql`
   CREATE INDEX "watch_areas_geom_3067_gist" ON "watch_areas" USING gist ("geom_3067");
  CREATE INDEX "declarations_geom_gist" ON "declarations" USING gist ("geom");`)
}


export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "watch_areas" CASCADE;
  DROP TABLE "declarations" CASCADE;
  DROP TABLE "alerts" CASCADE;
  DROP TABLE "notification_log" CASCADE;
  DROP TABLE "notification_log_rels" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_jobs_log" CASCADE;
  DROP TABLE "payload_jobs" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."enum_users_role";
  DROP TYPE "public"."enum_alerts_kind";
  DROP TYPE "public"."enum_alerts_status";
  DROP TYPE "public"."enum_notification_log_channel";
  DROP TYPE "public"."enum_notification_log_status";
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  DROP TYPE "public"."enum_payload_jobs_log_state";
  DROP TYPE "public"."enum_payload_jobs_workflow_slug";
  DROP TYPE "public"."enum_payload_jobs_task_slug";`)
}
