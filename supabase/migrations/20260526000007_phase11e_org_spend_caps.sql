-- ============================================================
-- Phase 11.E — Org-level spend caps
--
-- Per-API-key caps shipped in the initial schema (Phase 0). Enterprise
-- customers need a coarser-grained org cap too — so a single misbehaving
-- key can't blow past the org's monthly committed budget by being given
-- a high per-key limit.
--
-- Two columns added:
--   • monthly_budget_cents — INFORMATIONAL forecast budget; surfaced on
--                            the usage page but NOT enforced. Lets a
--                            finance owner say "we expect $X/month" and
--                            see overage badges without blocking traffic.
--   • hard_cap_cents       — ENFORCED ceiling. When this month's spend
--                            reaches the cap, the edge gateway returns
--                            402 with code=hard_cap_reached.
--
-- Both are nullable; null = "no cap" / "no budget set". The gateway's
-- spend.ts middleware enforces min(org_cap, key_cap) per request.
--
-- Also updates inference.lookup_api_key to return both new fields so
-- the edge KV cache carries them without a second query.
-- ============================================================

ALTER TABLE inference.orgs
  ADD COLUMN IF NOT EXISTS monthly_budget_cents BIGINT,
  ADD COLUMN IF NOT EXISTS hard_cap_cents       BIGINT;

-- Sanity check — neither value can be negative.
ALTER TABLE inference.orgs
  ADD CONSTRAINT orgs_monthly_budget_cents_nonneg
    CHECK (monthly_budget_cents IS NULL OR monthly_budget_cents >= 0),
  ADD CONSTRAINT orgs_hard_cap_cents_nonneg
    CHECK (hard_cap_cents IS NULL OR hard_cap_cents >= 0);

-- Replace the RPC so the gateway picks up the org-level fields. Backed
-- by an INNER JOIN since every api_keys row references an org.
CREATE OR REPLACE FUNCTION inference.lookup_api_key(p_hash TEXT)
RETURNS TABLE (
  key_id                   UUID,
  org_id                   UUID,
  allowed_models           TEXT[],
  allowed_ip_cidrs         CIDR[],
  zdr_enabled              BOOLEAN,
  monthly_budget_cents     BIGINT,
  hard_cap_cents           BIGINT,
  org_monthly_budget_cents BIGINT,
  org_hard_cap_cents       BIGINT,
  expires_at               TIMESTAMPTZ
)
LANGUAGE sql STABLE AS $$
  SELECT k.id, k.org_id, k.allowed_models, k.allowed_ip_cidrs, k.zdr_enabled,
         k.monthly_budget_cents, k.hard_cap_cents,
         o.monthly_budget_cents AS org_monthly_budget_cents,
         o.hard_cap_cents       AS org_hard_cap_cents,
         k.expires_at
  FROM inference.api_keys k
  JOIN inference.orgs     o ON o.id = k.org_id
  WHERE k.key_hash = p_hash
    AND k.revoked_at IS NULL
    AND (k.expires_at IS NULL OR k.expires_at > NOW());
$$;

GRANT EXECUTE ON FUNCTION inference.lookup_api_key TO service_role;

-- Audit enum extension so org.spend_cap_updated shows up cleanly in the
-- existing audit_log feed (rather than under a generic org.updated).
ALTER TYPE inference.audit_action ADD VALUE IF NOT EXISTS 'org.spend_cap_updated';
