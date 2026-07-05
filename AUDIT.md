# Security & Code Audit — `cloud-services`

**Scope:** Next.js 15 / React 19 cloud + AI services platform (Supabase backend, Proxmox/Kubernetes/DigitalOcean orchestration, Stripe billing, AI agents).
**Date:** 2026-06-10
**Method:** Static review of the codebase (auth, API routes, libs, config) + read-only inspection of the live Supabase project `xafjjpgazdxhktpfeuri` (RLS state, grants, schema). No data was exfiltrated and no changes were made.

> ⚠️ **Read this first.** Three findings below are *actively exploitable right now* and require credential rotation today, not just a code change. They are marked **CRITICAL**.

---

## Severity summary

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| C1 | 🔴 Critical | Live secrets committed to the repo, one copy inside the web-served `public/` folder | Open |
| C2 | 🔴 Critical | Supabase RLS **disabled** on `proxmox_hosts` + 7 other public tables; `anon` has full read/write | Open |
| C3 | 🔴 Critical | `ENCRYPTION_KEY` exposed → all "encrypted-at-rest" credentials are decryptable | Open |
| H1 | 🟠 High | `/api/admin/proxmox/test-connection` has **no authentication** | Open |
| H2 | 🟠 High | Proxmox host credentials (`token_secret`, `password`) stored in **plaintext** | Open |
| H3 | 🟠 High | PostgREST filter injection via unsanitized `search` param | Open |
| H4 | 🟠 High | Hardcoded service-role key in `scripts/deploy-snippet.js` (per existing report) | Open |
| M1 | 🟡 Medium | Brute-force / rate limiting is in-memory only (per-instance, bypassable) | Open |
| M2 | 🟡 Medium | Verbose error/stack traces returned to clients | Open |
| M3 | 🟡 Medium | Suspended-user (`suspend` flag) not enforced in auth helpers | Open |
| M4 | 🟡 Medium | `decryptApiKey` silently returns ciphertext on failure | Open |
| L1–L7 | 🔵 Low | Code-quality / hardening items (see below) | Open |

---

## 🔴 CRITICAL

### C1 — Live production secrets committed to the repository (one copy in `public/`)

**Files:** `public/.env`, `.envsdsd`, `.env.local`

The repo contains real, live credentials in plaintext. Worse, one copy lives at **`public/.env`** — Next.js serves the `public/` directory as static assets, and the file is also tracked in version control. Anyone who can reach the deployed site's static path, or who gets a copy of the repo, obtains every key below.

Secrets currently exposed (all must be treated as compromised):

- **Supabase `service_role` key** — full DB admin, bypasses all RLS.
- **`ENCRYPTION_KEY`** — the key used to encrypt all other stored credentials (see C3).
- **`KUBE_CONFIG_STRING`** — base64 **cluster-admin** kubeconfig with embedded client cert/key → full control of the Kubernetes cluster at `139.59.1.6`.
- **Stripe secret + webhook secret**, **OpenAI**, **OpenRouter**, **DigitalOcean token + Spaces access/secret keys**, **Cloudflare API tokens** (main + Spectrum), **Pterodactyl API key**, **Resend API key**, **Redis password** (`redis://:Pankajsoni1155@172.105.39.76`), **Jenkins admin credentials** (embedded in `JENKINS_URL`), **GitLab/Bitbucket OAuth secrets**, **Name.com token**.

`.gitignore` does ignore `.env*` patterns, but `public/.env` and the stray `.envsdsd` are present in the working tree anyway, and `.envsdsd` is not matched by the ignore rules. Whatever the git history shows, the secrets are real and reachable.

**Remediation (do today, in order):**
1. **Rotate every credential listed above.** Rotation matters more than the code fix — assume they are public.
2. Delete `public/.env`, `.envsdsd`, and any committed env file. Move config to a real secrets store (deployment env vars, Doppler, Vault, or Supabase Vault).
3. Purge them from git history (`git filter-repo` / BFG) and force-push, since history retains them.
4. Regenerate the Kubernetes cluster certificate (`kubeadm` cert rotation) — a leaked cluster-admin kubeconfig cannot simply be "rotated" like an API token.
5. Add a CI secret-scanner (gitleaks / trufflehog) as a pre-commit + pipeline gate.

---

### C2 — Supabase RLS disabled on sensitive `public` tables; `anon` role has full CRUD

Verified live on project `xafjjpgazdxhktpfeuri`. The following `public` tables have **Row Level Security turned OFF**, and the `anon` **and** `authenticated` Postgres roles hold `SELECT/INSERT/UPDATE/DELETE` grants:

| Table | RLS | Policies defined | Why it matters |
|-------|-----|------------------|----------------|
| `proxmox_hosts` | ❌ off | 4 (dormant) | Holds `token_id`, `token_secret`, `username`, `password` for hypervisors **in plaintext** |
| `public_ip_pools` | ❌ off | 4 (dormant) | IP allocation infra |
| `public_ip_pool_ips` | ❌ off | 4 (dormant) | IP allocation infra |
| `domain_purchase_requests` | ❌ off | 0 | Customer/order data |
| `domain_operations` | ❌ off | 0 | Domain order workflow |
| `proxmox_templates` | ❌ off | 0 | VM template config |
| `database_types` | ❌ off | 0 | Catalog |
| `platform_resource_mutation_locks` | ❌ off | 0 | Concurrency locks |

