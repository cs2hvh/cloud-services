-- Track which registrant email was sent to name.com after purchase.
-- Used for operational debugging (e.g. "which email received the ICANN verification link?")
-- and for the domain_registrant_contact_sync audit event.
alter table public.domain_purchase_requests
  add column if not exists registrant_email text null;
