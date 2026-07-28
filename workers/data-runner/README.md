# data-runner — local dev

How to run the connector-sync runner on a laptop and drive a **real** sync
end to end: crawl → extract → chunk → embed → upsert → answer. No mocks.

Doc for the feature itself: [nextstespsAI/20-rag-connectors-and-data-runner.md](../../nextstespsAI/20-rag-connectors-and-data-runner.md).
Production/k8s: [docs/PRODUCTION.md §5](../../docs/PRODUCTION.md).

## What's involved

| Piece | Port | Why it's needed |
|---|---|---|
| Redis | 6379 | BullMQ queue. **Use a LOCAL one** — see Gotchas. |
| inference gateway (`wrangler dev`) | 8787 | `/v1/embeddings` + `/v1/ocr`. The runner calls nothing else. |
| Next control plane | 3000 | Connector CRUD + `sync` + `/answer`. |
| data-runner | 8091 (health) | The thing under test. |
| a local test site | any | Only for `web_crawl`. S3 needs a bucket or a local MinIO/s3rver. |

Redis + gateway + Next are the same stack `workers/agent-runner/dev-up.sh`
brings up; if that's already running, you only need the runner.

## One-command bring-up

```bash
# From the repo root. Prompts for INFERENCE_PLATFORM_KEY if it isn't already exported.
bash workers/data-runner/run-local.sh

curl -s localhost:8091/health
# {"ok":true,"ready":true,"last_claim_tick_ms_ago":...,"last_worker_activity_ms_ago":...}
```

The script reads `.env`, defaults `INFERENCE_BASE_URL` to the local gateway,
sets `CRAWL_ALLOW_PRIVATE=true` (dev only — lets a crawl reach `127.0.0.1`),
and leaves OCR off so a local test can't run up an OCR bill.

## Driving a real sync (no mocks)

```bash
# 0. Session JWT (the dashboard routes are session-authed, not API-key)
SUPA=$(grep -m1 '^NEXT_PUBLIC_SUPABASE_URL=' .env | cut -d= -f2- | tr -d '"')
ANON=$(grep -m1 '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' .env | cut -d= -f2- | tr -d '"')
TOK=$(curl -s "$SUPA/auth/v1/token?grant_type=password" -H "apikey: $ANON" \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"..."}' | jq -r .access_token)

# 1. A KB with server-side auto-embed (connectors reject BYO-embeddings collections)
COL=$(curl -s -X POST localhost:3000/api/inference/vector/collections \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"name":"zz-local-test","embedding_model_id":"openai/text-embedding-3-small","dimensions":1536}' \
  | jq -r .data.id)

# 2. A crawl connector pointed at a local site
CONN=$(curl -s -X POST localhost:3000/api/inference/connectors \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d "{\"kind\":\"web_crawl\",\"collection_id\":\"$COL\",\"display_name\":\"local\",
       \"config\":{\"seed_url\":\"http://127.0.0.1:7788/\",\"max_pages\":10,\"max_depth\":2},
       \"sync_schedule\":\"manual\"}" | jq -r .data.id)

# 3. Sync, then watch it settle (a 3-page crawl lands in <10s)
curl -s -X POST "localhost:3000/api/inference/connectors/$CONN/sync" -H "Authorization: Bearer $TOK"
curl -s "localhost:3000/api/inference/connectors?collection_id=$COL" -H "Authorization: Bearer $TOK" \
  | jq '.data[0] | {status, last_sync, last_error}'
# → "idle", {"docs_total":3,"docs_added":3,...}

# 4. Per-document ledger — what indexed, what failed and why
curl -s "localhost:3000/api/inference/connectors/$CONN/documents" -H "Authorization: Bearer $TOK" | jq '.data'

# 5. Prove it's retrievable AND correctly cited (`model` is required)
curl -s -X POST "localhost:3000/api/inference/vector/collections/$COL/answer" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"query":"...","mode":"hybrid","model":"anthropic/claude-haiku-4.5"}' \
  | jq '{answer, citations}'
# citations[].source must be the source URL — NOT a "conn-<uuid>-<hash>-0" external_id

# 6. Clean up (purge=true also deletes the vectors it ingested)
curl -s -X DELETE "localhost:3000/api/inference/connectors/$CONN?purge=true" -H "Authorization: Bearer $TOK"
curl -s -X DELETE "localhost:3000/api/inference/vector/collections/$COL" -H "Authorization: Bearer $TOK"
```

Re-run step 3 without changing the site to prove the incremental path: the
second sync must report `docs_added: 0` (ETag skip, zero embed calls).

## Testing the deployable artifact (image + k8s security context)

