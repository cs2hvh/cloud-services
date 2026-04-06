-- Create notifications table
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('success', 'info', 'warning', 'error')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  service_type TEXT NOT NULL, -- 'platform_app', 'database', 'kubernetes', 'object_storage', etc.
  service_id UUID, -- Optional reference to the affected service
  action TEXT NOT NULL, -- 'created', 'updated', 'deleted', 'deployed', 'failed', etc.
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  metadata JSONB -- Additional context (e.g., app name, error details)
);
-- Indexes for performance
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);
-- Enable Row Level Security
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
-- RLS Policies
CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);
-- Service role can insert (for server-side creation)
CREATE POLICY "Service role can insert notifications" ON notifications
  FOR INSERT WITH CHECK (true);
-- Enable Realtime for notifications table
ALTER TABLE notifications REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
-- Comment for documentation
COMMENT ON TABLE notifications IS 'User notifications for service CRUD operations';
COMMENT ON COLUMN notifications.service_type IS 'Type of service: platform_app, database, kubernetes, object_storage, network_ddos, compute, game_server, firewall, spectrum';
COMMENT ON COLUMN notifications.action IS 'Action performed: created, updated, deleted, deployed, failed, scaled, restarted, migrated, resized';
