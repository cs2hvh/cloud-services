# Authentication and authorization: how it works, what was found, what was fixed

**Written 2026-09-06 against `dev` at `4fe6632b` (deployed; prod serves build `QVO9L3wH1plwJEFa9kKcC`).**
Companion: [`createssrclient-audit.md`](createssrclient-audit.md). The scan findings file (`Scan-FINDINGS-2026-09-05.md`) is gitignored on purpose and stays out of history.

This document is the single place that says how a request proves who it is, how the platform decides what it may do, which of those decisions were wrong on 2026-09-05, and what changed. Every claim below points at a file or a commit; where something is still open it says so.

---

## 1. Identity sources

Seven kinds of credential reach the platform. They are deliberately not interchangeable: a session does not imply a PAT, an agent key does not imply a session, and an internal service token implies no customer at all.

| Credential | Issued by | Carried as | Validated by | Used on |
| --- | --- | --- | --- | --- |
| **Cookie session** | Supabase Auth, after email + password (`/api/auth/signin/email`) or GitHub via Supabase OAuth (`/api/auth/signin/github` → `/api/auth/callback`) | `sb-*` cookies (7-day refresh) | `supabase.auth.getUser()` through `createClient()` (anon key + cookies) | Dashboard pages, ~230 API routes |
| **Bearer access token** | Same Supabase session, sent explicitly | `Authorization: Bearer <jwt>` | `authenticateUserFromHeader()` → `getUser(token)` | 9 agent / knowledge-base routes |
| **Personal access token** | `/api/auth/api-keys` | `Authorization: Bearer sk_live_…` (hash stored in `public.api_keys`) | `authenticateApiRequest()` inside `withV1Auth()` | 54 public v1 API routes |
| **Inference organization key** | `/api/inference/api-keys` | `Authorization: Bearer` to the edge worker | `workers/inference/src/middleware/auth.ts`: sha256 → KV (60 s) → `lookup_api_key` RPC | Inference gateway |
| **Agent API key** | `/api/ai-agents/api-keys` (optionally scoped to one agent) | Bearer to `/api/v1/agents/{endpoint}/chat` | `AgentApiKeys.validate()` in `lib/supabase/queries/ai_agents.ts` | Public agent chat |
| **Internal service token** | Environment (`CRON_SECRET`, `INTERNAL_CRON_TOKEN`, `BATCH_PROCESSOR_TOKEN`) | Bearer or header | `lib/api/internal-cron-auth.ts`, `lib/security/cron-auth.ts` | Scheduled sweeps, batch processor, internal notify |
| **Console tickets** | `/api/services/compute/vms/[id]/console`, GPU terminal route | Opaque token in the WebSocket URL | `lib/vnc-token.ts` (AES-256-GCM, 5 min), `lib/gpu-terminal-token.ts` (HMAC, 60 s, ownership re-checked at redemption) | `server.ts` WebSocket proxies |

Git-provider integrations (GitLab, Bitbucket direct OAuth under `/api/gitlab/*`, `/api/bitbucket/*`, GitHub App under `/api/v2/git/*`) do not sign a user in. They bind a provider token to an already signed-in user; see §4.

---

## 2. Account lifecycle

All routes live under `app/api/auth/`. Rate limits are per email through `limitByEmail` (Redis) unless marked IP; IP limits come from `middleware.ts` for the listed public auth routes.

