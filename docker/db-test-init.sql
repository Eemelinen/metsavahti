-- Runs once when the db_test container initialises (tmpfs, so on every start).
-- The postgis image already enables PostGIS in POSTGRES_DB (metsavahti_e2e);
-- this makes it explicit and adds a second database for ad-hoc test use.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE DATABASE metsavahti_test OWNER metsavahti;
\connect metsavahti_test
CREATE EXTENSION IF NOT EXISTS postgis;
