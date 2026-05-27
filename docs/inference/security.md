# AhuraCloud Inference — Security & Compliance Posture

**Audience:** Procurement, security teams, technical due-diligence reviewers
evaluating AhuraCloud Inference for production use.

**Status:** This document describes the controls we have implemented today.
**We are not yet SOC 2 certified.** We are pursuing SOC 2 Type II readiness and
have built the platform from day one against the controls the audit framework
requires (encryption posture, access control, audit logging, retention
options, multi-tenancy isolation). A formal audit and the resulting attestation
are on the roadmap; in the meantime, this document is the source of truth
for what we do and do not do today, so you can make an informed decision.

**Last updated:** 2026-05-26 · **Branch:** `ai` (pre-GA).

---

## Executive summary

| Trust principle | What we do today | Notes |
|---|---|---|
| **Confidentiality** | TLS in transit, AES-256 at rest, customer prompts/responses optionally not logged (ZDR mode), per-org RLS on every table containing customer data | See §3, §4, §7 |
| **Integrity** | Append-only audit log, partitioned monthly, server-signed webhook deliveries (HMAC-SHA256), idempotent webhook receivers | See §6, §8 |
| **Availability** | Multi-region edge (Cloudflare Workers), managed Postgres with PITR, customer-controlled spend caps preventing runaway costs, GPU instance auto-stop preventing forgotten-instance billing | See §10 |
| **Privacy** | Zero Data Retention toggle per API key, no third-party analytics on the dashboard, no model-training on customer data ever | See §7 |
| **Subprocessor transparency** | Documented in §11. Customer-facing surfaces use vendor-neutral language; this document deliberately names every upstream so procurement can review them | See §11 |

**We are NOT today:**
- SOC 2 Type II certified (audit pending)
- HIPAA-eligible (no BAA available)
- FedRAMP authorized
- ISO 27001 certified

If your compliance framework requires a current attestation, we cannot meet
your bar today. We will publish a target audit date and pre-audit gap
assessment to interested customers under NDA.

---

## 1. Architecture overview (relevant for security review)

A request to the AhuraCloud Inference API traverses these tiers:

1. **Edge gateway** — Cloudflare Workers at `api.cs2hvh.com/v1/*` (target
   `api.ahurasense.com/v1/*` once domain perms transfer). Hono framework.
   Stateless. Source: [`workers/inference/`](../../workers/inference/).

2. **Key authentication** — SHA-256 of the bearer token is looked up in
   Cloudflare KV (hot cache, 5-min TTL) with fallback to Postgres via
   service-role RPC. The plaintext token is never stored. See §4.

3. **Spend + rate enforcement** — Per-org monthly spend counter in KV
   (eventually consistent, sufficient for hard-cap accuracy at 100k req/hr
   scale) and per-key token-bucket in a Durable Object. See §10.

4. **Routing** — Most requests forward to the upstream model gateway
   (OpenRouter, see §11). Fine-tune adapters routed to per-customer
   serving instances. Bring-Your-Own-Key requests use a customer-supplied
   provider key decrypted at the edge with AES-GCM. See §3.

5. **Persistence** — Async write of usage rows + audit rows via Cloudflare
   Queues to Supabase Postgres (`inference` schema). RLS-isolated per org.

6. **Customer dashboard** — Next.js 15 App Router (separate process from
   the gateway), authenticated via Supabase Auth + SSO providers.

---

## 2. Data inventory

What we collect, where it lives, and how long we keep it.

### 2.1 Account + identity

| Data | Where | Retention | Notes |
|---|---|---|---|
| Email, name, hashed password | Supabase Auth tables | Until account deletion | Standard Supabase Auth schema |
| Org name, slug, membership | `inference.orgs`, `inference.org_members` | Until org deletion | RLS-scoped |

### 2.2 API credentials