| Step | Route | What it does now | Limits |
| --- | --- | --- | --- |
| Sign up | `POST /onboarding` | Validates with `signup_schema` (name `^[a-zA-Z0-9_]{3,25}$`, password 6–100). Creates an **unconfirmed** Supabase user with the service client and emails a 6-digit code (5 min). If an unconfirmed account already exists it rebinds password and metadata to this submission and resends. Every outstanding code for the address is invalidated first. | 3 / 5 min per email; IP-limited |
| Confirm | `POST /onboarding/verify-otp` | Accepts the code **and the password the form collected**; sets the password in the same `updateUserById` call that confirms the email, then invalidates all other codes for the address. | 5 / 5 min per email |
| Sign in | `POST /signin/email` | `signInWithPassword` sets the cookies (aal1) and returns `twofastatus`. If a verified TOTP factor exists the browser runs `mfa.challenge` + `mfa.verify` (components/auth/signin.tsx) to reach aal2. **Nothing behind the sign-in accepts aal1 for that account** (§5). | 5 / min per email; IP-limited |
| Forgot / reset | `POST /forgot-password`, `POST /reset-password` | Neutral 200 for every branch (no account-existence oracle). Code consumed with the service client and confirmed to have changed a row. | 3 / 5 min, 5 / 5 min; IP-limited |
| Change password | `POST /profile/change-password` | Verifies the current password first. `PUT /profile/update` **no longer accepts a password.** | session |
| Sign out | `POST /signout`; `GET /signout?reason=` | POST ends the session and audits. GET ends the session and lands on `/signin?error=<reason>` for one of `account_suspended`, `mfa_required`, `session_expired`; used when a server component must end a session it cannot clear itself. | session |
| MFA | `/mfa/enroll`, `/mfa/verify`, `/mfa/status`, `/mfa/unenroll` | Supabase TOTP factors. `/api/auth/*` is exempt from the middleware's aal2 requirement so a half-authenticated session can finish the challenge. | session |
| API keys | `/api-keys`, `/api-keys/[id]` | PATs, shown once, stored hashed. | session |

---

## 3. Where a request is authorized

A request is admitted by exactly one of these helpers, and each now makes the same three decisions: identity, second factor, suspension (§5).

| Guard | File | Routes | Notes |
| --- | --- | --- | --- |
| `authenticateUser()` | `lib/auth/server-auth.ts` | 160 | Cookie session. AAL via `getAuthenticatorAssuranceLevel`; suspend via service client. |
| `authenticateUserFromHeader()` | `lib/auth/server-auth.ts` | 9 | Bearer JWT, else falls back to the cookie helper. AAL from the token's `aal` claim (the token `getUser` just accepted). |
| `withV1Auth()` → `authenticateApiRequest()` | `lib/api/v1-middleware.ts`, `lib/api-auth.ts` | 54 | PAT (`sk_live_`) or Supabase JWT. Per-user, per-operation rate limit. |
| `requireAdmin()` and its wrappers `checkAdminAuth()`, `requireDomainAdmin()` | `lib/supabase/auth.ts`, `lib/auth/check-admin.ts`, `app/api/admin/domains/_lib/admin-domain-utils.ts` | 70 + 18 + 11 | `ADMIN_EMAILS` when set, otherwise `user_profiles.roles` contains `admin`. AAL and suspend checked before the policy. |
| `getCaller()` | `app/api/v2/_lib/auth.ts` | 18 | PaaS v2. Cookie client only (the boundary test forbids the service role in `app/api/v2`); team roles `owner > admin > member > viewer` enforced by RLS through `paas.has_team_access`. |
| `requireAuthProfile()` | `lib/supabase/auth.ts` | 12 layouts/pages | Dashboard shell; a suspended profile is sent through `GET /api/auth/signout`. |
| **Middleware** `updateSession()` | `lib/supabase/middleware.ts` | every `/dashboard/*` page and every cookie-authenticated `/api/*` request except `/api/auth/*` | The chokepoint. Refreshes the session, redirects unauthenticated dashboard navigation, and returns **401 `mfa_required`** / **403 `account_suspended`** for API calls. This is what covers the 71 routes that call `supabase.auth.getUser()` directly instead of a helper. |

**Database clients** (`lib/supabase/server.ts`), because the audit depended on getting this right:

- `createClient()` — anon key + request cookies. Runs as the user; RLS applies.
- `createServiceClient()`, `createWorkerClient()` — service-role key, no cookies. Bypass RLS; every query must carry its own ownership filter.
- `createSSRClient()` — service-role key **plus** request cookies. supabase-js sends the session's access token as the bearer when a session exists, so with a signed-in caller it runs **as the user under RLS**; only with no session does it run as the service role. Its danger is therefore on unauthenticated routes, which is what `clusters/ready_by_id` was until 7ad7c12b.

---

## 4. Second factor and suspension

Both decisions live in one module, `lib/auth/assurance.ts`, and are made by every guard in §3 plus the middleware:

