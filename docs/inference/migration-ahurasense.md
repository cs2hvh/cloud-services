# Migration Guide — cs2hvh.com → ahurasense.com

The gateway currently runs at `api.cs2hvh.com/v1` because the operator's role on the `ahurasense.com` Cloudflare account doesn't include Workers/KV/Queues write permissions. When that gets resolved, follow this guide to switch the gateway domain.

**Estimated downtime:** ~5 minutes of API requests returning 5xx during DNS/cert propagation, OR zero downtime if you run the two-domain transition step (4b below).

## Pre-flight checklist

Before starting, confirm all of these:

- [ ] Your member role on the Ahurasense Cloudflare account includes: `Workers Admin`, `Workers KV Storage Admin`, `Workers Routes Admin`, `Queues Admin` (or just `Administrator`)
- [ ] The Ahurasense account is on Workers Paid plan ($5/mo — required for Queues)
- [ ] `ahurasense.com` zone is active in the Ahurasense account (green status)
- [ ] You have OpenRouter platform key + BYOK_DEK + Supabase service role key — same secrets, will be re-bound on the new Workers project
- [ ] Customers using `api.cs2hvh.com` have been notified of the migration window (if any)

## Decision: same Worker project or new one

Two strategies:

**Strategy A — Reuse the same Worker code, just change the route + account.** Tear down the cs2hvh deployment, redeploy to Ahurasense account on the new domain. Simpler, but causes the ~5 min DNS/cert window during the switch. Recommended for early stage (no real customers yet).

**Strategy B — Run both domains simultaneously, then deprecate cs2hvh.** Deploy a parallel Worker on Ahurasense; both `api.cs2hvh.com` and `api.ahurasense.com` route to the same backend logic for an overlap period; communicate the deprecation; remove cs2hvh route. Zero downtime; more orchestration.

This guide walks Strategy A. For B, do steps 1–6 keeping the cs2hvh deployment active, then plan a deprecation date.

## Steps

### 1. Switch Wrangler to the Ahurasense account

```powershell
# Find the Ahurasense account ID
npx wrangler whoami
# Copy the ID for "Ahurasense@gmail.com's Account"

# Set it
$env:CLOUDFLARE_ACCOUNT_ID = "800d1f863643585554014dd496baebe3"
npx wrangler whoami   # confirm it switched
```

Make permanent in `workers/inference/wrangler.toml`:

```toml
account_id = "800d1f863643585554014dd496baebe3"
```

### 2. Update the route binding

In `workers/inference/wrangler.toml`, change:

```toml
routes = [
  { pattern = "api.cs2hvh.com/v1/*", zone_name = "cs2hvh.com" },
]
```

to:

```toml
routes = [
  { pattern = "api.ahurasense.com/v1/*", zone_name = "ahurasense.com" },
]
```

(If running Strategy B, list both routes during the overlap period.)

Also update the comment at the top of the file referencing the temporary domain.

### 3. Recreate KV namespaces + Queues in the new account

Workers resources are per-account, so they don't follow the route change. Recreate them:

```powershell
cd c:\cloud-services\workers\inference

# KV namespaces
npx wrangler kv namespace create API_KEYS
npx wrangler kv namespace create API_KEYS --preview
npx wrangler kv namespace create SPEND
npx wrangler kv namespace create SPEND --preview
npx wrangler kv namespace create L1_CACHE
npx wrangler kv namespace create L1_CACHE --preview

# Queues
npx wrangler queues create ahura-inference-audit
npx wrangler queues create ahura-inference-usage
```

**Replace the IDs in `wrangler.toml`** with the new ones.

### 4. Re-set secrets in the new account

Secrets are also per-account. The values are the same, but they need to be uploaded to the new Worker.

```powershell
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put OPENROUTER_PLATFORM_KEY
npx wrangler secret put BYOK_DEK   # SAME base64 value as cs2hvh — DO NOT regenerate
```

⚠️ **Critical:** `BYOK_DEK` must be the **exact same key** as the cs2hvh deployment, because customer-stored BYOK keys in `inference.byok_keys` are encrypted with it. A different DEK = unable to decrypt = customer keys are bricked.

### 5. Deploy

```powershell
npx wrangler deploy
```

Successful output should show the new route:

```
Published ahura-inference-edge (X.XX sec)
  api.ahurasense.com/v1/*
```

### 6. Update file references back to ahurasense.com

These were swapped to cs2hvh.com when we picked up the temporary domain. Switch them back:

