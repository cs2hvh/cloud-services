-- Enable Supabase Realtime for servers table
-- This allows the dashboard to receive live provisioning status updates
ALTER TABLE servers REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'servers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.servers;
  END IF;
END $$;