| Data | Where | Retention | Notes |
|---|---|---|---|
| API key SHA-256 hash | `inference.api_keys.key_hash` | Until key revocation | Plaintext key never stored; shown to user ONCE at creation |
| BYOK provider key (ciphertext) | `inference.byok_keys.encrypted_key` | Until key deletion | AES-256-GCM encrypted at rest; see §3 |

### 2.3 Request data

| Data | Where | Retention | ZDR mode |
|---|---|---|---|
| Prompts + responses (transit only) | None — proxied to upstream | Not persisted in non-cache paths | N/A — never logged regardless |
| L1 cache entries | Cloudflare KV `L1_CACHE` | 5-min TTL default, max 1 hour | Skipped entirely for ZDR keys |
| Semantic cache (embedding + response) | `inference.semantic_cache` | 1 hour TTL, hourly GC sweep | Skipped entirely for ZDR keys |
| Usage rows (counters + costs, NO prompt text) | `inference.usage` (monthly partition) | Indefinite (billing record) | Recorded for ZDR keys (no PII) |
| Audit log | `inference.audit_log` (monthly partition) | Indefinite (regulatory record) | Recorded for ZDR keys (no PII) |

**ZDR keys never have prompt or response text persisted anywhere.** The L1
exact-match cache and the pgvector semantic cache both check the key's
`zdr_enabled` flag and skip read + write paths entirely.

### 2.4 Fine-tuning artifacts

| Data | Where | Retention | Notes |
|---|---|---|---|
| Training dataset | Customer-supplied URL; we fetch once during training, then discard | Not retained | Customer's responsibility to host |
| Trained adapter (`adapter.tar.gz`) | Cloudflare R2 bucket `ahura-ft-adapters`, scoped by org | Until customer deletes the FT row | 6-hour presigned URLs for customer download |
| Training logs | Cloudflare R2 bucket `ahura-ft-adapters` (same bucket, separate key prefix) | Same as adapter | Presigned URL on demand |
| Hyperparameters + sample generations | `inference.finetunes.hyperparams`, `inference.finetunes.sample_outputs` | Until customer deletes | Customer-supplied; not used for any other purpose |

### 2.5 Batch jobs

| Data | Where | Retention |
|---|---|---|
| Input JSONL | Cloudflare R2 bucket `ahura-batches` | Until customer deletes the batch row |
| Output JSONL | Cloudflare R2 bucket `ahura-batches` | Same |
| Per-line errors | Cloudflare R2 bucket `ahura-batches` | Same |

---

## 3. Encryption

### 3.1 In transit

| Surface | Posture |
|---|---|
| API endpoints (`api.cs2hvh.com/v1/*`) | TLS 1.3 enforced via Cloudflare. HSTS preload, `max-age=63072000`, `includeSubDomains` |
| Dashboard (`wao.cs2hvh.com`) | TLS 1.3 via Cloudflare Tunnel. Same HSTS posture |
| Webhook deliveries (outbound to customer) | HTTPS only — `https://` URL validation rejected at config save time |
| Internal queue traffic (CF Workers → Supabase) | TLS to Supabase REST + RPC endpoints |
| Internal cron + service-to-service | TLS via Cloudflare Workers fetch |

Security headers (server-side enforced):
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Frame-Options: DENY`
- `Content-Security-Policy` set on dashboard origin
- `Permissions-Policy` restricting browser-side capabilities
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`

Source: [`next.config.ts`](../../next.config.ts).

### 3.2 At rest

| Data | Algorithm | Key management |
|---|---|---|
| Postgres (Supabase managed) | AES-256 at the storage layer (Supabase platform) | Supabase manages KMS rotation |
| Object storage R2 (adapters, batches, files) | AES-256 at the storage layer (Cloudflare) | Cloudflare manages KMS rotation |
| BYOK provider keys | AES-256-GCM with 96-bit IV, 128-bit tag | Operator-controlled key (see §3.3) |
| API key hashes | SHA-256 — one-way, no decrypt | N/A (irreversible) |