```
workers/inference/wrangler.toml              # comment + routes (done in step 2)
workers/inference/package.json               # description
workers/inference/README.md                  # domain references
workers/inference/src/index.ts               # public surface comment
workers/inference/src/lib/openrouter.ts      # HTTP-Referer header value
app/(marketing)/services/inference/page.tsx  # FAQ text mentioning API URL
```

Grep to confirm nothing is missed:

```powershell
# From repo root — should show only legacy/unrelated matches, no inference module
npx grep -r "cs2hvh" --include="*.ts" --include="*.tsx" --include="*.toml" --include="*.md" --include="*.json"
```

### 7. Verify

```powershell
# Health on new domain
curl https://api.ahurasense.com/v1/health
# {"status":"ok","version":"0.1.0",...}

# Authenticated test — keys are stored in Postgres, so the SAME API keys work
# (the gateway is stateless; only the domain changed)
curl https://api.ahurasense.com/v1/key `
  -H "Authorization: Bearer ahu_live_..."
```

### 8. Tear down the cs2hvh deployment (Strategy A only)

```powershell
# Temporarily switch back to your personal account
$env:CLOUDFLARE_ACCOUNT_ID = "346645ceccf6c51518e55db7dedae3a9"

# Delete the Worker
npx wrangler delete ahura-inference-edge

# Optional: delete the no-longer-needed KV namespaces from the personal account
# (keep them if you want to roll back; cost is negligible)
npx wrangler kv namespace delete --binding API_KEYS
# ... etc

# Switch back to Ahurasense
$env:CLOUDFLARE_ACCOUNT_ID = "800d1f863643585554014dd496baebe3"
```

### 9. Update the marketing pages

The inference landing page FAQ should mention the new canonical base URL again. The Phase 0 swap removed the URL entirely — re-add it now that we have stability:

```diff
- "Yes. Point the OpenAI SDK at the gateway base URL with your AhuraCloud key and it works unchanged."
+ "Yes. Point the OpenAI SDK at api.ahurasense.com/v1 with your AhuraCloud key and it works unchanged."
```

### 10. Notify customers (if any)

If `api.cs2hvh.com` saw external traffic, send a deprecation notice with the new endpoint and a migration deadline. Suggest at least 30 days of dual-route operation (Strategy B) before removing the cs2hvh route in production.

## What doesn't change

Nothing in the data plane. All of these are domain-independent:

- Supabase `inference` schema (orgs, keys, usage, audit, etc.)
- Postgres-stored API keys — still work, identified by sha256 hash regardless of domain
- BYOK ciphertext — decrypts the same as long as `BYOK_DEK` is preserved across deployments
- OpenRouter platform account + keys
- R2 buckets, BullMQ workers on k8s

## Rollback

If anything goes wrong after step 5, you can roll back in ~5 minutes:

1. Revert `wrangler.toml` routes back to `cs2hvh.com`
2. Switch wrangler account back to personal
3. `npx wrangler deploy`
4. cs2hvh route resumes serving (if you didn't delete the Worker in step 8)

Keep the cs2hvh deployment alive for at least a week after switching before deleting, so rollback is trivial.

## Common gotchas

| Symptom | Cause | Fix |
|---|---|---|
| `wrangler deploy` returns "no such zone" | Zone not yet active on Ahurasense account | Wait for activation; verify in dashboard |
| All requests return 401 "Invalid API key" | New Worker can't reach Postgres | Re-check `SUPABASE_SERVICE_ROLE_KEY` secret was set in the new account |
| BYOK requests fail to decrypt | `BYOK_DEK` differs between deployments | **Critical** — recover the original DEK from password manager and re-set |
| Audit/usage events stop appearing in Postgres | k8s queue consumers still listen on cs2hvh queue names | Update consumer config to point at new queue (queues are per-account, so same name = different queue) |
| `ahurasense.com` certificate not issuing | CF Universal SSL provisioning still in progress | Wait 10–30 min; refresh certificate status in dashboard |

## Sign-off checklist

After the migration is complete, verify all of these green:

- [ ] `curl https://api.ahurasense.com/v1/health` → 200
- [ ] `curl https://api.ahurasense.com/v1/key -H "Authorization: Bearer <real-key>"` → 200 with org+usage
- [ ] Dashboard usage charts show recent requests on the new domain
- [ ] One BYOK request succeeds (proves DEK is preserved)
- [ ] One platform-billed request succeeds (proves OpenRouter key works)
- [ ] Rate limit + spend cap behave as expected (try exceeding both)
- [ ] Audit log records the migration test events
- [ ] Status page (Better Stack) is monitoring the new domain
- [ ] DNS-level monitoring shows the new endpoint resolving from multiple regions
