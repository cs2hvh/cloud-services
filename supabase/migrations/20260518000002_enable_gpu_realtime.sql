-- Enable Supabase Realtime for GPU tables so the dashboard updates the moment
-- the inventory sync worker writes a new snapshot, and the moment a pod's
-- status changes. No more 30s polling lag.

ALTER TABLE public.gpu_inventory_snapshots REPLICA IDENTITY FULL;
ALTER TABLE public.gpu_pods REPLICA IDENTITY FULL;
ALTER TABLE public.gpu_pod_events REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'gpu_inventory_snapshots'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.gpu_inventory_snapshots;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'gpu_pods'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.gpu_pods;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'gpu_pod_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.gpu_pod_events;
  END IF;
END $$;