- **Second factor.** An account with a verified TOTP factor is entitled to `aal2`. A session or token still at `aal1` is a password-only login that skipped the challenge and is refused: `401 { code: "mfa_required" }` on APIs, redirect to `/signin?mfa=required` on pages. Accounts without a factor are unaffected. Cookie paths read the level from Supabase; bearer paths read the `aal` claim of the token `getUser` has just vouched for.
- **Suspension.** `user_profiles.suspend` is written by the admin users routes and read on every request path (service client; the middleware reads the user's own row and caches the answer per user for one minute). Refused as `403 { code: "account_suspended" }` or a signout redirect.
- **Fail-open rule.** Both allow the request when the fact cannot be read (a thrown call, a database blip). The level comes from the session JWT, so a throw is a fault of ours, not evidence about the user, and a platform-wide lockout is the worse outcome. A definite `aal1`-where-`aal2`-is-required, or a definite `suspend = true`, is always refused.

The **separate admin panel** (`C:\cloud-admin-panel`, branch `feat/separate-admin-panel`, commit `29d7550c`, not yet pushed) enforces the same two rules in its `requireAdmin` copy and its middleware, and its sign-in form gained the TOTP step so enforcing them is not a lockout.

**Live effect on 2026-09-05:** 40 accounts, 2 with a verified factor, 3 suspended profiles.

---

## 5. Git-provider bindings

- **GitHub sign-in** goes through Supabase OAuth; the callback is Supabase's code exchange.
- **GitLab and Bitbucket** are direct OAuth flows that store provider tokens for an existing user (`gitlab_tokens`, `bitbucket_tokens`, encrypted with `ENCRYPTION_KEY`). State is HMAC-signed with the user id and a timestamp. Both callbacks now require **the session user to equal the state user**; a logged-out victim completing an attacker-started flow no longer binds their token to the attacker's account (97c6b955, matching the GitLab callback's existing rule). The GitHub App callback under `/api/v2/git` already did this.
- Token storage falls back to plaintext if `ENCRYPTION_KEY` is unset or encryption throws (`lib/security/token-crypto.ts:46`). Documented; not changed.

---

## 6. Database-side authorization state

After the five migrations applied on 2026-09-05 (`20260905172538`, `174955`, `180156`, `180529`, plus the earlier `053835`):

| Object | Before | Now |
| --- | --- | --- |
| `public.clusters`, `public.database_cluster`, `public.activities` | `SELECT USING (true)` for `{public}`; anon held every privilege. 94 kubeconfigs / 94 connection strings anon-readable. | Blanket policies dropped; owner-scoped `SELECT` for `authenticated`; anon has no privileges; `TRUNCATE/REFERENCES/TRIGGER` revoked from `authenticated`. |
| `public.notifications` | `INSERT WITH CHECK (true)` for `{public}` | Service role only. |
| `public.servers` | `authenticated` could update every column, including `vmid`, `node`, `hourly_cost`, `plan_slug` | Update only `name`, `details`, `updated_at`. |
| `paas.team_members` | Team admins could insert any user as `owner` with any `created_at`; the hourly charge picks the earliest owner as payer | `created_at` not client-writable; trigger `owner_rows_are_self_only` refuses a client making anyone but itself owner (service context passes). Verified with real user ids in a rolled-back transaction. |
| `paas.teams.created_by` | Client-updatable; the payer fallback | Read-only for clients. |
| `paas.payer_balance` | `SECURITY DEFINER`, granted to `authenticated`, no membership check | Requires `has_team_access(team, viewer)` when `auth.uid()` is set; service callers unaffected. |
| `public.otps` | RLS on, no policies; the cookie client's "mark used" matched nothing, so codes were never consumed | Writes go through the service client and confirm a row changed. |

Migration files and applied versions match by name; `scripts/ci/migration-drift.ts` compares them on every push, **but the workflow's `SUPABASE_DB_URL` secret has never been set, so it has reported "cannot check" on every run.**

---

## 7. What was found on 2026-09-05, and what fixed it

Three inputs: the Claude Security scan (5 verified + ~212 raw leads), the GPT-6 threat model (design review, no findings), and a local validation harness that exercised the original handlers against synthetic fixtures. Everything below was confirmed in code or in the live database before it was fixed.

