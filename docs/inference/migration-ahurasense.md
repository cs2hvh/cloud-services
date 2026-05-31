# Domain Migration — cs2hvh.com → ahurasense.com

Platform-wide runbook for moving every customer-facing and internal use of the
**temporary** `cs2hvh.com` domain over to the real `ahurasense.com` domain.

The platform runs on `cs2hvh.com` today only because the operator's role on the
`ahurasense.com` Cloudflare account didn't include Workers/KV/Queues write
permissions when the gateway shipped. This guide covers the full switch once
that's resolved — not just the inference gateway, but the dashboard host, the
worker cron, the k8s runner webhooks, the support email, and the hardcoded
copy/curl snippets on the marketing site.

> **Scope note:** despite living under `docs/inference/`, this is the
> whole-platform domain runbook (it's linked from `wrangler.toml`,
> `lib/inference/branding.ts`, and `next.config.ts`, so the path is kept stable).

---

## TL;DR — the hosts

There are **two** production hosts. The Next.js app serves marketing
(`app/(marketing)/*`) **and** the dashboard / control-plane (`app/dashboard/*`)
from one origin — so it's just the **apex `ahurasense.com`** (no subdomain). Only
the inference gateway is a separate host. (`wao.cs2hvh.com` was only a test host.)

| Today | Role | Target | Driven by |
|---|---|---|---|
| `api.cs2hvh.com/v1` | Inference API gateway (CF Worker) | `api.ahurasense.com/v1` | wrangler route + `NEXT_PUBLIC_INFERENCE_API_*` |
| `wao.cs2hvh.com` (test) + `cs2hvh.com` | Next.js app — marketing **and** dashboard/control-plane (one app), plus referer + support email | **`ahurasense.com`** (apex) | DNS + `NEXT_PUBLIC_DASHBOARD_URL` + worker/runner `CONTROL_PLANE_URL` + `HTTP-Referer` + `NEXT_PUBLIC_SUPPORT_EMAIL` |

**The migration is NOT "just env vars."** It's three things:
1. **Env vars + rebuild** — most customer-visible URLs read `NEXT_PUBLIC_*` with a
   cs2hvh fallback, so they flip cleanly (but require a *rebuild*, not a restart —
   `NEXT_PUBLIC_*` is inlined at build time).
2. **Six hardcoded source edits** — three customer-facing snippets and three
   upstream `HTTP-Referer` headers that do **not** read env (see inventory).
3. **Infra config** — Cloudflare zone/route, KV/Queues/secrets re-bind, worker
   `CONTROL_PLANE_URL`, and the k8s runner deployments' `CONTROL_PLANE_URL`.

---

## No subdomain — the app is the apex

The Next.js app (marketing + dashboard / control-plane) is a single deployment
served from the **apex `ahurasense.com`** — there is no separate dashboard
subdomain. The old `wao.cs2hvh.com` was only a test host. The gateway
(`api.ahurasense.com/v1`) is the one separate host, and it's already locked.

---

## Complete reference inventory

Every place the old domain appears, grouped by how it migrates. Verify with:

```powershell
# Should be empty (outside docs/ + ghcr image refs) once migration is done:
rg -n "cs2hvh\.com" --glob "!**/node_modules/**" --glob "!**/.next/**" --glob "!docs/**"
```

### A. Env-driven — flip the env var, rebuild, done

These honor a `NEXT_PUBLIC_*` env var and only fall back to cs2hvh if it's unset.
No code edit strictly required, **but** see the note under step C3 about also
updating the fallback defaults so an unset env can't silently revert the brand.

