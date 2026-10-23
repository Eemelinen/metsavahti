import * as migration_20260906_125038_initial from './20260906_125038_initial';
import * as migration_20260920_135750_users_fields from './20260920_135750_users_fields';
import * as migration_20260920_141524_watch_areas_fields from './20260920_141524_watch_areas_fields';
import * as migration_20260920_143554_declarations_geom from './20260920_143554_declarations_geom';
import * as migration_20260920_145929_watch_area_declarations_alerts from './20260920_145929_watch_area_declarations_alerts';
import * as migration_20260920_153151_logs_consents_exports_job_runs from './20260920_153151_logs_consents_exports_job_runs';
import * as migration_20260920_162232_legal_documents from './20260920_162232_legal_documents';
import * as migration_20260920_180549_users_verification_sent_at from './20260920_180549_users_verification_sent_at';

export const migrations = [
  {
    up: migration_20260906_125038_initial.up,
    down: migration_20260906_125038_initial.down,
    name: '20260906_125038_initial',
  },
  {
    up: migration_20260920_135750_users_fields.up,
    down: migration_20260920_135750_users_fields.down,
    name: '20260920_135750_users_fields',
  },
  {
    up: migration_20260920_141524_watch_areas_fields.up,
    down: migration_20260920_141524_watch_areas_fields.down,
    name: '20260920_141524_watch_areas_fields',
  },
  {
    up: migration_20260920_143554_declarations_geom.up,
    down: migration_20260920_143554_declarations_geom.down,
    name: '20260920_143554_declarations_geom',
  },
  {
    up: migration_20260920_145929_watch_area_declarations_alerts.up,
    down: migration_20260920_145929_watch_area_declarations_alerts.down,
    name: '20260920_145929_watch_area_declarations_alerts',
  },
  {
    up: migration_20260920_153151_logs_consents_exports_job_runs.up,
    down: migration_20260920_153151_logs_consents_exports_job_runs.down,
    name: '20260920_153151_logs_consents_exports_job_runs',
  },
  {
    up: migration_20260920_162232_legal_documents.up,
    down: migration_20260920_162232_legal_documents.down,
    name: '20260920_162232_legal_documents',
  },
  {
    up: migration_20260920_180549_users_verification_sent_at.up,
    down: migration_20260920_180549_users_verification_sent_at.down,
    name: '20260920_180549_users_verification_sent_at'
  },
];
