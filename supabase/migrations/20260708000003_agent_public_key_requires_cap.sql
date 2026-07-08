-- Doc: manager ask (2026-07-08) — flagged by review + confirmed against
-- DigitalOcean's own Gradient AI agent docs (docs.digitalocean.com/products/
-- inference/how-to/use-agents/): their public-embeddable agent endpoints
-- document NO rate limit, spend cap, or usage quota at all. A public key
-- here is, by definition, designed to be visible to anyone (view-source on
-- the customer's site) — the origin check is a real but non-authoritative
-- speed bump (Origin is just an HTTP header, not cryptographically
-- authenticated; a script can set it to whatever it wants). The only thing
-- that actually bounds worst-case cost from a leaked/scraped/replayed public
-- key is a hard spend ceiling. Making it optional was the one real gap.
--
-- This is enforced at the DB layer (not just app validation in
-- app/api/agents/[id]/keys/route.ts) for the same reason
-- chk_public_key_has_origins is a DB CHECK and not just a Zod check: it must
-- be structurally impossible for ANY code path (including a future one) to
-- insert an unbounded public key.

ALTER TABLE inference.api_keys
  ADD CONSTRAINT chk_public_key_has_hard_cap
    CHECK (key_tier = 'private' OR hard_cap_cents IS NOT NULL);