| File | Reads | Purpose |
|---|---|---|
| `lib/inference/branding.ts` | `NEXT_PUBLIC_INFERENCE_API_BASE`, `…_API_ORIGIN`, `…_DASHBOARD_URL`, `…_SUPPORT_EMAIL` | Single source of truth for customer-visible URLs/email |
| `lib/inference/notifications.ts:24` | `NEXT_PUBLIC_DASHBOARD_URL` | Email + webhook deep-links into the dashboard |
| `next.config.ts:12` | `NEXT_PUBLIC_INFERENCE_API_ORIGIN` | **CSP `connect-src`** — playground's browser fetch to the gateway is blocked if this is wrong |
| `app/(marketing)/status/page.tsx:48` | `NEXT_PUBLIC_INFERENCE_API_BASE` | Status page probe |
| `app/dashboard/services/inference/diagnostics/page.tsx:24` | `NEXT_PUBLIC_INFERENCE_API_BASE` | Diagnostics health checks |
| `app/dashboard/services/inference/playground/page.tsx:113` | `NEXT_PUBLIC_INFERENCE_API_BASE` | Playground request target |

### B. Hardcoded — MUST be edited in source (env won't move these)

| File:line | Current literal | Change to | Customer-facing? |
|---|---|---|---|
| `components/services/fine-tuning-serving-section.tsx:26` | `curl https://api.cs2hvh.com/v1/chat/completions` | `…api.ahurasense.com/v1…` | ✅ yes (marketing curl) |
| `components/services/inference-features-section.tsx:30` | `base_url="https://api.cs2hvh.com/v1"` | `…api.ahurasense.com/v1` | ✅ yes (marketing code sample) |
| `components/model-training-pipeline-section.tsx:683` | `api.cs2hvh.com/v1` (display span) | `api.ahurasense.com/v1` | ✅ yes (marketing) |
| `workers/inference/src/lib/openrouter.ts:37` | `"HTTP-Referer": "https://cs2hvh.com"` | `https://ahurasense.com` | ❌ upstream attribution only |
| `lib/inference/embeddings.ts:44` | `"HTTP-Referer": "https://cs2hvh.com"` | `https://ahurasense.com` | ❌ upstream attribution only |
| `app/api/inference/batches/[id]/process/route.ts:240` | `"HTTP-Referer": "https://cs2hvh.com"` | `https://ahurasense.com` | ❌ upstream attribution only |

> The three `HTTP-Referer` headers are sent to the upstream provider for
> attribution — not visible to customers — but should move for consistency.
> The three marketing snippets **are** customer-visible and are the highest
> priority in this group.

### C. Infra / config

| Where | Field | Current | Target |
|---|---|---|---|
| `workers/inference/wrangler.toml:20` | route `pattern` + `zone_name` | `api.cs2hvh.com/v1/*` / `cs2hvh.com` | `api.ahurasense.com/v1/*` / `ahurasense.com` |
| `workers/inference/wrangler.toml:117` | `CONTROL_PLANE_URL` var | `https://wao.cs2hvh.com` | `https://ahurasense.com` |
| `workers/ft-runner/k8s/secret.yaml.template` + live k8s secret | `CONTROL_PLANE_URL` | `https://…cs2hvh.com` | `https://ahurasense.com` |
| deploy-runner k8s deployment | `CONTROL_PLANE_URL` (if set) | cs2hvh | `https://ahurasense.com` |
| Root `.env` (app runtime) | the `NEXT_PUBLIC_*` vars in §A | unset → cs2hvh fallback | ahurasense values |

`CONTROL_PLANE_URL` matters because the worker's `scheduled()` cron and the
runners POST lifecycle/billing callbacks to the dashboard:
- `workers/inference/src/index.ts` → `/api/inference/internal/serving-pod-watchdog` + `/api/inference/internal/deployment-meter` (every minute)
- `workers/inference/src/consumers/usage.ts:341` → `/api/inference/internal/spend-alert`
- ft-runner / deploy-runner → FT + deployment completion webhooks

If `CONTROL_PLANE_URL` still points at the dead cs2hvh dashboard after the app
moves, **idle pods stop auto-reaping, deployments stop metering, and spend
alerts go dark** — silent failures, no error surfaced. This is the most
commonly-missed step.

### NOT in scope — do not conflate

