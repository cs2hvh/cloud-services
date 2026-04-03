-- Expand support ticket statuses and accepted attachment MIME types.

-- Update status CHECK constraint to support six lifecycle states.
DO $$
DECLARE
  status_constraint_name text;
BEGIN
  SELECT con.conname
  INTO status_constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'support'
    AND rel.relname = 'support_tickets'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%status%'
  LIMIT 1;

  IF status_constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE support.support_tickets DROP CONSTRAINT %I',
      status_constraint_name
    );
  END IF;
END $$;

ALTER TABLE support.support_tickets
  ADD CONSTRAINT support_tickets_status_check
  CHECK (status IN ('open', 'in_progress', 'pending', 'resolved', 'closed', 'cancelled'));

-- Update user-update policy to allow edits while ticket is still open/active.
DROP POLICY IF EXISTS "Users can update open support tickets" ON support.support_tickets;
CREATE POLICY "Users can update open support tickets"
  ON support.support_tickets
  FOR UPDATE
  USING (owner_id = auth.uid() AND status IN ('open', 'in_progress', 'pending'))
  WITH CHECK (owner_id = auth.uid() AND status IN ('open', 'in_progress', 'pending'));

-- Extend storage MIME allow-list.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
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
WHERE id = 'support-ticket-files';

