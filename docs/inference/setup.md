# Operator Setup Runbook

End-to-end deploy guide for Phase 0. Roughly 30 minutes assuming nothing surprises us.

## 0. Pre-flight — accounts you need

- ✅ Cloudflare account with Workers Paid plan ($5/mo — required for Queues)
- ✅ Supabase project (existing AhuraCloud project)
- 🔲 **OpenRouter account** — sign up at https://openrouter.ai, create an API key labeled "AhuraCloud Platform"
- 🔲 Domain on Cloudflare. Currently using **`cs2hvh.com`** (personal account). Migrating to `ahurasense.com` later — see [migration-ahurasense.md](./migration-ahurasense.md).

## 1. Apply the Supabase migration

1. Supabase SQL Editor → paste `supabase/migrations/20260523000001_create_inference_schema.sql`
2. Click **"Run and enable RLS"** (Studio warns about CREATE TABLE — safe to enable, our script does it explicitly too)
3. Verify in Table Editor → `inference` schema → 12 tables, each with 🔒 RLS icon
4. Verify 4 functions exist: `lookup_api_key`, `bootstrap_personal_org`, `is_org_member`, `is_org_admin`

### 1a. Expose the `inference` schema to PostgREST (REQUIRED)

By default Supabase only exposes the `public` schema to the REST API. The edge gateway calls `supabase.schema("inference").rpc(...)` — without this step, every API key lookup returns "Invalid API key" because PostgREST can't see the `inference` schema.

1. Supabase Dashboard → **Project Settings** → **API** (or **Data API → Settings** on newer projects)
2. Find **Exposed schemas** (sometimes labeled **DB Schemas**)
3. Add `inference` to the list alongside `public` and `graphql_public`
4. Save — PostgREST reloads its schema cache in ~10 seconds

If you skip this, `/v1/key` and every other authenticated endpoint will return 401 "Invalid API key" silently.

## 2. Verify the Cloudflare zone

Confirm `cs2hvh.com` is active in your Cloudflare account (status dot green on the Websites list). If not, add it: Dashboard → Add a Site → enter domain → update nameservers at registrar → wait for activation.

## 3. Generate the BYOK encryption key

This AES-GCM key encrypts customer-provided upstream API keys at rest. **Generate once, save in a password manager.** Losing it = losing the ability to decrypt all stored BYOK keys.

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

Copy the output — you'll use it as `BYOK_DEK` in step 5.

## 4. Install wrangler and authenticate

```powershell
cd c:\cloud-services\workers\inference
npm install
npx wrangler login
```

Browser opens — log in with the Cloudflare account that hosts `cs2hvh.com`. Allow all permissions on the consent screen.

Verify:

```powershell
npx wrangler whoami
```

Should show your account. If you have multiple accounts, set the account ID for the session:

```powershell
$env:CLOUDFLARE_ACCOUNT_ID = "your-account-id"
```

And add it permanently to `wrangler.toml` (top, under `name`):

```toml
account_id = "your-account-id"
```

## 5. Create resources + set secrets

Each `kv namespace create` prints an `id` — copy these and paste into `wrangler.toml` to replace the `REPLACE_WITH_*_ID` placeholders.

```powershell
npx wrangler kv namespace create API_KEYS
npx wrangler kv namespace create API_KEYS --preview
npx wrangler kv namespace create SPEND
npx wrangler kv namespace create SPEND --preview
npx wrangler kv namespace create L1_CACHE
npx wrangler kv namespace create L1_CACHE --preview
```

Queues:

```powershell
npx wrangler queues create ahura-inference-audit
npx wrangler queues create ahura-inference-usage
```

Update the `SUPABASE_URL` in `wrangler.toml` `[vars]` to your real project URL (e.g. `https://abcdefghij.supabase.co`).

Secrets (will prompt for each value):

```powershell
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# Paste from Supabase: Project Settings → API → service_role secret

npx wrangler secret put OPENROUTER_PLATFORM_KEY
# Paste from openrouter.ai/keys

npx wrangler secret put BYOK_DEK
# Paste the base64 string from step 3
```

## 6. Deploy

```powershell
cd c:\cloud-services\workers\inference
npx wrangler deploy
```

Successful output:

```
✨ Success! Uploaded ...
Published ahura-inference-edge (X.XX sec)
  api.cs2hvh.com/v1/*
```

## 7. Verify the gateway

```powershell
# Health check (unauthenticated)
curl https://api.cs2hvh.com/v1/health
# {"status":"ok","version":"0.1.0",...}
```

For an authenticated test, create a test API key directly in Supabase SQL Editor (the dashboard UI for this ships in Phase 1):

```sql
-- 1. Bootstrap personal org for your user
--    Find your auth.users.id in Supabase Auth → Users
SELECT inference.bootstrap_personal_org(
  'YOUR-AUTH-USER-UUID',
  'your-email@example.com'
);
-- Note the returned org_id

-- 2. Create a test API key (hash of the full key string)
--    The "full key" must start with 'ahu_' — e.g. 'ahu_live_test1234567890abcdef'
INSERT INTO inference.api_keys (
  org_id, created_by_user_id, name,
  key_prefix, key_last_four, key_hash
) VALUES (
  'ORG_UUID_FROM_ABOVE',
  'YOUR-AUTH-USER-UUID',
  'test-key',
  'ahu_live_test',
  'cdef',
  encode(digest('ahu_live_test1234567890abcdef', 'sha256'), 'hex')
);
```

Then:

```powershell
curl https://api.cs2hvh.com/v1/key `
  -H "Authorization: Bearer ahu_live_test1234567890abcdef"
```

Should return key + org + usage snapshot JSON.

## 8. Preview marketing pages locally

The 4 `/services/*` pages ship with the Next.js app. To see them before deploy:

```powershell
cd c:\cloud-services
npm run dev
```

- http://localhost:3000/services/inference
- http://localhost:3000/services/fine-tuning
- http://localhost:3000/services/embeddings
- http://localhost:3000/services/model-hosting

When the Next.js app ships, these go live with everything else on whatever domain hosts the marketing site.

## What's working after Phase 0 deploy

| Endpoint | Status |
|---|---|
| `GET /v1/health` | ✅ 200 OK |
| `GET /v1/key` (auth) | ✅ returns key + org + usage |
| `GET /v1/models` | ✅ returns `{object:"list", data:[]}` (catalog populates in Phase 1) |
| `POST /v1/chat/completions` | ⏳ 501 stub (Phase 1) |
| `POST /v1/embeddings` | ⏳ 501 stub (Phase 4) |
| `POST /v1/messages` | ⏳ 501 stub (Phase 1) |
| Rate-limit middleware | ✅ enforces 10 RPS / 60 burst by default |
| Spend-cap middleware | ✅ rejects with 402 when org hits `hard_cap_cents` |

## Troubleshooting

### `wrangler kv namespace create` returns "Authentication error [code: 10000]"

Either you haven't logged in (`wrangler login`), or you're logged in but don't have permission to write Workers KV on the target account. Check your member role on the account → needs `Workers KV Storage Admin` or full `Administrator`. See the auth-error troubleshooting in the chat history for the long version.

### "Failed common permission check against resources"

Your OAuth login reached the account, but your member role on it doesn't include Workers KV write. Ask the account owner to upgrade your role to `Administrator`, then `wrangler logout && wrangler login` to refresh the OAuth grant.

### `wrangler deploy` says "no such zone"

The CF zone for the domain in `wrangler.toml` routes isn't active in your account. Either it hasn't propagated yet (wait), or it's on a different account (switch with `$env:CLOUDFLARE_ACCOUNT_ID`).

### Streaming requests time out at 100s

The compatibility date and `compatibility_flags = ["nodejs_compat"]` in wrangler.toml should prevent this. If you see it, check that `compatibility_date` is `2026-05-01` or later.

### Supabase RPC returns null for `lookup_api_key`

Check that the `key_hash` you computed locally matches what the gateway computes. The gateway uses `crypto.subtle.digest("SHA-256", ...)` on the full Bearer token after stripping the `Bearer ` prefix. Different hash algorithms or trimming differences will silently fail authentication.

## Next: Phase 1

Once Phase 0 verifies green, Phase 1 wires the real OpenRouter forwarding logic into `chat-completions.ts`, ships the model catalog seed, builds the org/keys dashboard pages, and load-tests the gateway to 500 RPS sustained. See [phases.md](./phases.md).