- **`ghcr.io/cs2hvh/*` images** (`branding.ts` `SERVING_IMAGE_URI`,
  `finetune-runpod.ts`, `serving-pod.ts`, both runner k8s deployments,
  `ft-runner` env). `cs2hvh` here is a **GitHub org/registry namespace**, not the
  DNS domain — moving DNS does not require renaming images. Renaming the GHCR org
  is a separate brand task (CI workflows + k8s specs + `gpu_templates` DB rows +
  `SERVING_IMAGE_URI`) and should be done deliberately, not as part of this.
- **R2 buckets stay on the existing (cs2hvh) Cloudflare R2 account** — datasets +
  adapters are kept as-is; no R2 migration. The endpoint is an account-ID host,
  not the cs2hvh.com domain.
- **`samatva.blr1.cdn.digitaloceanspaces.com`** in `next.config.ts` CSP/images —
  the asset CDN bucket; separate brand-asset migration.

---

## Prerequisites

- [ ] **DECISION 1** made (dashboard subdomain).
- [ ] Your role on the Ahurasense Cloudflare account includes `Workers Admin`,
      `Workers KV Storage Admin`, `Workers Routes Admin`, `Queues Admin` (or
      `Administrator`). *This was the original blocker.*
- [ ] Ahurasense account on **Workers Paid** ($5/mo — required for Queues).
- [ ] `ahurasense.com` zone active (green) in the Ahurasense account.
- [ ] You hold the **exact** `BYOK_DEK`, `OPENROUTER_PLATFORM_KEY`, and
      `SUPABASE_SERVICE_ROLE_KEY` values (re-bound on the new Worker).
- [ ] `support@ahurasense.com` mailbox/MX exists **before** flipping the support
      email, or support mail silently breaks.
- [ ] `BATCH_PROCESSOR_TOKEN` value on hand (must match between the worker and the
      Next.js app, or the cron 401s).

## Strategy: A (cutover) vs B (dual-run)

- **Strategy A — cutover.** Tear down the cs2hvh gateway, redeploy on ahurasense.
  ~5 min of 5xx during DNS/cert propagation. Fine pre-launch (no real customers).
- **Strategy B — dual-run.** Route both `api.cs2hvh.com` and `api.ahurasense.com`
  to the same Worker for an overlap window, announce deprecation, then drop the
  cs2hvh route. Zero downtime; more orchestration. During overlap, keep **both**
  origins in the CSP `connect-src` (set `NEXT_PUBLIC_INFERENCE_API_ORIGIN` to the
  new one but temporarily add the old to `next.config.ts`).

Steps below are Strategy A; for B, keep the cs2hvh route live through step 2 and
set a deprecation date before step 7.

---

## Migration steps

### Phase A — Cloudflare gateway (`api.`)

**1. Point Wrangler at the Ahurasense account**

```powershell
npx wrangler whoami                       # copy the Ahurasense account ID
$env:CLOUDFLARE_ACCOUNT_ID = "<ahurasense-account-id>"
npx wrangler whoami                       # confirm it switched
```

Make it permanent in `workers/inference/wrangler.toml`: add `account_id = "<id>"`.

**2. Update the route + header comment**

`workers/inference/wrangler.toml`:

```toml
routes = [
  { pattern = "api.ahurasense.com/v1/*", zone_name = "ahurasense.com" },
]
```

Also fix the temporary-domain comment at the top of the file. (Strategy B: list
both routes during overlap.)

