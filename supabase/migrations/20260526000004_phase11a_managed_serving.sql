-- ============================================================
-- Phase 11.A — keystone for managed FT serving
--
-- This migration only adds the columns the gateway router needs to
-- forward requests to a managed (AhuraCloud-operated) serving endpoint
-- instead of bouncing the model with "self_serve_model" 400.
--
-- It does NOT yet add:
--   • k8s deployment automation
--   • multi-tenant LoRA hot-swap router (Fireworks-style)
--   • per-tenant billing meter
--   • dashboard activation flow
--
-- Those land in Phase 11.B / 11.C / 11.D. With just THIS migration +
-- the gateway change shipping in the same commit, an operator can:
--
--   1. Stand up a Phase 10 vLLM container manually (k8s, RunPod Pod, etc.)
--   2. UPDATE inference.models
--      SET serving_url = 'https://...:8000', is_managed = TRUE
--      WHERE model_id = 'ahura/phi-4:ft-abc12345';
--   3. Customer's /v1/chat/completions calls now route to that URL.
--
-- Once 11.B-D ship, the dashboard exposes a button that does steps 1 & 2
-- and the user never sees the manual SQL.
-- ============================================================

-- ─── 1. Routing target on the catalog row ───────────────────────
--
-- serving_url: full https URL of an OpenAI-compatible inference server
--              that owns this model alias. NULL = self-serve only (the
--              current Phase 10 behavior; gateway returns 400 with the
--              "self_serve_model" redirect message).
--
-- is_managed:  cosmetic flag for the dashboard badge. Computed from
--              serving_url != NULL, but stored explicitly so the
--              dashboard can filter cheaply + so we can later add
--              "billed but offline" states without touching this
--              column's truthiness.
ALTER TABLE inference.models
  ADD COLUMN IF NOT EXISTS serving_url TEXT,
  ADD COLUMN IF NOT EXISTS is_managed  BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_models_managed
  ON inference.models(is_active)
  WHERE is_managed = TRUE;

COMMENT ON COLUMN inference.models.serving_url IS
  'Full URL of an OpenAI-compatible vLLM server that owns this model alias. ' ||
  'When set, the gateway forwards /v1/chat/completions to <serving_url>/v1/chat/completions ' ||
  'with model rewritten to the vLLM --served-model-name (currently always "adapter").';

COMMENT ON COLUMN inference.models.is_managed IS
  'Cosmetic flag for the dashboard. Truthful when this model row represents ' ||
  'an AhuraCloud-operated managed serving endpoint (vs Phase 10 self-serve).';

-- ─── 2. Mirror on finetunes for the FT detail dashboard ────────
--
-- The FT row already has output_model_id pointing at inference.models;
-- the dashboard could JOIN to read serving_url, but for the row-list
-- view we want to filter without an extra join. Mirror the flag.
ALTER TABLE inference.finetunes
  ADD COLUMN IF NOT EXISTS is_managed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS serving_url TEXT;

COMMENT ON COLUMN inference.finetunes.serving_url IS
  'Mirror of inference.models.serving_url for the corresponding output_model_id. ' ||
  'Kept in sync by the activation flow (Phase 11.B+).';
