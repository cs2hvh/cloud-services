-- Support ticket system (user side)

CREATE SCHEMA IF NOT EXISTS support;

-- Ticket number sequence (shared across years for uniqueness)
CREATE SEQUENCE IF NOT EXISTS support.support_ticket_number_seq START 1;

-- Schema-level grants for custom schema access
GRANT USAGE ON SCHEMA support TO service_role;
GRANT USAGE ON SCHEMA support TO authenticated;

CREATE TABLE IF NOT EXISTS support.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT NOT NULL UNIQUE DEFAULT (
    'SUP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('support.support_ticket_number_seq'::regclass)::text, 6, '0')
  ),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'pending', 'resolved', 'closed', 'cancelled')),
  topic TEXT NOT NULL,
  sub_topic TEXT NOT NULL,
  tertiary_topic TEXT NOT NULL,
  subject TEXT NOT NULL,
  affected_resource_type TEXT,
  affected_resource_id TEXT,
  affected_resource_name TEXT,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  latest_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS support.support_ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support.support_tickets(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL DEFAULT 'user' CHECK (actor_type IN ('user', 'admin', 'system')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support.support_ticket_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support.support_tickets(id) ON DELETE CASCADE,
  message_id UUID REFERENCES support.support_ticket_messages(id) ON DELETE SET NULL,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Existing-object grants (required for sequence-backed defaults)
GRANT ALL ON ALL TABLES IN SCHEMA support TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA support TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA support TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA support TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA support TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA support TO authenticated;

-- Ensure future objects in support schema keep the same role access
ALTER DEFAULT PRIVILEGES IN SCHEMA support
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA support
  GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA support
  GRANT EXECUTE ON FUNCTIONS TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA support
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA support
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA support
  GRANT EXECUTE ON FUNCTIONS TO authenticated;

CREATE INDEX IF NOT EXISTS idx_support_tickets_owner_status ON support.support_tickets(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support.support_tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket ON support.support_ticket_messages(ticket_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_support_ticket_attachments_ticket ON support.support_ticket_attachments(ticket_id, created_at ASC);

-- Keep updated_at current on ticket updates
DROP TRIGGER IF EXISTS trigger_support_tickets_updated_at ON support.support_tickets;
CREATE TRIGGER trigger_support_tickets_updated_at
  BEFORE UPDATE ON support.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Keep ticket latest activity in sync whenever a message is added
CREATE OR REPLACE FUNCTION support.sync_support_ticket_latest_message()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE support.support_tickets
  SET latest_message_at = NEW.created_at,
      updated_at = NEW.created_at
  WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_support_ticket_latest_message ON support.support_ticket_messages;
CREATE TRIGGER trigger_support_ticket_latest_message
  AFTER INSERT ON support.support_ticket_messages
  FOR EACH ROW
  EXECUTE FUNCTION support.sync_support_ticket_latest_message();

ALTER TABLE support.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support.support_ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE support.support_ticket_attachments ENABLE ROW LEVEL SECURITY;

-- Ticket policies
DROP POLICY IF EXISTS "Users can view own support tickets" ON support.support_tickets;
CREATE POLICY "Users can view own support tickets"
  ON support.support_tickets
  FOR SELECT
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can create own support tickets" ON support.support_tickets;
CREATE POLICY "Users can create own support tickets"
  ON support.support_tickets
  FOR INSERT
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can update open support tickets" ON support.support_tickets;
CREATE POLICY "Users can update open support tickets"
  ON support.support_tickets
  FOR UPDATE
  USING (owner_id = auth.uid() AND status IN ('open', 'in_progress', 'pending'))
  WITH CHECK (owner_id = auth.uid() AND status IN ('open', 'in_progress', 'pending'));

-- Message policies
DROP POLICY IF EXISTS "Users can view messages on own tickets" ON support.support_ticket_messages;
CREATE POLICY "Users can view messages on own tickets"
  ON support.support_ticket_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM support.support_tickets t
      WHERE t.id = support_ticket_messages.ticket_id
        AND t.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can add messages on own tickets" ON support.support_ticket_messages;
CREATE POLICY "Users can add messages on own tickets"
  ON support.support_ticket_messages
  FOR INSERT
  WITH CHECK (
    actor_type = 'user'
    AND author_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM support.support_tickets t
      WHERE t.id = support_ticket_messages.ticket_id
        AND t.owner_id = auth.uid()
    )
  );

-- Attachment policies
DROP POLICY IF EXISTS "Users can view attachments on own tickets" ON support.support_ticket_attachments;
CREATE POLICY "Users can view attachments on own tickets"
  ON support.support_ticket_attachments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM support.support_tickets t
      WHERE t.id = support_ticket_attachments.ticket_id
        AND t.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can add attachments on own tickets" ON support.support_ticket_attachments;
CREATE POLICY "Users can add attachments on own tickets"
  ON support.support_ticket_attachments
  FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM support.support_tickets t
      WHERE t.id = support_ticket_attachments.ticket_id
        AND t.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete attachments on own tickets" ON support.support_ticket_attachments;
CREATE POLICY "Users can delete attachments on own tickets"
  ON support.support_ticket_attachments
  FOR DELETE
  USING (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM support.support_tickets t
      WHERE t.id = support_ticket_attachments.ticket_id
        AND t.owner_id = auth.uid()
    )
  );

-- Private storage bucket for support files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'support-ticket-files',
  'support-ticket-files',
  false,
  10485760, -- 10MB
  ARRAY[
    'image/svg+xml',
    'image/png',
    'image/jpeg',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'application/msword'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users can upload support files" ON storage.objects;
CREATE POLICY "Users can upload support files"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'support-ticket-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can read own support files" ON storage.objects;
CREATE POLICY "Users can read own support files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'support-ticket-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can delete own support files" ON storage.objects;
CREATE POLICY "Users can delete own support files"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'support-ticket-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Service role full access support files" ON storage.objects;
CREATE POLICY "Service role full access support files"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'support-ticket-files')
  WITH CHECK (bucket_id = 'support-ticket-files');



GRANT USAGE ON SCHEMA support TO service_role;
GRANT USAGE ON SCHEMA support TO authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA support TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA support TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA support TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA support TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA support TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA support TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA support
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA support
  GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA support
  GRANT EXECUTE ON FUNCTIONS TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA support
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA support
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA support
  GRANT EXECUTE ON FUNCTIONS TO authenticated;