Because the **anon key is public** (it ships to the browser and is also in the committed `.env`), anyone on the internet can call the auto-generated PostgREST API, e.g. `GET /rest/v1/proxmox_hosts?select=*`, and read all hypervisor credentials — then `UPDATE`/`DELETE` infra rows at will. The 4 policies on `proxmox_hosts` are **dormant** because RLS is disabled; defining a policy does nothing until RLS is enabled.

This is the highest-impact finding alongside C1: it is a direct, unauthenticated path to hypervisor takeover.

**Remediation:**
1. `ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;` on all eight tables.
2. For infra/admin-only tables (`proxmox_hosts`, `proxmox_templates`, IP pools, locks), **revoke** anon/authenticated grants entirely and access them only via the service-role server code: `REVOKE ALL ON public.proxmox_hosts FROM anon, authenticated;`
3. For user-facing tables (`domain_purchase_requests`, `domain_operations`), add owner-scoped policies (`user_id = auth.uid()`).
4. Re-run the Supabase **Security Advisor** after changes and confirm zero "RLS disabled in public" errors.

---

### C3 — `ENCRYPTION_KEY` exposure defeats encryption-at-rest

The app correctly encrypts stored secrets — DB passwords, model/API keys, S3 secret keys, etc. — using a sound scheme (`config/functions.ts`: AES-256-GCM, PBKDF2 100k iterations, random IV/salt/tag). That design is good.

The problem is the key: `ENCRYPTION_KEY` is committed in C1's files. With both the database (reachable via C2 for some tables, or via the leaked service-role key) **and** the encryption key, an attacker can decrypt everything the encryption was meant to protect. The crypto is only as strong as the key's secrecy, and the key is currently public.

Separately, the key is a 40-char hex string (~160 bits) used as a static, shared PBKDF2 password. PBKDF2 stretching makes the length acceptable, but it is a single long-lived secret with no rotation path.

**Remediation:** rotate `ENCRYPTION_KEY` as part of C1; because rotating it invalidates existing ciphertext, implement a re-encryption migration (decrypt with old key → re-encrypt with new). Consider envelope encryption / a managed KMS so the master key never lives in an env file. Note that `lib/vnc-token.ts` reuses `SUPABASE_SERVICE_ROLE_KEY` as its HMAC secret — give it a dedicated `VNC_TOKEN_SECRET` instead.

---

## 🟠 HIGH

### H1 — `/api/admin/proxmox/test-connection` is unauthenticated

**File:** `app/api/admin/proxmox/test-connection/route.ts`

Every other route under `app/api/admin/**` calls `checkAdminAuth()` / `requireAdmin()`. This one does not — it reads `hostId` from the query string, fetches the host with the **service-role** `createWorkerClient()` (bypassing RLS), and connects out to the Proxmox host. The root `middleware.ts` only guards `/dashboard` paths, so `/api/admin/*` routes are *not* protected by middleware — each must self-authorize, and this one doesn't.

Impact: any unauthenticated caller can enumerate `hostId`s, trigger outbound connections from your server, and read back host metadata (name, URL, token-id, auth method). Combined with C2 they can first read the `hostId`s from `proxmox_hosts`.

**Remediation:** add `const { authorized } = await checkAdminAuth(); if (!authorized) return 403;` at the top of the handler. Then audit *every* route that imports a service-role client (51 files) to confirm an auth/authorization check precedes the privileged query — see L3.

### H2 — Proxmox credentials stored in plaintext

`proxmox_hosts.token_secret`, `.password`, `.username` are `text` columns used directly (`Authorization: PVEAPIToken=${host.token_id}=${host.token_secret}`) with no decryption step — confirming they are stored in cleartext, unlike DB/S3/model credentials which use the `Encryption` helper. Even with RLS fixed (C2), a service-role compromise or DB backup leak hands over hypervisor root.

**Remediation:** encrypt these columns with the existing `Encryption` util (as `database_integrations`, `object_storage_integrations`, and `model_keys` already do) and decrypt only in-memory at call time.

### H3 — PostgREST filter injection via `search`

**File:** `app/api/admin/users/route.ts` (and re-check similar `.or()`/`.filter()` builders elsewhere)

```ts
query = query.or(`username.ilike.%${search}%,display_name.ilike.%${search}%,id.ilike.%${search}%`);
```

`search` is interpolated unescaped into a PostgREST filter expression. A crafted value (e.g. containing `,`, `)`, or `*`) can alter the filter logic or break out of the intended predicate. It's admin-gated, so impact is limited today, but it's a real injection class and trivially avoidable.

**Remediation:** sanitize/whitelist `search` (strip PostgREST metacharacters `,()*:`), or use parameterized RPC. Apply the same fix anywhere user input reaches `.or()` / `.filter()` string builders.