**3. Recreate KV namespaces + Queues (per-account, don't follow the route)**

```powershell
cd c:\cloud-services\workers\inference
npx wrangler kv namespace create API_KEYS;  npx wrangler kv namespace create API_KEYS --preview
npx wrangler kv namespace create SPEND;     npx wrangler kv namespace create SPEND --preview
npx wrangler kv namespace create L1_CACHE;  npx wrangler kv namespace create L1_CACHE --preview
npx wrangler queues create ahura-inference-audit
npx wrangler queues create ahura-inference-usage
```

Replace the six KV IDs in `wrangler.toml` with the new ones.

**4. Re-set secrets in the new account**

```powershell
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put OPENROUTER_PLATFORM_KEY
npx wrangler secret put BYOK_DEK            # SAME base64 value — never regenerate
npx wrangler secret put BATCH_PROCESSOR_TOKEN
npx wrangler secret put OTEL_EXPORTER_OTLP_HEADERS   # if used
```

> ⚠️ **`BYOK_DEK` must be byte-identical to the cs2hvh deployment.** Customer BYOK
> keys in `inference.byok_keys` are AES-GCM encrypted with it; a different DEK
> bricks every stored key.

**5. Set `CONTROL_PLANE_URL` and deploy**

Update `wrangler.toml:117` → `CONTROL_PLANE_URL = "https://ahurasense.com"`,
then:

```powershell
npx wrangler deploy
# → Published ahura-inference-edge … api.ahurasense.com/v1/*
```

### Phase B — Next.js app (apex `ahurasense.com` + env)

**6. DNS for the app**

Point the apex `ahurasense.com` (and `www.ahurasense.com`) at the Next.js app's
origin — the same target the test host `wao.cs2hvh.com` resolves to today —
proxied through Cloudflare for TLS.

**7. Set the app env vars** (root `.env` / deployment env), then **rebuild**:

```dotenv
NEXT_PUBLIC_INFERENCE_API_BASE=https://api.ahurasense.com/v1
NEXT_PUBLIC_INFERENCE_API_ORIGIN=https://api.ahurasense.com
NEXT_PUBLIC_DASHBOARD_URL=https://ahurasense.com
NEXT_PUBLIC_SUPPORT_EMAIL=support@ahurasense.com
```

> `NEXT_PUBLIC_*` is inlined at **build time** → a plain restart won't pick these
> up. Rebuild the standalone image. The CSP `connect-src` in `next.config.ts` is
> computed from `NEXT_PUBLIC_INFERENCE_API_ORIGIN`, so the playground's browser
> fetch only reaches the new gateway after the rebuild — verify in DevTools.

**8. (Recommended) Update the fallback defaults** so an unset env can't silently
revert to cs2hvh. In `lib/inference/branding.ts`, `lib/inference/notifications.ts:24`,
`next.config.ts:13`, and the three inference pages in §A, change the `?? "…cs2hvh.com…"`
defaults to the ahurasense equivalents.

### Phase C — Hardcoded source edits (§B inventory)

**9. Customer-facing marketing snippets** (highest priority):
- `components/services/fine-tuning-serving-section.tsx:26`
- `components/services/inference-features-section.tsx:30`
- `components/model-training-pipeline-section.tsx:683`

**10. Upstream `HTTP-Referer` headers** (`cs2hvh.com` → `ahurasense.com`):
- `workers/inference/src/lib/openrouter.ts:37`
- `lib/inference/embeddings.ts:44`
- `app/api/inference/batches/[id]/process/route.ts:240`

### Phase D — k8s runners

**11.** Update `CONTROL_PLANE_URL` in the **live** ft-runner and deploy-runner
k8s secrets/configmaps (and `workers/ft-runner/k8s/secret.yaml.template` +
`.env.example` for the repo of record) to `https://ahurasense.com`, then
roll the deployments:

```powershell
kubectl set env deploy/ahura-ft-runner   -n ahura CONTROL_PLANE_URL=https://ahurasense.com
kubectl set env deploy/ahura-deploy-runner -n ahura CONTROL_PLANE_URL=https://ahurasense.com
kubectl rollout restart deploy/ahura-ft-runner deploy/ahura-deploy-runner -n ahura
```

### Phase E — support email

**12.** Once `support@ahurasense.com` is live, the `NEXT_PUBLIC_SUPPORT_EMAIL`
from step 7 covers the dashboard. Also update any email-template "from"/"reply-to"
and DNS SPF/DKIM/DMARC for the new sending domain.

---

## What does NOT change (data plane)

Domain-independent — leave untouched:
- Supabase `inference` schema (orgs, keys, usage, audit, byok_keys, …)
- Postgres-stored API keys — matched by `sha256(key)`, not by domain; the **same
  `ahu_live_…` keys keep working**, the gateway is stateless
- BYOK ciphertext — decrypts fine as long as `BYOK_DEK` is preserved
- OpenRouter account + platform key, BullMQ/Redis, RunPod
- **R2 storage** — datasets + adapters stay in the **existing (cs2hvh) Cloudflare
  R2** buckets; deliberately not migrated. The endpoint is an account-ID host
  (`<id>.r2.cloudflarestorage.com`), not the cs2hvh.com domain, so there is nothing
  to move
- `ghcr.io/cs2hvh/*` image names (see "NOT in scope")

---

## Verification / sign-off

```powershell
curl https://api.ahurasense.com/v1/health                       # 200 {"status":"ok",...}
curl https://api.ahurasense.com/v1/key -H "Authorization: Bearer ahu_live_..."  # 200 org+usage
```

- [ ] `/v1/health` 200 on the new domain
- [ ] An existing API key authenticates (proves stateless cutover)
- [ ] **One BYOK request succeeds** (proves `BYOK_DEK` preserved)
- [ ] One platform-billed request succeeds (proves OpenRouter key bound)
- [ ] Playground works from the browser at `ahurasense.com` (proves CSP origin)
- [ ] Dashboard usage charts show recent requests
- [ ] Rate limit + spend cap still enforce
- [ ] A serving pod past its idle deadline auto-stops (proves worker→control-plane
      `CONTROL_PLANE_URL` + `BATCH_PROCESSOR_TOKEN`)
- [ ] A deployment meters (proves `deployment-meter` cron path)
- [ ] An FT completion webhook lands (proves runner `CONTROL_PLANE_URL`)
- [ ] `rg "cs2hvh\.com"` is clean outside `docs/` and ghcr image refs
- [ ] Status/uptime monitor points at the new gateway

---

## Rollback (~5 min)

1. Revert `wrangler.toml` route → `cs2hvh.com`; `npx wrangler deploy` on the old account.
2. Revert the app env vars (or the step-8 defaults) → rebuild.
3. Revert `CONTROL_PLANE_URL` on the runners + worker; roll the runners back.

Keep the cs2hvh gateway deployed (don't delete the Worker) for **at least a week**
after cutover so rollback stays trivial.

### Tear down cs2hvh (Strategy A, only after the soak period)

```powershell
$env:CLOUDFLARE_ACCOUNT_ID = "<personal-account-id>"
npx wrangler delete ahura-inference-edge
$env:CLOUDFLARE_ACCOUNT_ID = "<ahurasense-account-id>"
```

---

## Common gotchas

| Symptom | Cause | Fix |
|---|---|---|
| `wrangler deploy` → "no such zone" | Zone not active on Ahurasense account | Wait for activation |
| All requests 401 "Invalid API key" | New Worker can't reach Postgres | Re-set `SUPABASE_SERVICE_ROLE_KEY` in the new account |
| BYOK requests fail to decrypt | `BYOK_DEK` differs | **Critical** — restore the original DEK and re-set |
| Playground "blocked by CSP / connect-src" | `NEXT_PUBLIC_INFERENCE_API_ORIGIN` stale or not rebuilt | Set it + rebuild (it's build-time inlined) |
| Idle pods never auto-stop / deployments stop billing / no spend alerts | Worker `CONTROL_PLANE_URL` still cs2hvh, or `BATCH_PROCESSOR_TOKEN` mismatch | Update the var + redeploy; confirm token matches Next.js |
| FT/deployment webhooks never arrive | Runner `CONTROL_PLANE_URL` still cs2hvh | `kubectl set env` + rollout restart |
| Customer copies a curl that 404s | Hardcoded marketing snippet not edited (§B) | Edit the three components in Phase C |
| Audit/usage events stop in Postgres | Queue consumers on old per-account queues | Queues are per-account; recreate + redeploy consumer |
| `ahurasense.com` cert not issuing | Universal SSL still provisioning | Wait 10–30 min |
| `wrangler queues create` → "The specified queue settings are invalid" (400, code 100128) | wrangler 3.114 sends a default `message_retention_period` of 345600s (4 days); the account caps it at 86400s (1 day) | Pass `--message-retention-period-secs 86400` (audit/usage drain in seconds, so 1 day is ample) |
