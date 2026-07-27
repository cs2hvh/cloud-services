-- Doc: nextstespsAI/20-rag-connectors-and-data-runner.md (§7, Slice C4)
--
-- Per-connector webhook signing secret. §7 promises the sync-lifecycle webhook
-- is HMAC-signed (X-Ahura-Signature), but C2 shipped it UNSIGNED because there
-- was nowhere to store the secret — a receiver could not tell our POST from a
-- forged one. This closes that gap.
--
-- Encrypted at rest exactly like credential_enc (AES-256-GCM,
-- lib/inference/crypto.ts + BYOK_DEK, BYTEA) and masked on every read path to
-- has_webhook_secret:true — the plaintext is never returned once written, the
-- same discipline as the S3 credential and agentcore.mcp_servers' token.
--
-- Signing scheme (mirrors workers/agent-runner/src/tools/function.ts, already
-- shipped and documented): sha256(secret, "{unix_ts}.{body}") sent as
-- X-Ahura-Signature: sha256=<hex> alongside X-Ahura-Timestamp, so a captured
-- request cannot be replayed with a still-valid signature.

ALTER TABLE inference.connectors
  ADD COLUMN IF NOT EXISTS webhook_secret_enc BYTEA;

COMMENT ON COLUMN inference.connectors.webhook_secret_enc IS
  'AES-256-GCM encrypted webhook signing secret (BYOK_DEK). NULL = webhook sent unsigned. Never returned by any read path — masked to has_webhook_secret.';