### 3.3 BYOK encryption — key management

Bring-Your-Own-Key (BYOK) lets customers store provider credentials (e.g.
their own OpenRouter key) so requests bill to their account, not ours. These
are highly sensitive and warrant first-class encryption treatment.

**Algorithm:** AES-256-GCM (NIST-recommended AEAD construction).

**Key length:** 32 bytes (256 bits).

**IV:** 12 bytes (96 bits), generated per-encryption via `crypto.getRandomValues`
on the edge.

**Authentication tag:** 16 bytes (128 bits), appended to ciphertext.

**Ciphertext layout:** `[IV (12 bytes) | ciphertext+tag (variable)]` —
base64-encoded at the database boundary.

**Data Encryption Key (DEK) storage:** A single 32-byte random key, base64-
encoded, distributed as the `BYOK_DEK` environment secret to:
- The Next.js dashboard process (for CREATE/UPDATE)
- The Cloudflare Worker (for DECRYPT during request forwarding)

**Both processes MUST hold the same DEK.** Losing the DEK renders all
existing BYOK ciphertext unreadable. Operator runbook (internal):
- Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- Distribute via `wrangler secret put BYOK_DEK` + `.env` BYOK_DEK
- Back up to operator's secure vault (1Password/etc.) — losing this brings the platform down

**Source:**
- Server-side (Next.js): [`lib/inference/crypto.ts`](../../lib/inference/crypto.ts)
- Edge (CF Workers): [`workers/inference/src/lib/crypto.ts`](../../workers/inference/src/lib/crypto.ts)
- Use site (request decrypt): [`workers/inference/src/lib/openrouter.ts`](../../workers/inference/src/lib/openrouter.ts)

**Key rotation:** Schema includes `kms_key_version INTEGER` on
`inference.byok_keys` to support re-encryption rotation. Rotation runbook is
operator-internal; we have not yet rotated production DEKs.

---

## 4. Authentication & authorization

### 4.1 Dashboard authentication

- Supabase Auth (email/password, OAuth providers)
- Session JWT stored in HTTP-only cookies
- Server-side validation on every API route

### 4.2 API key authentication

- Format: `ahu_live_<32 url-safe random chars>` (256 bits of entropy)
- Stored as SHA-256 hex hash; **plaintext shown to user exactly once at creation**
- Lookup path: KV (5-min TTL) → Postgres `inference.lookup_api_key` RPC (service-role)
- Lookup returns: org_id, allowed_models, allowed_ip_cidrs, ZDR flag, spend caps, rate limit, semantic-cache opt-in, expiration
- Revoked keys (`revoked_at IS NOT NULL`) excluded from RPC results immediately; KV cache cleared on revoke
- IP allowlists optionally enforced per-key (`allowed_ip_cidrs`)
- Expiry optionally enforced per-key (`expires_at`)

### 4.3 Role-based access control

Org members carry one of four roles:

| Role | Capabilities |
|---|---|
| `owner` | Full admin including org deletion + spend cap edits |
| `admin` | Manage members, keys, settings, billing, notifications. Cannot delete org |
| `developer` | Create/use keys + run jobs. Cannot manage members or change org-wide settings |
| `viewer` | Read-only access |

Role checks are enforced on every mutating route (`org.role === 'owner'` or
`'admin'` predicates throughout `app/api/inference/`).

### 4.4 Row-level security (RLS)

Every table in the `inference` schema has RLS enabled. Two helper functions
back all policies:

```sql
inference.is_org_member(org_id UUID) RETURNS BOOLEAN
inference.is_org_admin(org_id UUID) RETURNS BOOLEAN
```

Policies:
- `SELECT` policies use `is_org_member()` — any role can read org data
- `INSERT/UPDATE/DELETE` policies use `is_org_admin()` for sensitive tables
  (orgs, members, api_keys, byok_keys) — owners/admins only
- Mixed for less-sensitive tables (e.g. usage SELECT for any member)

