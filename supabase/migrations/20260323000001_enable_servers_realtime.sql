-- Enable Supabase Realtime for servers table
-- This allows the dashboard to receive live provisioning status updates
ALTER TABLE servers REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE servers;