| # | Finding | Severity | Fix |
| --- | --- | --- | --- |
| 1 | Three customer tables anon-readable through blanket policies; anon held all privileges on six tables | Critical | migration `20260905172538` (6286d59b) |
| 2 | Two DigitalOcean proxy routes with no authentication; body id interpolated into the provider URL under the platform token | Critical | fad9e73f |
| 3 | `ENCRYPTION_KEY` and ciphertext logged on every admin database creation | High | fad9e73f |
| 4 | Droplet delete authenticated but never checked ownership | High | fad9e73f |
| 5 | Cluster status returned any cluster's kubeconfig by id; readiness route unauthenticated | High | 7ad7c12b |
| 6 | MFA enforced only in the browser | High | 2f43aa23 (cookie helper + dashboard middleware), ce2fd9bc (bearer, admin, v1, v2), 96b957f7 (middleware for all cookie API routes), admin panel 29d7550c |
| 7 | Suspension flag never enforced | Medium | ce2fd9bc, 96b957f7 |
| 8 | Signup pre-hijack, then a rebind race | Medium | 5166f32d (rebind), e2088d4b (code-holder sets the password; one live code per address) |
| 9 | Password change via profile update without the current password | Medium | 5166f32d |
| 10 | Forgot-password distinguished nonexistent / unverified / verified accounts | Medium | 5166f32d |
| 11 | OTPs never invalidated after use | Low | 5166f32d, e2088d4b |
| 12 | Team admin could make another user the payer (backdating; then demote-self; then `created_by`) | High | 8a0c57be, then d7e10182 (migration `180156`) |
| 13 | Bitbucket callback trusted a signed state over the session; then still bound tokens with no session | High | 4e22afb9, then 97c6b955 |
| 14 | Agent API keys: account-wide keys crossed tenants; then scoped keys could name a foreign private agent | High | 4e22afb9, then 02e56a05 |
| 15 | Tracked settings file held a host root password; e2e fixture held a real password | High | f2a63e0a (untracked / moved to env; **rotation still due**) |
| 16 | Onboarding had no rate limit and reflected the caller's name into branded email | Medium | 0b04025b |
| 17 | Customers could rewrite `servers.vmid/node/hourly_cost` | High | abbc84dd (migration `180529`) |
| 18 | VNC console token carried the Proxmox session ticket readable in the browser URL | High | 24f1f2ca (AES-256-GCM) |
| 19 | Revoked inference keys kept working for the 5-minute edge cache | Medium | 7221fb78 (60 s; needs a wrangler deploy) |
| 20 | v1 database name / username segments unvalidated into provider URLs (path traversal after the ownership check) | High | d0b8bfb9 |
| 21 | Old PaaS pipeline pasted unvalidated branch and repository URL into a shell block | High | cbee4b9e |
| 22 | Eight admin routes used a local roles-only check that ignored `ADMIN_EMAILS` | Medium | ce2fd9bc |
| 23 | Security test file imported two routes that do not exist; its seven auth cases had never run | — | 376bf3d1 |
| 24 | Deploy could go green while the previous build still served | — | afadd091, 5d4c0314, e9eae419, 4fe6632b |

Tests added: `tests/unit/security/{vnc-token,auth-assurance,untrusted-segments}.test.ts`; `tests/integration/api/kubernetes-manageip-delete.test.ts` extended; the SEC-AUTH suite runs again (17 passing).

---

## 8. Independently confirmed

The local validation harness (2026-09-05, at `ba965da4`) re-ran the original code with synthetic dependency boundaries and confirmed: the cookie, bearer, v1 and admin guards all refuse aal1 on an MFA account; the signup rebind race is closed and the code-holder's password is retained; consumed codes cannot be replayed; account-wide agent keys no longer cross tenants. Its three remaining findings (scoped agent keys, GPU routes bypassing the helper, the admin panel's guard) are items 14, 6 and the admin commit above.

---

## 9. Open items