Tables with RLS: `orgs`, `org_members`, `api_keys`, `byok_keys`, `models`,
`model_presets`, `usage`, `audit_log`, `finetunes`, `deployments`,
`vector_collections`, `vector_rows`, `notification_settings`,
`webhook_deliveries`.

Service-role bypasses RLS (used by the worker for usage event consumer,
internal cron, and a handful of internal RPCs). Service-role key NEVER
reaches client code — server-side only.

---

## 5. Multi-tenancy isolation

| Surface | Isolation mechanism |
|---|---|
| Postgres rows | RLS policies keyed on `org_id` (§4.4) |
| Per-org spend counter | KV key namespace `org:{orgId}:month:{YYYY-MM}` |
| Rate limit Durable Object | One DO per `(api_key_id)` — no cross-key state |
| L1 cache | Cache key incorporates `org_id` so two orgs with identical prompts get different cache entries |
| Semantic cache | RPC filter `WHERE org_id = $1` is unconditional; no cross-tenant nearest-neighbor possible |
| Object storage | R2 key prefix scoped by `org_id`; presigned URLs are per-object + time-bounded |
| Fine-tune adapters | Per-org R2 prefix; per-org KMS isolation tracked in `kms_key_version` column on `finetunes` |
| Serving instances | Per-customer dedicated GPU instance — never shared across orgs |

**No cross-tenant data path exists.** Operator-side (us) can read any org's
data via service-role; that path is logged separately and reserved for
support cases with customer authorization.

---

## 6. Audit logging

Append-only audit log of every mutating action:

- Table: `inference.audit_log`, partitioned by month
- Columns: `org_id`, `actor_user_id`, `actor_api_key_id`, `action` (typed enum),
  `target_type`, `target_id`, `metadata` (JSONB), `ip_address`, `user_agent`,
  `created_at`
- RLS-scoped to org members for reads; service-role only for writes
- Enum currently covers 30+ action types: org/member/key lifecycle, BYOK
  add/remove, FT submit/cancel, deployment lifecycle, notification config
  changes, spend-cap changes, guardrail blocks

What's NOT logged: prompt/response content (intentionally — ZDR posture).
What IS logged: who did what, when, from which IP, to which resource id.

Dashboard view: `/dashboard/services/inference/audit` shows the org-scoped
audit feed with filters by actor + action.

---

## 7. Privacy & data retention

### 7.1 Zero Data Retention (ZDR) mode

Per-API-key toggle. When enabled:

- L1 exact-match cache: bypassed entirely (read + write skipped)
- Semantic cache: bypassed entirely (read + write skipped)
- Usage event recording: cost + token-count meta still recorded; no prompt
  text was ever recorded regardless
- Audit log: still records who/when/what (metadata only, no payload)

ZDR is mutually exclusive with semantic cache; the dashboard auto-disables
semantic cache when ZDR is toggled on (with explanatory copy).

### 7.2 Default retention (non-ZDR)

- L1 cache: 5-minute TTL, configurable up to 1 hour per request via
  `X-Ahura-Cache-TTL` header
- Semantic cache: 1-hour TTL with an hourly GC sweep
- Usage rows: indefinite (billing record)
- Audit log: indefinite (regulatory record)
- BYOK ciphertext: until customer deletes the key
- Fine-tune adapters: until customer deletes the FT row

### 7.3 We do not train on customer data

We do not use customer prompts, responses, fine-tune datasets, or any
customer-uploaded content for model training, model improvement, or any
secondary purpose. Customer data is processed solely to serve the customer's
request and is retained per the table above.

### 7.4 Data export + deletion

- **Export:** Usage data exportable as CSV via the dashboard
  (`/dashboard/services/inference/usage` → "Export CSV").
- **Deletion:** API keys, BYOK keys, fine-tunes, deployments, vector
  collections all support customer-initiated DELETE through the dashboard
  and API. Cascading FK constraints ensure dependent rows go with them.