`tsx src/index.ts` proves the code; it does **not** prove the image. The
container runs non-root on a read-only root filesystem with every capability
dropped, which is where Node services usually break. Reproduce that locally:

```bash
docker build -f workers/data-runner/Dockerfile -t ahura-data-runner:localtest workers/

docker run -d --name dr-test \
  --read-only --user 1000:1000 --cap-drop ALL \   # exactly the k8s securityContext
  -p 8092:8080 \
  -e REDIS_URL="redis://host.docker.internal:6379" \
  -e SUPABASE_URL="..." -e SUPABASE_SERVICE_ROLE_KEY="..." \
  -e INFERENCE_PLATFORM_KEY="..." -e INFERENCE_BASE_URL="http://host.docker.internal:8787/v1" \
  -e BYOK_DEK="..." -e HEALTH_PORT=8080 \
  ahura-data-runner:localtest

curl -s localhost:8092/health && curl -s localhost:8092/ready
docker logs dr-test | grep '"level":50\|"level":60'   # must be empty
```

Then run the sync flow above against it — `host.docker.internal:7788` as the
seed URL, and `CRAWL_ALLOW_PRIVATE=true` on the container so it may reach it.

Validate the manifests without touching any cluster:

```bash
envsubst < workers/data-runner/k8s/secret.yaml.template | \
  kubectl apply -f - --dry-run=client --validate=false
kubectl apply -f workers/data-runner/k8s/deployment.yaml --dry-run=client --validate=false
```

## Testing the vector-quota cap

The cap is 1,000,000 vectors per org, so the only practical way to see it fire
is to lower it. Temporarily set `MAX_VECTORS_PER_ORG` in `src/lifecycle.ts` to
just above the org's current usage:

```bash
curl -s localhost:3000/api/inference/vector/collections -H "Authorization: Bearer $TOK" \
  | jq '[.data[].row_count] | add'      # current usage; set the cap to this + 3
```

Expected: the sync stops the moment the budget is spent — connector goes to
`status: error` with *"Vector storage limit reached…"*, rows embedded before
the cap are **kept**, and the document that would have exceeded it is never
embedded (no spend). Revert the constant afterwards.

Note the connector row's `last_sync` counters stay at the last **successful**
sync's numbers on failure — read the `/documents` ledger for what a failed run
actually managed.

## Proof it works (2026-07-28 run)

Against the real gateway, Postgres and embedding pipeline:

- crawl sync: **3 docs, 3 added**, ~8s, 0 error lines
- unchanged re-sync: **0 added** (ETag skip, no embeds)
- citations resolved to `http://127.0.0.1:7788/refunds`, not the `conn-…` id
- quota cap set to `usage+3`: exactly 3 rows written, 4th document never
  embedded, `status: error`, earlier rows kept; restoring the cap and
  re-syncing added exactly the 1 document that had been blocked
- container under `--read-only` + uid 1000 + `--cap-drop ALL`: booted, both
  probes 200, and completed a full 3-document sync with 0 error lines

## Gotchas

- **Don't `source` the repo `.env`.** It isn't valid shell — line 1 is a stray
  PowerShell `Disable-BitLocker …` and at least one assignment is indented, so
  `set -a; source .env` aborts under `set -e` with "command not found".
  `run-local.sh` parses it line-by-line instead. (`eval-runner/run-local.sh`
  still `source`s it and fails for this reason.)
- **`.env`'s `REDIS_URL` is the SHARED Redis, not localhost.** A laptop runner
  on that queue joins the same BullMQ queue as the deployed runner and — the
  claim being atomic — can win real connector syncs and sync a customer's
  bucket from a dev machine. `run-local.sh` prefers a local Redis when one is
  listening and warns loudly otherwise.
- **`pkill -f "data-runner/src/index.ts"` does not match.** The script `cd`s
  into the package first, so the command line is the relative `src/index.ts`.
  A stale runner survives, the new one dies on `EADDRINUSE :8091`, and the
  *old* binary keeps processing jobs — which silently invalidates any test of
  a code change. Kill by PID and confirm `0` processes before re-testing.
- **`CRAWL_ALLOW_PRIVATE` / `S3_ENDPOINT_ALLOW_PRIVATE` are dev-only.** They
  disable the SSRF private-IP guard. They are deliberately absent from
  `k8s/secret.yaml.template`; never add them there.
- **Check `kubectl config current-context` before any apply.** The default
  context here is a live remote cluster, not a local one.
- **`:latest` is only tagged on `dev`/`master`.** A feature-branch push
  publishes `:<branch>` and `:sha-<short>`; the manifest pins `:latest`, so
  deploying from a feature branch needs an explicit image override. There is
  also no auto-rollout — `kubectl -n ahura rollout restart deploy/ahura-data-runner`.
