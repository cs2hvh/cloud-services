-- Domain purchases are account-level resources.
-- Keep app_id nullable so users can purchase first and attach later.

alter table if exists public.domain_purchase_requests
  alter column app_id drop not null;
