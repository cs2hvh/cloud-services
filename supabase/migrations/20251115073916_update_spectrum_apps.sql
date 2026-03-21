-- Local no-op for replay safety.
-- Original migration dropped and recreated spectrum_apps, which is destructive.
-- Keep version ordering without destructive behavior during shadow-db replays.
SELECT 1;
