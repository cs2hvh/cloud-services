-- public.servers handed `authenticated` UPDATE on every column.
--
-- The owner-scoped policy ("Users can update their own servers",
-- auth.uid()::text = owner_id::text) meant a customer could only reach THEIR OWN
-- row. Within that row, nothing was off limits: vmid, node, location, owner_id,
-- status, hourly_cost, monthly_cost, billing_service_id, plan_slug, linode_id.
--
-- The scan reported this as a plausible lead about ONE route. Reading the grants
-- rather than the route showed a second consequence that is worse:
--
--   TARGETING, which is what the lead described.
--   app/api/services/compute/vms/[id]/reset-password reads server.vmid and
--   server.node from the row and runs a guest-agent password reset against
--   them. A customer who rewrote those two fields on their own row pointed that
--   reset at another customer's VM, on any Proxmox node, and received the
--   generated credentials for it.
--
--   BILLING, which nobody had flagged.
--   compute charges from servers.hourly_cost, frozen at create, exactly as
--   documented in docs/PRODUCTION.md §6. A customer could set their own rate.
--   Setting it to zero makes the hourly sweep charge zero, correctly, forever,
--   against a rate the customer chose. monthly_cost, plan_slug and
--   billing_service_id are equally writable, so the meter identity itself could
--   be repointed.
--
-- This is the same shape as the paas payer hijack: not "who can read what", but
-- "who can write the value the billing spine trusts". Both were invisible to a
-- review that only asked about visibility.
--
-- SAFE BECAUSE NOTHING LEGITIMATE USES THESE GRANTS. Every write to this table
-- in the codebase goes through the service role, which bypasses column grants
-- entirely:
--
--   lib/services/compute/providers/linode/create.ts   injected client
--   lib/services/compute/providers/linode/flows.ts    createWorkerClient
--   lib/services/compute/custom-images.ts             createServiceClient
--   lib/billing/grace/deletion-executor.ts            createServiceClient
--   lib/api/v1-compute-helpers.ts                     injected client
--
-- The two that take an injected SupabaseClient are called from the flows above,
-- which supply the service client.
--
-- name, details and updated_at stay writable: those are the fields a customer
-- legitimately edits about their own machine. Verified in a rolled-back
-- transaction before applying, and again after: nothing in the sensitive set is
-- updatable by authenticated, and the three benign columns still are.
--
-- NOT ADDRESSED HERE: the existing rows. If any server's hourly_cost was
-- already rewritten, this migration does not detect or restore it. A comparison
-- of servers.hourly_cost against the price book at each server's create time
-- would be the way to check, and it is worth doing.

begin;

revoke update on public.servers from authenticated;
grant  update (name, details, updated_at) on public.servers to authenticated;

commit;
