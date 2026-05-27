-- ============================================================
-- Phase 6 — Encrypted HF token storage for BYO Deploy (HF source)
--
-- BYO Deploy already accepts `source IN ('docker', 'huggingface',
-- 'truss')` in the API but the deploy-runner only implemented the
-- docker path. HF and Truss were rejected at runtime with a
-- "needs a build step" message.
--
-- This migration adds the one piece HF deploys need: a slot for
-- the customer's Hugging Face token (encrypted at rest with the
-- same AES-256-GCM construction we already use for BYOK provider
-- keys). The deploy-runner reads + decrypts at create-endpoint
-- time and passes the plaintext as an env var to the RunPod
-- worker (which uses it to download gated model weights from HF).
--
-- The token is mandatory for gated models (most Meta + Google
-- bases) and optional for fully-public models. We don't enforce
-- mandatory at the schema layer because we can't tell which is
-- which from the source_ref alone — the runner surfaces the
-- 403 → friendly remediation if the token is missing or wrong.
-- ============================================================

ALTER TABLE inference.deployments
  ADD COLUMN IF NOT EXISTS hf_token_encrypted TEXT;

-- Track which DEK version encrypted this row so a future BYOK_DEK
-- rotation can identify rows that need re-encryption. Default 1
-- matches the initial DEK we shipped in Phase 1 for byok_keys —
-- both columns will rotate together when we eventually do.
ALTER TABLE inference.deployments
  ADD COLUMN IF NOT EXISTS hf_token_kms_version INTEGER NOT NULL DEFAULT 1;
