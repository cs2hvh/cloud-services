# Load Testing the Inference Gateway

The Phase 1 ship signal is **500 RPS sustained at p95 < 400ms** on the authenticated path. The k6 scenario at [workers/inference/test/load.k6.js](../../workers/inference/test/load.k6.js) validates that.

## What gets tested

Three scenarios run in overlapping windows:

| Scenario | Endpoint | Peak RPS | Duration | What it validates |
|---|---|---:|---|---|
| `health_throughput` | `GET /v1/health` | 500 | 3.5 min | Raw CF Worker isolate throughput, global anycast |
| `auth_path` | `GET /v1/key` | 8 | 2 min | sha256 lookup → KV → Postgres fallback, AuthContext build |
| `catalog` | `GET /v1/models` | 5 | 2 min | Postgres SELECT with RLS, model catalog serialization |

**Why the auth/catalog rates are so low:** the per-key rate limiter (DurableObject
in `workers/inference/src/middleware/rate-limit.ts`) defaults to **10 RPS / 60
burst per API key**. We test below that so the rate limiter doesn't 429-spam.
The `health_throughput` scenario hits unauthenticated `/v1/health` so it's not
gated and we can push the edge tier hard. If you provision a load-test key
with higher per-key caps (Phase 1.5 — needs a small schema add for
`rate_limit_rpm` on `inference.api_keys`), raise the auth/catalog rates
proportionally and re-baseline.

**Intentionally not tested**: `POST /v1/chat/completions`. At 500 RPS sustained for 4 min that's ~120k upstream calls × $0.001 = ~$120 in OpenRouter bills per test run. The chat path is validated by hand with a few requests. If you want to load-test the streaming path, set up a dummy OpenRouter target instead.

## Install k6

```powershell
winget install GrafanaLabs.k6
# or: scoop install k6
# or: choco install k6
# or download from https://github.com/grafana/k6/releases/latest and put k6.exe on PATH
# verify:
k6 version
```

macOS: `brew install k6`. Linux: see https://k6.io/docs/get-started/installation/.

## Run

```powershell
# Required — point at a real API key in your test org
$env:AHURA_API_KEY = "ahu_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Optional — override the target (defaults to production)
$env:BASE_URL = "https://api.cs2hvh.com/v1"

# Full run (all three scenarios, ~5 min total)
k6 run workers/inference/test/load.k6.js

# Just the unauthenticated throughput scenario (fastest, no API key needed)
k6 run --scenario health_throughput workers/inference/test/load.k6.js
```

## Interpret the summary

The custom `handleSummary` prints a terse panel at the end:

```
═══════════════════════════════════════════════════════════════
  AhuraCloud Inference — Load Test Summary
═══════════════════════════════════════════════════════════════

  Base URL:           https://api.cs2hvh.com/v1
  Total requests:     106,328
  Failed:             0.04%

  Latency by endpoint (p95):
    /v1/health:       42 ms
    /v1/key:          188 ms
    /v1/models:       287 ms

  Edge behavior:
    Rate-limited:     0.31%
    Spend-blocked:    0.00%

  Thresholds:         ✓ all passed

═══════════════════════════════════════════════════════════════
```

The full k6 output (timeseries, percentiles, every metric) is written to `workers/inference/test/load-result.json` for later inspection.

## What a failure looks like

| Symptom | Likely cause | Fix |
|---|---|---|
| `http_req_failed` > 1% | Rate limiter triggering / upstream timeouts | Check DO rate-limiter caps; tune burst/RPS for the test key |
| `/v1/key` p95 > 400ms | KV cold path (every request missing) | Verify the warm-cache `executionCtx.waitUntil(KV.put())` is firing — should see only the first ~5 hit Postgres, rest from KV |
| `/v1/models` p95 > 600ms | Postgres slow on inference.models SELECT | Add an index on `(is_active, org_id, sort_order)` or wire a 1-min KV cache on the catalog endpoint |
| `ahura_rate_limited` > 5% | Test key has tight burst limits | Raise `DEFAULT_BURST` in middleware/rate-limit.ts or provision a dedicated load-test key with higher limits |
| `ahura_spend_blocked` > 0% | Test key hit its hard cap | Bump `hard_cap_cents` on the test key |

## What to do before each test run

1. **Use a dedicated test key** — `name: "load-test"`, no budget cap, no model allowlist, no ZDR (so audit log doesn't bloat)
2. **Run against staging if possible** — the production CF zone is fine but it'll show up in your usage analytics and add a few cents of edge billable usage
3. **Don't run during a real customer's peak** — even at 500 RPS we eat into the org's rate-limit budgets if shared

## Useful one-liners

```powershell
# Smoke check — 30 seconds at 50 RPS, no thresholds
k6 run --duration 30s --rps 50 --scenario health_throughput workers/inference/test/load.k6.js

# Just the auth path at sustained 200 RPS for 5 min (more aggressive)
k6 run --duration 5m --rps 200 --scenario auth_path workers/inference/test/load.k6.js

# Quietly run and only show the summary
k6 run --quiet workers/inference/test/load.k6.js
```

## Phase 1 ship signal

All three scenarios pass thresholds simultaneously → Phase 1 ships. If only health passes but auth/catalog fail, the edge tier is fine but the Postgres path needs caching. If health fails, the CF Worker can't handle the rate (extremely unlikely at 500 RPS) — check for cold-isolate spin issues or DO throttling.

Once green, archive the JSON output (`workers/inference/test/load-result.json`) with a date stamp as the baseline. Subsequent ship-signal runs should not regress more than 20% on any p95.
