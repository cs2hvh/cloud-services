# agent-runner — local dev

Verified working end-to-end on 2026-07-15: `dev-up.sh` brings up the full stack,
a real agent run was queued, claimed, executed (including the sandboxed `code`
tool, in a real OrbStack/Docker container), and settled — see "Proof it works"
below.

## What's involved

| Piece | Port | What it is |
|---|---|---|
| Redis | 6379 | BullMQ queue backing the run claimer |
| `workers/inference` | 8787 | Edge gateway — model calls, embeddings, the API-key-authed `/v1/agents/*` routes |
| Next app | 3000 | Dashboard UI + session-authed `/api/agents/*` routes |
| `agent-runner` | 8090 (health) | Polls `agentcore.runs`, claims, executes the agent loop, dispatches tools |
| Docker/OrbStack | — | Only needed if `SANDBOX_ENABLED=true` (the `code` tool) |

There is **no local Supabase** — `.env` at the repo root points at the real
project (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). Anything you create
while testing (agents, runs, sandbox sessions) is a real row there. Clean up
throwaway agents/runs when you're done (`DELETE /api/agents/[id]`).

## One-command bring-up

```bash
cd workers/agent-runner
./dev-up.sh                          # without the code-interpreter tool
SANDBOX_ENABLED=true ./dev-up.sh     # with it — needs Docker/OrbStack running
```

Idempotent — anything already listening on its port is reused, so re-running
after a crash or a code change is instant. It starts Redis, the inference
worker, and Next in the background (logs under
`$TMPDIR/ahura-dev-logs/{worker,next}.log`), then runs `agent-runner` itself
in the **foreground** via `.run-local.sh` (gitignored — pulls
`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `BYOK_DEK` from the root
`.env`). Ctrl-C stops only the runner; the rest keeps running for the next
re-run.

Health check once it's up:

```bash
curl http://localhost:8090/health
# {"ok":true,"ready":true,"last_claim_tick_ms_ago":...,"last_worker_activity_ms_ago":...}
```

## Driving a real run (no mocks)

You need a Supabase session JWT for whichever user creates the agent —
easiest to grab from the browser: log into `localhost:3000`, DevTools →
Application → Local Storage → key `sb-<project-ref>-auth-token` →
`access_token` field. (Or copy the `Authorization: Bearer` header off any
authenticated `/api/...` request in the Network tab.) Don't do a
password-grant curl with a real password pasted into a shell one-liner if
you can avoid it — the JWT from the browser is already scoped/short-lived
and doesn't require typing a password anywhere.

```bash
JWT="eyJ..."

# 1. Create a throwaway agent with the code tool enabled
curl -sS -X POST http://localhost:3000/api/agents \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{
    "name": "local-smoke-test",
    "model": "anthropic/claude-haiku-4.5",
    "system_prompt": "Use the code tool for any math.",
    "tools": [{"type": "code"}],
    "max_steps": 8,
    "max_cost_cents": 50
  }'
# → { "data": { "id": "<agent_id>", ... } }

# 2. Trigger a run (session-authed — doesn't mint a standing API key)
curl -sS -X POST http://localhost:3000/api/agents/runs \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"agent_id":"<agent_id>","input":"What is 909 * 783347833? Use the code tool."}'
# → { "id": "<run_id>", "status": "queued" }

# 3. Watch it get claimed — tail the runner's stdout (or its log if backgrounded)
#    "claimed agent run" → "agent run completed" within a few seconds

# 4. Inspect what actually happened (service-role read, bypasses RLS)
curl -sS "$SUPABASE_URL/rest/v1/run_steps?select=step_index,step_type,tool_name,detail,cost_cents&run_id=eq.<run_id>&order=step_index" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Accept-Profile: agentcore"

# 5. Clean up
curl -sS -X DELETE http://localhost:3000/api/agents/<agent_id> -H "Authorization: Bearer $JWT"
```

There's also an API-key path (`POST /v1/agents/:id/runs` on :8787, header
`Authorization: Bearer ahu_live_...`) if you already have a per-agent key —
see [nextstespsAI/15-agent-access-keys.md](../../nextstespsAI/15-agent-access-keys.md).
Minting a *new* key creates a standing credential, so don't do that just to
run a one-off smoke test — the session-authed route above is enough.

### Proof it works (2026-07-15 run)

A run asking "What is 909 * 783347833?" produced these `run_steps`:

```json
[
  { "step_type": "model", "cost_cents": 0.102 },
  { "step_type": "code", "tool_name": "code",
    "detail": { "input": "909 * 783347833", "stdout": "712063180197\n", "exit_code": 0, "cpu_seconds": 0.0001 } },
  { "step_type": "model", "cost_cents": 0.0893 }
]
```

712063180197 is the correct product — this was computed inside the real
`DockerSandboxPool` container (not the model guessing). The matching
`agentcore.sandbox_sessions` row settled cleanly (`state: "stopped"`,
`started_at`/`stopped_at` populated), and `docker ps -a` showed no leftover
container afterward. Total run: ~6s wall clock, 3 steps, $0.0019.

## Gotchas hit while doing this

- **Root `.env` isn't strictly shell-sourceable.** It has unquoted values
  with spaces/special characters (fine for `dotenv`-style loaders, not for
  `source .env` in bash — you'll get `command not found` noise on unrelated
  lines). `.run-local.sh` avoids this by `grep`+`cut`-ing specific keys
  instead of sourcing the whole file — copy that pattern rather than
  `source .env` if you're scripting against it.
- **Port 3000 busy on first run usually means Next is already up** from a
  previous session — `dev-up.sh` detects and reuses it, this is normal.
- **Sandbox orphan gap**: if `agent-runner` is killed ungracefully mid-session
  (not Ctrl-C, but e.g. `kill -9`), the idle-reaper cron
  (`/api/agents/internal/session-reaper`) will mark the DB row `stopped` once
  `idle_deadline` passes, but it cannot reach into Docker to kill the actual
  orphaned container — check `docker ps -a` after a crash if you're testing
  that path. See [nextstespsAI/13-agent-s3-sandbox-security-review.md](../../nextstespsAI/13-agent-s3-sandbox-security-review.md) §3.
