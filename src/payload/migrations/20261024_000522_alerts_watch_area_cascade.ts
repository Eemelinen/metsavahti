import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "alerts" DROP CONSTRAINT "alerts_watch_area_id_watch_areas_id_fk";
  
  ALTER TABLE "alerts" ADD CONSTRAINT "alerts_watch_area_id_watch_areas_id_fk" FOREIGN KEY ("watch_area_id") REFERENCES "public"."watch_areas"("id") ON DELETE cascade ON UPDATE no action;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "alerts" DROP CONSTRAINT "alerts_watch_area_id_watch_areas_id_fk";
  
  ALTER TABLE "alerts" ADD CONSTRAINT "alerts_watch_area_id_watch_areas_id_fk" FOREIGN KEY ("watch_area_id") REFERENCES "public"."watch_areas"("id") ON DELETE set null ON UPDATE no action;`)
}