**Not code, and yours:**
- **Rotate**: the 188 exposed rows (kubeconfigs, VM passwords, database connection strings were anon-readable until 172538), the game-panel root SSH password from the tracked settings file, the e2e fixture password, and every key in git history at `a950131a`, `bbb9e8e1` and `384930b1` (service role, `ENCRYPTION_KEY`, Stripe secret and webhook secret, DigitalOcean, Cloudflare, kubeconfig). The webhook secret is the only gate on wallet crediting.
- Set the `SUPABASE_DB_URL` repository secret so the migration drift check can run.
- Push `feat/separate-admin-panel` (admin MFA + TOTP sign-in) and run the wrangler deploy for the inference worker.

**Code, prioritized:**
1. `paas.aliases_write` (any member can claim any hostname under the platform zone via PostgREST) and `paas.installations_connect` (ownership of a GitHub App installation is a provider fact). Both need an RPC, not a policy.
2. About 30 `createSSRClient` call sites not yet audited (`createssrclient-audit.md`). Lower risk than first feared (§3), except on any route that skips authentication.
3. Leads from the scan not yet examined by anyone: domain-service ownership confusion, Spectrum cross-tenant listing and hostname claims, inference API-key and BYOK routes with no org-role check, admin routes gated on roles only in `app/api/admin/proxmox/hosts`, the unauthenticated object-storage bucket check (SSRF), Proxmox credentials stored in cleartext and sent with TLS verification disabled, plaintext OAuth token fallback.
4. Deferred by the validation harness: the fail-open policy when the assurance level cannot be read (deliberate, documented), and concurrent OTP variants that need a real database to test.
5. Retire the old PaaS create route once Deploy v2 is the only door; zero platform apps exist.

---

## 10. Operating notes

- **Is prod on the build I just pushed?** `curl -s https://ahurasense.com/ | grep -o '\"b\":\"[A-Za-z0-9_-]*'` prints the served build id; compare with the deploy log's `BUILD_ID`. The deploy passes only when they match (deploy.sh §5), waits up to ten minutes for the handover, and prints the unit definition, port owners and journal so a lingering old process is named in the run log.
- **Before touching a policy on a live table:** rehearse in a rolled-back transaction with real ids, then verify with `pg_policies` and `information_schema.role_table_grants`. A column-level `REVOKE` does nothing while a table-level grant exists.
- **Adding a route:** use a guard from §3, never `supabase.auth.getUser()` directly; if it must use a service-role client, write the ownership filter in the query and say so in a comment.
- **Adding a credential path:** call `secondFactorMissing` / `isSuspended` from `lib/auth/assurance.ts`; do not reimplement either decision.
- **Tests to run after touching auth:** `npx vitest run tests/unit/security tests/integration/api/security app/api/v2/_lib/boundary.test.ts`.

---

## Appendix: file map

| Concern | Files |
| --- | --- |
| Session / cookie clients | `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/supabase/middleware.ts`, `middleware.ts` |
| Guards | `lib/auth/server-auth.ts`, `lib/auth/assurance.ts`, `lib/auth/check-admin.ts`, `lib/supabase/auth.ts`, `lib/api-auth.ts`, `lib/api/v1-middleware.ts`, `app/api/v2/_lib/auth.ts` |
| Account routes | `app/api/auth/**` |
| OAuth bindings | `app/api/auth/callback/**`, `app/api/gitlab/callback`, `app/api/bitbucket/callback`, `app/api/v2/git/**`, `lib/api/oauth-state.ts`, `lib/security/token-crypto.ts` |
| Keys | `lib/supabase/queries/api_keys.ts`, `lib/supabase/queries/ai_agents.ts`, `workers/inference/src/middleware/auth.ts`, `app/api/inference/api-keys/**` |
| Console tickets | `lib/vnc-token.ts`, `lib/gpu-terminal-token.ts`, `server.ts` |
| Internal tokens | `lib/api/internal-cron-auth.ts`, `lib/security/cron-auth.ts` |
| Untrusted segments | `lib/services/database/operations/provider-path.ts`, `lib/jenkins/pipelines/inputs.ts` |
| Policies | `supabase/migrations/20260905*.sql`, `20260903195000_lock_down_the_eight_open_tables_and_dead_functions.sql`, `20260903165135_user_profiles_roles_are_not_self_service.sql` |
| Deploy guard | `deploy/deploy.sh`, `.github/workflows/deploy.yml`, `.github/workflows/migration-drift.yml` |
