import * as migration_20260906_125038_initial from './20260906_125038_initial';
import * as migration_20260920_135750_users_fields from './20260920_135750_users_fields';
import * as migration_20260920_141524_watch_areas_fields from './20260920_141524_watch_areas_fields';
import * as migration_20260920_143554_declarations_geom from './20260920_143554_declarations_geom';
import * as migration_20260920_145929_watch_area_declarations_alerts from './20260920_145929_watch_area_declarations_alerts';
import * as migration_20260920_153151_logs_consents_exports_job_runs from './20260920_153151_logs_consents_exports_job_runs';
import * as migration_20260920_162232_legal_documents from './20260920_162232_legal_documents';
import * as migration_20260920_180549_users_verification_sent_at from './20260920_180549_users_verification_sent_at';
import * as migration_20261023_121838_rate_limit_buckets from './20261023_121838_rate_limit_buckets';
import * as migration_20261023_214734_user_sessions from './20261023_214734_user_sessions';
import * as migration_20261023_223512_users_pending_email from './20261023_223512_users_pending_email';
import * as migration_20261024_000522_alerts_watch_area_cascade from './20261024_000522_alerts_watch_area_cascade';
import * as migration_20261024_004131_jobs_cleanup from './20261024_004131_jobs_cleanup';
import * as migration_20261024_033242_data_export_task from './20261024_033242_data_export_task';
import * as migration_20261024_040826_account_deletion from './20261024_040826_account_deletion';
import * as migration_20261024_053058_admin_gdpr_audit from './20261024_053058_admin_gdpr_audit';
import * as migration_20261024_134227_declarations_missing_runs from './20261024_134227_declarations_missing_runs';
import * as migration_20261024_160502_wfs_bbox_fetches from './20261024_160502_wfs_bbox_fetches';

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
    name: '20260920_180549_users_verification_sent_at',
  },
  {
    up: migration_20261023_121838_rate_limit_buckets.up,
    down: migration_20261023_121838_rate_limit_buckets.down,
    name: '20261023_121838_rate_limit_buckets',
  },
  {
    up: migration_20261023_214734_user_sessions.up,
    down: migration_20261023_214734_user_sessions.down,
    name: '20261023_214734_user_sessions',
  },
  {
    up: migration_20261023_223512_users_pending_email.up,
    down: migration_20261023_223512_users_pending_email.down,
    name: '20261023_223512_users_pending_email',
  },
  {
    up: migration_20261024_000522_alerts_watch_area_cascade.up,
    down: migration_20261024_000522_alerts_watch_area_cascade.down,
    name: '20261024_000522_alerts_watch_area_cascade',
  },
  {
    up: migration_20261024_004131_jobs_cleanup.up,
    down: migration_20261024_004131_jobs_cleanup.down,
    name: '20261024_004131_jobs_cleanup',
  },
  {
    up: migration_20261024_033242_data_export_task.up,
    down: migration_20261024_033242_data_export_task.down,
    name: '20261024_033242_data_export_task',
  },
  {
    up: migration_20261024_040826_account_deletion.up,
    down: migration_20261024_040826_account_deletion.down,
    name: '20261024_040826_account_deletion',
  },
  {
    up: migration_20261024_053058_admin_gdpr_audit.up,
    down: migration_20261024_053058_admin_gdpr_audit.down,
    name: '20261024_053058_admin_gdpr_audit',
  },
  {
    up: migration_20261024_134227_declarations_missing_runs.up,
    down: migration_20261024_134227_declarations_missing_runs.down,
    name: '20261024_134227_declarations_missing_runs',
  },
  {
    up: migration_20261024_160502_wfs_bbox_fetches.up,
    down: migration_20261024_160502_wfs_bbox_fetches.down,
    name: '20261024_160502_wfs_bbox_fetches'
  },
];