- **Org deletion:** Contact support (operator-initiated for v1 to ensure
  billing reconciliation; self-service org deletion is on the roadmap).

---

## 8. Webhook security (outbound)

When a customer configures an outbound webhook for inference event
notifications, we sign every delivery so the receiver can verify
authenticity:

- Algorithm: HMAC-SHA256
- Header: `X-Ahura-Signature: sha256=<hex>`
- Signed payload: entire request body (canonical JSON)
- Secret: customer-supplied at webhook configuration time, rotatable
  through the dashboard (`/dashboard/services/inference/notifications`)
- Delivery audit log: every attempt persisted to
  `inference.webhook_deliveries` with status, HTTP code, response excerpt,
  retry count — readable in the dashboard for the customer's own debugging

Webhook URLs are validated `https://` at save time. Plaintext HTTP is
rejected.

Body size cap: 16KB. Timeout: 8s.

---

## 9. Webhook security (inbound — FT pipeline)

Internal webhooks (training pod → control plane) are HMAC-verified the same
way. Secret distributed via `FT_WEBHOOK_SECRET` env var. Receivers are
idempotent on row state — replays don't double-process.

---

## 10. Availability + resource controls

### 10.1 Infrastructure

- Edge gateway runs on Cloudflare's global network (200+ PoPs)
- Postgres managed by Supabase with PITR (Point-in-Time Recovery) — backup
  posture per Supabase's SLA
- Object storage on Cloudflare R2 — region-replicated per CF's posture
- Customer-facing dashboard runs on a single host today (pre-GA); HA
  topology pre-GA is on the roadmap

### 10.2 Spend controls

Multiple layers protect customers from runaway costs:

- **Per-API-key monthly hard cap** — middleware returns 402 when reached
- **Org-level monthly hard cap** — separate check; whichever fires first wins
- **80% / 100% budget alerts** + **90% / 100% cap alerts** — operational
  notifications that bypass the customer's events_subscribed filter so they
  cannot be accidentally muted
- **Per-API-key rate limit (RPM)** — token-bucket DO returns 429 + Retry-After

### 10.3 Fine-tune serving auto-stop

Hosted serving instances auto-terminate after configurable idle window
(default 6 hours). A scheduled watchdog reaps any instance past its
`auto_stop_at`. Customer billed per-second; no forgotten-instance risk.

### 10.4 Cold-start handling

Managed serving instances return clean `503 + Retry-After: 10` during
warmup (typical 45-90s). SDK auto-retry handles it transparently; customer
sees `instance_warming_up` error code, not a vendor-specific 500.

---

## 11. Subprocessors

This is the one place customer-facing materials name our upstream providers.
Procurement teams need this list; the rest of our customer surfaces
(dashboard, API errors, emails, outbound webhooks) deliberately do not name
these providers because (a) customers are buying AhuraCloud, not a passthrough
to specific names, and (b) we reserve the right to change upstream providers
without notice.

Current subprocessors:

| Provider | Purpose | Data handled |
|---|---|---|
| **Cloudflare, Inc.** | Edge gateway (Workers), KV state, R2 object storage, Tunnel, DNS, CDN | All request traffic, cache entries, fine-tune artifacts, batch files. TLS-terminated at edge. |
| **Supabase Inc.** | Managed Postgres (`inference` schema + Auth) | Account, org, key, usage, audit, fine-tune metadata, vector embeddings, semantic cache entries. AES-256 at rest. |
| **OpenRouter, Inc.** | Upstream model gateway for chat/completions, messages, embeddings | Prompts + responses pass through in transit only (we do not log them in non-cache paths). OpenRouter's own data handling per their privacy policy. |
| **Linode (Akamai)** | Managed Kubernetes (LKE) running async workers (FT runner, deploy runner) | Job metadata + status; no prompt or response payloads |
| **RunPod, Inc.** | GPU compute for fine-tuning + managed serving instances | Training datasets (fetched once, then discarded), adapter ciphertext during training, prompt/response in transit during serving |
| **Upstash, Inc.** | Redis (REST) for FT heartbeats, rate limit fallback, ephemeral counters | Heartbeat metadata, monthly spend counter, alert dedup keys. No prompt/response payloads. |
| **Resend, Inc.** | Transactional email delivery (notifications, account verification) | Recipient email + notification body. No prompt/response payloads. |
| **GitHub, Inc.** | Container registry (`ghcr.io`) for our training + serving images | Docker images we build; not customer data |
| **Hugging Face, Inc.** | Base model weights fetched during fine-tuning | Public model weights only; no customer data uploaded |