### H4 — Hardcoded service-role key in `scripts/deploy-snippet.js`

Carried over from the repo's existing `SECURITY_AUDIT_REPORT.txt` (CRITICAL-1) and still relevant given C1. Move to env vars and rotate. (Note: the VNC hardcoded-secret fallback flagged as CRITICAL-2 in that older report **has been fixed** — `lib/vnc-token.ts` now throws instead of falling back.)

---

## 🟡 MEDIUM

**M1 — Rate limiting is in-memory only.** `middleware.ts` (`ipStore`) and `app/api/v1/agents/[endpointId]/chat/route.ts` (`rateLimitStore`) use per-process `Map`s. With more than one instance/replica (or serverless), the limit resets per instance and is easily bypassed — including the auth brute-force protection. You already depend on Upstash/Redis (`lib/redis.ts`, `@upstash/redis`); back the limiter with it. The code comment even notes "use Redis/Upstash for multi-instance in future."

**M2 — Verbose errors leak internals.** `test-connection` returns `err.stack`; `downloadkube` and others return raw `error.message` to the client. This discloses stack traces, DB error text, and internal paths. Return generic messages to clients; log details server-side only.

**M3 — `suspend` flag not enforced.** `user_profiles.suspend` exists and admins can set it, but `authenticateUser()` / `authenticateUserFromHeader()` / `authenticateApiRequest()` only verify the Supabase session — they never check `suspend`. A suspended user keeps full API access until their JWT expires (and can refresh). Add a suspension check to the shared auth helpers.

**M4 — `decryptApiKey` swallows failures.** `lib/supabase/queries/ai_agents.ts`: on any decrypt error it `return encryptedKey;` (the ciphertext). This can silently send a malformed/ciphertext "key" to an upstream LLM provider and masks key-corruption or wrong-key bugs. Fail loudly instead.

---

## 🔵 LOW / Code quality & hardening

- **L1 — `String.fromCharCode(...bufferData.data)`** (`downloadkube`) spreads an arbitrarily large array as function args; very large kubeconfigs can hit the argument-count limit (`RangeError`) — a minor DoS / robustness issue. Use `Buffer.from(bufferData.data).toString()`.
- **L2 — Self-signed TLS accepted** (`rejectUnauthorized: false`) in several Proxmox/VM routes and `server.ts`. It's gated on a per-host `allow_insecure_tls` flag, which is reasonable, but it enables MITM for those hosts. Prefer pinning the host CA cert.
- **L3 — Duplicated `checkAdminAuth`.** The function is copy-pasted into many route files instead of importing `lib/auth/check-admin.ts`. This is exactly how H1 happened (one file simply lacked it). Centralize and lint for it.
- **L4 — Five overlapping Supabase client factories** (`createClient`, `createSSRClient`, `createServiceClient`, `createWorkerClient`, `createServerSupabase`) with service-role clients used across 51 files. High cognitive load and easy to grab a privileged client without an auth gate. Consolidate and document which to use when.
- **L5 — Debug artifacts in production code:** `console.log` of metrics/IDs (`config/functions.ts`, admin routes), large commented-out code blocks. Strip before shipping; route logging through a leveled logger that redacts secrets.
- **L6 — `tsx` in the production start script** (`start: tsx server.ts`). Running TypeScript through `tsx` in prod adds startup overhead and a transpile dependency in the hot path; consider a compiled build for the custom server.
- **L7 — `NODE_ENV=production` with Stripe *test* keys** (`sk_test_…`/`pk_test_…`) in the committed env. Inconsistent; ensure prod uses live keys (rotated, per C1) and test keys never ship to prod.

---

## What's already done well

- Strong, centralized crypto (`config/functions.ts`): AES-256-GCM + PBKDF2 + random IV/salt, authenticated.
- Solid HTTP security headers and a real CSP in `next.config.ts` (incl. `frame-ancestors 'none'`, scoped `connect-src`, HSTS preload).
- GitHub webhook signatures validated with `crypto.timingSafeEqual` (constant-time).
- Personal access tokens stored as SHA-256 hashes, never plaintext; rate limits scoped per-user not per-token.
- Most `app/api/admin/**` routes correctly gate on admin role (H1 is the exception).
- RLS is correctly enabled with owner-scoped policies on the bulk of user data tables (`servers`, `projects`, `clusters`, `platform_apps`, the entire `agents` schema, etc.).

---

## Recommended order of action

1. **Today:** Rotate every secret in C1 (incl. K8s cluster cert) → enable RLS / revoke anon grants for C2 → delete committed env files & purge history.
2. **This week:** H1 auth fix + audit all service-role routes (L3), encrypt Proxmox creds (H2), sanitize `search` (H3), rotate & re-encrypt `ENCRYPTION_KEY` (C3).
3. **This sprint:** Redis-backed rate limiting (M1), generic client errors (M2), suspension enforcement (M3), CI secret scanning, consolidate Supabase clients (L4).

*Verification performed: RLS state, role grants, and `proxmox_hosts` schema were confirmed by direct read-only SQL against the live project. Code findings were confirmed by reading the cited source files.*
