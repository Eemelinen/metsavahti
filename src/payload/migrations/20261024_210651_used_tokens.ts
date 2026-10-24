import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_used_tokens_purpose" AS ENUM('unsub');
  CREATE TABLE "used_tokens" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"jti" varchar NOT NULL,
  	"purpose" "enum_used_tokens_purpose" NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE UNIQUE INDEX "used_tokens_jti_idx" ON "used_tokens" USING btree ("jti");
  CREATE INDEX "used_tokens_expires_at_idx" ON "used_tokens" USING btree ("expires_at");
  CREATE INDEX "used_tokens_updated_at_idx" ON "used_tokens" USING btree ("updated_at");
  CREATE INDEX "used_tokens_created_at_idx" ON "used_tokens" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "used_tokens" CASCADE;
  DROP TYPE "public"."enum_used_tokens_purpose";`)
}
