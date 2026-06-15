-- Sync database_types versions with DigitalOcean's current supported versions.
--
-- PostgreSQL: 12/13/14 are EOL and no longer offered by DO for new clusters.
--             18 is now available. Supported: 15, 16, 17, 18.
-- MySQL:      DO now uses "8.4" (not "8" or "8.0"). Only "8.4" is accepted.
-- MongoDB:    DO requires dot-notation version strings. Supported: "7.0", "8.0".

UPDATE database_types
SET versions = '["15", "16", "17", "18"]'::jsonb
WHERE code = 'pg';

UPDATE database_types
SET versions = '["8.4"]'::jsonb
WHERE code = 'mysql';

UPDATE database_types
SET versions = '["7.0", "8.0"]'::jsonb
WHERE code = 'mongodb';
