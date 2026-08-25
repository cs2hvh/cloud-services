-- Doc: nextstespsAI/20-rag-connectors-and-data-runner.md (§9, Slice C4)
--
-- Narrow the members' SELECT grant so it can't reach the encrypted columns.
--
-- 20260721000001 did `GRANT SELECT ON inference.connectors TO authenticated`,
-- copying agentcore.mcp_servers. That grant is table-wide, so an org member
-- could read credential_enc / webhook_secret_enc straight through PostgREST,
-- bypassing the careful has_credential / has_webhook_secret masking every API
-- path does. It's ciphertext, not plaintext — but handing an attacker the
-- ciphertext is the first half of an offline attack, and there is no reason
-- for a client to ever hold it.
--
-- Every read path in the app uses the service-role client with explicit org
-- scoping (workers/inference/src/routes/connectors.ts and
-- app/api/inference/connectors/*), so nothing depends on the columns being
-- reachable by `authenticated`. Column-level grants keep member SELECT working
-- for everything else, so RLS-based direct reads still function.
--
-- NOTE: a column-level grant REPLACES the table-level one for that role, so the
-- table-level grant is revoked first — otherwise the broad grant stays in force.

REVOKE SELECT ON inference.connectors FROM authenticated;

GRANT SELECT (
  id, org_id, collection_id, kind, display_name, config,
  webhook_url, sync_schedule, status, last_error,
  last_synced_at, next_sync_at, claimed_by, heartbeat_at,
  docs_total, docs_added, docs_updated, docs_removed, docs_failed,
  created_by, created_at, updated_at
) ON inference.connectors TO authenticated;

-- connector_documents holds no secrets — its table-level grant is fine as-is.
