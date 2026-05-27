-- ============================================================
-- Phase 7 — public status page RPCs + guardrail audit enum
--
-- 1. inference.status_usage_24h()       — hourly success/failure counts
--    over the last 24 hours, used by the /status sparkline. Returns
--    one row per hour bucket that had traffic; the page fills gaps.
--
-- 2. inference.status_finetunes_7d()    — count of FT jobs by status
--    in the last 7 days, for the Fine-Tuning component health line.
--
-- 3. inference.status_deployments_7d()  — count of BYO deployments by
--    status in the last 7 days, for the Model Hosting component line.
--
-- 4. Adds `guardrail.blocked` to inference.audit_action so future
--    audit rows can record gateway-side prompt-injection blocks.
--    (The worker's v1 just structured-logs to console; persisting to
--    audit_log can layer on later without another enum change.)
--
-- All three RPCs are SECURITY DEFINER so the anonymous /status page
-- (no auth) can read them without granting blanket SELECT on the
-- underlying tables. They only return aggregated counts — no per-org,
-- per-user, or per-request leakage.
-- ============================================================

-- ─── 1. Last-24h usage hourly buckets ───────────────────────────
CREATE OR REPLACE FUNCTION inference.status_usage_24h()
RETURNS TABLE (
  hour_bucket TIMESTAMPTZ,
  total       BIGINT,
  success     BIGINT,
  failure     BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = inference, public
AS $$
  SELECT
    date_trunc('hour', created_at) AS hour_bucket,
    COUNT(*)                       AS total,
    COUNT(*) FILTER (WHERE status = 'success') AS success,
    COUNT(*) FILTER (WHERE status <> 'success') AS failure
  FROM inference.usage
  WHERE created_at >= NOW() - INTERVAL '24 hours'
  GROUP BY 1
  ORDER BY 1;
$$;

-- ─── 2. Last-7d fine-tune outcomes ──────────────────────────────
CREATE OR REPLACE FUNCTION inference.status_finetunes_7d()
RETURNS TABLE (
  status TEXT,
  cnt    BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = inference, public
AS $$
  SELECT status::TEXT, COUNT(*) AS cnt
  FROM inference.finetunes
  WHERE created_at >= NOW() - INTERVAL '7 days'
  GROUP BY status;
$$;

-- ─── 3. Last-7d BYO deployment outcomes ─────────────────────────
CREATE OR REPLACE FUNCTION inference.status_deployments_7d()
RETURNS TABLE (
  status TEXT,
  cnt    BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = inference, public
AS $$
  SELECT status::TEXT, COUNT(*) AS cnt
  FROM inference.deployments
  WHERE created_at >= NOW() - INTERVAL '7 days'
  GROUP BY status;
$$;

-- Grant execute to anon + authenticated. The status page is called
-- both via service-role (server component) and could later be called
-- via the PostgREST anon role from a static client.
GRANT EXECUTE ON FUNCTION inference.status_usage_24h       TO service_role, anon, authenticated;
GRANT EXECUTE ON FUNCTION inference.status_finetunes_7d    TO service_role, anon, authenticated;
GRANT EXECUTE ON FUNCTION inference.status_deployments_7d  TO service_role, anon, authenticated;

-- ─── 4. Guardrail audit enum value ──────────────────────────────
ALTER TYPE inference.audit_action ADD VALUE IF NOT EXISTS 'guardrail.blocked';