Notification: we will give customers 30 days' advance notice (via dashboard
banner + email to org owners) before adding a new subprocessor or changing
how an existing subprocessor handles data.

---

## 12. Incident response posture

Pre-GA, our incident response is operator-led with the following commitments:

- **Detection:** Cloudflare Workers logs (1.0 sampling rate), Supabase logs,
  audit log monitoring. Spend-alert + threshold-alert pipeline doubles as a
  monitoring signal for unusual usage patterns.
- **Customer notification:** Material security incidents will be communicated
  via email to org owners within 72 hours of confirmed scope.
- **Forensics:** Audit log is append-only and partitioned — preserves a
  reliable history of who-did-what.
- **Key compromise:** Customer can revoke an API key from the dashboard at
  any time; takes effect within 5 minutes (KV cache TTL). Immediate
  invalidation possible by operator request.

**What we do not yet have:** a documented public incident response runbook,
a 24/7 on-call rotation, or a CVE coordination process. Both are tracked
for the SOC 2 audit readiness work.

---

## 13. Vulnerability + patch management

- Dependencies pinned via lockfiles; Dependabot enabled on GitHub for the
  primary repo
- Worker code deployed via `wrangler deploy` — no auto-deploy of
  dependencies
- Supabase managed Postgres patched by Supabase per their SLA
- Cloudflare Workers runtime patched by Cloudflare per their SLA
- Customer-facing security headers reviewed against
  [securityheaders.com](https://securityheaders.com) — current score A+

---

## 14. Brand-scrub discipline (for review context)

You will notice that elsewhere in our customer-facing surfaces (dashboard,
API error messages, webhook payloads, notification emails), we never name
the providers listed in §11. This is intentional:

- Single source of truth: `lib/inference/error-messages.ts::customerSafeErrorMessage()`
- Applied at three layers: write-time, read-time, and at the notifications
  fan-out boundary
- Audit-checked when new write paths are added

This document — `security.md` — is the deliberate exception. Procurement
teams legitimately need the subprocessor list, and this is the right place
to share it.

---

## 15. What's on the SOC 2 readiness roadmap

Items we have identified as needed for Type II audit readiness that are not
yet shipped:

| Item | Notes |
|---|---|
| Documented incident response runbook | Internal-only currently; needs public-facing summary |
| 24/7 monitoring + on-call rotation | Manual today; needs pager rotation |
| Background checks for staff with production access | Implicit today (small team); needs formal policy |
| Annual penetration test | Not yet conducted |
| Vendor risk reviews for new subprocessors | Currently informal |
| Customer-facing public status page (separate from operator dashboard) | Operator/customer split in `/status` exists; public marketing-side status page is roadmapped |
| Formal data classification + handling policy doc | Implied by this document; needs to be its own artifact |
| HIPAA BAA + Business Associate posture | Not pursuing in v1 |

We share these openly so customers can decide whether to engage now or wait
for specific items to land.

---

## 16. Questions?

Email **security@ahurasense.ai** for:
- Specific control questions beyond what's covered here
- Subprocessor due-diligence requests
- Pen-test / scan coordination
- Custom contract terms (DPA, BAA, data residency commitments)

For technical issues, the standard support address is **support@ahurasense.ai**.
