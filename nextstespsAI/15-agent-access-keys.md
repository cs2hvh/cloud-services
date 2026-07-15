# Agent Access Keys — private + public per-agent API keys

**Date:** 2026-07-08 · **Companion to:** [11-agent-implementation-plan.md](11-agent-implementation-plan.md) (agentcore) · [14-agent-mcp-implementation.md](14-agent-mcp-implementation.md) (MCP tools) · **Status:** built, unit-tested, typecheck clean, migrations applied. **The §11 live-verification checklist below has still never actually been run end-to-end — see the 2026-07-15 note.**

> **BUILD STATUS (2026-07-08) — ✅ SHIPPED, not yet migrated.** Full private + public access-key tiers for agentcore agents. 104 inference tests passing (was 89 before this feature), 126 agent-runner tests unaffected, full workspace typecheck clean. Live smoke-tested against the real dev DB pre-migration (routes reachable, fail exactly where expected on the not-yet-existing columns).
>
> **CORRECTION (2026-07-15):** confirmed live via direct query — `inference.api_keys` already has `agent_id`/`key_tier`/`allowed_origins`. All 3 migrations are applied; the "not yet migrated" status above is stale.
>
> **BUILD STATUS (2026-07-15) — §11 live-verification checklist run for real, against the real gateway, for the first time.** Created two throwaway agents + a real private key + a real public key (revoked and deleted afterward). Every documented behavior held: private key → `POST /v1/agents/:id/runs` → 202 → full trace on poll (`cost_cents: 0.007`, `steps[]` populated). Public key with `allowed_origins:["https://example.com"]` → matching `Origin` header → 202, response has **no** `cost_cents`/`step_count`/`steps` (confirmed by field absence, not just a zero); mismatched or missing `Origin` → 403 `origin_not_allowed`. Scoped private key against a different agent's `/runs` → 403 `agent_scope_mismatch`; against `/v1/chat/completions` → 403 `agent_scope_restricted`. All exactly as designed.
>
> **One real correction to this doc, not a code bug:** §11 step 5 says "Revoke either key → next request → 401" — tested this literally (revoke, then immediately retry) and the revoked key **still authenticated successfully**. Root cause confirmed by reading the code, not assumed: `DELETE /api/agents/[id]/keys/[keyId]/route.ts` correctly sets `revoked_at` in Postgres (verified directly in the DB), but the edge gateway's auth check (`workers/inference/src/middleware/auth.ts`) hits a 5-minute KV cache (`KEY_CACHE_TTL_SECONDS = 300`) before ever re-querying Postgres, and revoking a key never invalidates that cache entry. **This is not new or specific to agent-scoped keys** — the general (non-agent) key revoke path (`app/api/inference/api-keys/[id]/route.ts:153-155`) has the identical limitation, already commented in that file as a known, accepted trade-off ("KV cache TTL (5 min) means the revocation [isn't instant]"). So: revocation across this entire API-key system is *eventually consistent within 5 minutes*, not instant — §11 step 5 above should read "→ 401 within 5 minutes" rather than "→ 401" on the very next request. Worth knowing for anyone building an "I think my key leaked" incident-response flow on top of this, but not something this feature introduced or needs to fix on its own — it'd be a system-wide change (the Next.js revoke route has no reach into the Cloudflare Worker's KV binding today).

---

## 1. The ask, and what was already true before this work

Manager ask: "we don't have an add-access-key-for-agent feature — research how commercial platforms do this, analyze ours, improve." Two things were discovered during investigation that reshaped the actual scope:

1. **Two parallel "AI agent" systems exist in this codebase.** An older `ai-agents` product (`app/dashboard/services/ai-agents/*`, schema `agents.*`) already has per-agent API keys (`agents.agent_api_keys`) and a public `/api/v1/agents/[endpointId]/chat` endpoint with CORS/domain allowlisting. **Agents v2 / agentcore** — the system docs 11/12/14 describe, durable runs + MCP + hosted tools — had no equivalent. This work is entirely in agentcore; the legacy system is untouched.
2. **The "no public endpoint" half of the problem was already false.** `POST /v1/agents/:id/runs` already existed in the api-key gateway (`workers/inference/src/routes/responses.ts`), already authenticated via a normal `ahu_...` key, already resolved the agent's own cost ceiling, already went through the per-key rate limiter and org spend-cap middleware. Paired with the pre-existing `GET /v1/agents/runs/:id` (+ `/stream`, `POST .../cancel`), the full create → poll/stream → cancel lifecycle for calling an agent externally **already worked** with any org-wide key.

So the real, narrow gap was exactly what the ask named: **any existing key could run *any* agent in the org**, plus every other endpoint (chat completions, images, embeddings...). There was no way to hand a partner a credential that only does one thing. That gap — not a whole new system — is what this feature closes.

## 2. Design decisions, and who made them

Two scoping questions were asked and answered explicitly before building:
- **Key surface**: server-to-server only, no browser/widget tier — *this was later revisited* when the follow-up ask explicitly asked for "private and public access, industrial standard." The public tier below is the result of that revision.
- **Billing target**: always the org that owns the agent, never a separate per-key resale ledger. This held throughout — no change.

## 3. A real user story: Priya ships a support agent

Priya runs the platform team at **Northwind**, a SaaS company that's a customer of ours. She's built an agent in our dashboard called "Northwind Support Bot" — a system prompt, a knowledge-base tool over their docs, `max_cost_cents` set as a per-run ceiling. That part is unrelated to this feature; it's just agentcore's builder (doc 11/12). Now she has **two different, real needs** for that same agent, and picking the wrong key for either one is exactly the mistake this feature is designed to make hard to make.

### Need #1 — a chat bubble on northwind.io, for anonymous website visitors

Priya wants a support widget in the bottom-right corner of `https://northwind.io` that any visitor can talk to, with no login. The code for that widget runs **inside every visitor's browser** — which means anyone who opens devtools and looks at the page's JS can read whatever credential it uses. That's not a hypothetical; it's just what "runs in a browser" means.

**She must use a public key.** Here's what she does:

1. Agent page → **Access Keys** tab → **New access key**.
2. Name: `"northwind.io widget"`. Tier: **Public**.
3. Allowed origins: `https://northwind.io` (and, while she's testing locally first: `http://localhost:3000`, which the origin regex allows specifically for this reason).
4. Spend cap: pre-filled at $20/mo — she knows her support volume and bumps it to $100/mo, since this key is going to serve every visitor to her site, not just her own team.
5. Create → copies the key **once** → pastes it into her site's static JS bundle, right in the widget code.

The actual widget code (from the tab's integration snippet, adapted):

```html
<script>
async function askNorthwindBot(message) {
  const createRes = await fetch("https://api.ahurasense.com/v1/agents/AGENT_ID/runs", {
    method: "POST",
    headers: {
      Authorization: "Bearer ahu_pub_xxxxxxxxxxxxxxxxxxxxxxxx",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: message }),
  });
  const { id } = await createRes.json();

  // EventSource can't set headers, so the key rides as a query param —
  // only ever accepted for a public-tier key (see auth.ts).
  const stream = new EventSource(
    `https://api.ahurasense.com/v1/agents/runs/${id}/stream?key=ahu_pub_xxxxxxxxxxxxxxxxxxxxxxxx`
  );
  stream.addEventListener("response.completed", (e) => {
    renderBotReply(JSON.parse(e.data).response.output);
    stream.close();
  });
}
</script>
```

What actually protects Northwind here, since that `ahu_pub_...` string is sitting in plain view in the page source for anyone to copy:
- **`originCheckMiddleware`** — if someone copies that key into a script on `https://competitor-site.com`, the request's `Origin` header won't match `https://northwind.io`, and it's rejected before it does anything.
- **`agentScopeMiddleware`** — even if someone did get a request through, that key can *only* run the Support Bot agent. It can't touch Priya's other agents, can't call `/v1/chat/completions` directly, can't read another agent's run history.
- **The $100/mo cap** — worst case, if the key is scraped and replayed from an allowed-looking context, Northwind's bill for this one key stops growing at $100, not their whole account balance.
- **Redaction** — whatever a visitor's browser network tab shows, it's never `cost_cents` or a raw internal error string, just the bot's reply (or a generic "something went wrong").

### Need #2 — Northwind's own backend, auto-triaging support emails

Separately, Priya's backend team has a Python service that reads incoming support emails and calls the same agent to draft a suggested reply, which a human reviews before sending. This code runs **only on Northwind's own servers** — it's never shipped to a browser, never visible to an end user.

**She uses a private key** for this:

1. Access Keys tab → **New access key**. Name: `"email-triage-service"`. Tier: **Private**. No origins needed — private keys aren't origin-restricted at all.
2. She puts the key in her backend's secrets manager as `NORTHWIND_SUPPORT_AGENT_KEY`, never in any repo, never in client-side code.

```python
import os, requests

resp = requests.post(
    "https://api.ahurasense.com/v1/agents/AGENT_ID/runs",
    headers={"Authorization": f"Bearer {os.environ['NORTHWIND_SUPPORT_AGENT_KEY']}"},
    json={"input": email_body},
)
run_id = resp.json()["id"]

status = requests.get(
    f"https://api.ahurasense.com/v1/agents/runs/{run_id}",
    headers={"Authorization": f"Bearer {os.environ['NORTHWIND_SUPPORT_AGENT_KEY']}"},
).json()
# status["cost_cents"], status["steps"] are both present here — a private
# key gets the full trace, which her team wants for their own internal
# cost-monitoring dashboard.
```

### What goes wrong if she mixes them up

- **If she'd used the private key in the website widget instead**: any visitor could read it from page source and then use it exactly like Priya's own backend would — call *any* agent in her org (not just Support Bot), see every run's real `cost_cents`, and there's no origin restriction stopping it from being replayed anywhere. That's the whole account's blast radius, not one agent's.
- **If she'd used the public key in her backend service instead**: it still works — a public key is still a real, valid credential — but every response comes back redacted. Her cost-monitoring dashboard would show nothing, because `cost_cents` is never in the response for a public-tier key. It's not a security problem, just the wrong tool: she'd have quietly lost the visibility her own team needs.

**The rule of thumb she actually needs to remember:** *if the code runs in a browser, it must be a public key, restricted to your real domain, with a cap you're comfortable losing. If the code runs only on servers you control, use a private key and keep it out of any client-side bundle.*

## 4. The whole flow, end to end

```
Dashboard: agent's "Access Keys" tab
        │  create private key            create public key
        ▼                                  ▼
inference.api_keys row                inference.api_keys row
  agent_id = X                          agent_id = X
  key_tier = 'private'                  key_tier = 'public'
  allowed_origins = NULL                allowed_origins = ['https://acme.com']
                                         hard_cap_cents = 2000 (default, overridable)
        │
        ▼
External caller → workers/inference gateway
        │
        ▼
authMiddleware        resolve key (KV cache → Postgres lookup_api_key RPC)
                       attach agentId / keyTier / allowedOrigins to AuthContext
        │
        ▼
agentScopeMiddleware   scoped key may ONLY hit its own agent's run routes
        │
        ▼
originCheckMiddleware  public key's request Origin header must match allowlist
        │
        ▼
spendCheckMiddleware   org + key hard-cap (pre-existing, untouched)
rateLimitMiddleware    per-key token bucket (pre-existing, untouched)
        │
        ▼
createAgentRun / getAgentRun / streamAgentRun / cancelAgentRun
        │
        ▼
Response:
  private key → full trace (cost_cents, steps[], real error message)
  public key  → redacted (no cost_cents/steps, generic error on failure)
```

## 5. Migrations — what each does and why it's separate

Written in this order, applied in this order, never edited after review (append-only ledger — same convention `inference.lookup_api_key`'s 4+ prior revisions already established in this codebase):

| File | Adds | Why a separate file |
|---|---|---|
| [`20260708000001_agent_scoped_api_keys.sql`](../supabase/migrations/20260708000001_agent_scoped_api_keys.sql) | `inference.api_keys.agent_id` (nullable, `ON DELETE CASCADE`) | Answers the original ask on its own — a complete, shippable feature (private agent-scoped keys) even without the tier work below. |
| [`20260708000002_agent_key_public_tier.sql`](../supabase/migrations/20260708000002_agent_key_public_tier.sql) | `key_tier`, `allowed_origins`, + 2 `CHECK`s | A separate, later decision (the "industrial standard, public + private" follow-up ask), layered on top of 001's column. |
| [`20260708000003_agent_public_key_requires_cap.sql`](../supabase/migrations/20260708000003_agent_public_key_requires_cap.sql) | 1 `CHECK`: public key ⇒ `hard_cap_cents` required | A fix discovered via research *after* 002 was already designed (DigitalOcean's public agent endpoints document no spend cap at all) — not part of the original plan, so it isn't retrofitted into 002. |

**Why `ON DELETE CASCADE` and not `SET NULL` (001):** `agent_id IS NULL` means "unrestricted" everywhere downstream. `SET NULL` on agent deletion would silently upgrade a scoped key into a full-access key — a privilege-escalation bug wearing the costume of a cleanup choice. `CASCADE` just removes the key; it had no purpose without its agent.

**Why the `CHECK`s in 002/003 aren't just Zod validation:** a Zod check only holds as long as every code path that inserts a row remembers to call it. A DB `CHECK` holds regardless of how many routes exist, today or in the future. Both layers exist together deliberately — Zod for a fast, well-worded 400 to the customer; the `CHECK` as the guarantee that survives a bug in that route.

**`lookup_api_key` gets dropped and recreated in both 001 and 002** — Postgres won't let `CREATE OR REPLACE FUNCTION` change a return column list, so each migration that adds a column the function needs to expose drops it first. This is the established pattern in this file's history (4+ prior revisions), not something new.

## 6. Gateway layer (`workers/inference`)

| File | Role |
|---|---|
| [`types.ts`](../workers/inference/src/types.ts) | `AuthContext` gains `agentId: string \| null`, `keyTier: "private" \| "public"`, `allowedOrigins: string[] \| null`. |
| [`middleware/auth.ts`](../workers/inference/src/middleware/auth.ts) | Resolves the 3 new fields from the DB/cache. Adds a `?key=` query-param token fallback — needed because browser `EventSource` can't set headers — but only ever honored for a key that resolves to `public` tier; a private key sent that way is rejected outright (URLs leak into logs/history, so that path stays impossible for the tier not designed to tolerate it). |
| [`middleware/agent-scope.ts`](../workers/inference/src/middleware/agent-scope.ts) (new) | A scoped key may only `POST` its own agent's `/runs`, or reach the `/agents/runs/*` read routes (which do a deeper per-row check themselves). Everything else 403s. Runs before spend/rate-limit so a violation is free. |
| [`middleware/origin-check.ts`](../workers/inference/src/middleware/origin-check.ts) (new) | A public key's `Origin` header must exactly match its `allowed_origins`. Explicitly documented as a real-but-non-cryptographic boundary (a non-browser client can set `Origin` to anything) — the actual worst-case protection is this + the mandatory spend cap together, same honest trade-off Algolia/Google Maps make with referrer-restricted keys. |
| [`index.ts`](../workers/inference/src/index.ts) | Wires both new middlewares into the `/v1/*` chain: `auth → scope → origin → spend → rate-limit`, cheapest/most-certain checks first. |
| [`routes/responses.ts`](../workers/inference/src/routes/responses.ts) | `createAgentRun` gets one extra check (scoped key's agent must match the URL) — defense in depth alongside the middleware, not a replacement for it. |
| [`routes/agent-runs.ts`](../workers/inference/src/routes/agent-runs.ts) | `getAgentRun`/`streamAgentRun`/`cancelAgentRun` each add `.eq("agent_id", auth.agentId)` when scoped (a run id alone doesn't reveal its agent, so this is the "deeper check" the scope middleware deferred). New pure function `redactForPublicTier(run, isPublic)` strips `cost_cents`/`step_count`/`steps` (omitted, not zeroed) and replaces a failed run's raw internal `error` string with a generic message for public callers — found and fixed during review, since a real error like `TypeError: fetch failed` is a worse leak than the cost number would have been. |

## 7. App API + UI layer

| File | Role |
|---|---|
| [`lib/inference/api-key-crypto.ts`](../lib/inference/api-key-crypto.ts) (new) | `generateApiKey(tier)` — factored out of the general keys route so the new agent-keys route doesn't duplicate it. Tier changes the prefix: `ahu_live_...` vs `ahu_pub_...`, so a key's tier is visible at a glance, same reason Stripe's `pk_`/`sk_` split is legible without a lookup. |
| [`app/api/agents/[id]/keys/route.ts`](../app/api/agents/[id]/keys/route.ts) (new) | GET list / POST create — the *only* place a scoped or public key can be minted. Validates the agent belongs to the caller's org, validates tier-specific rules (origins required + regex-checked for public, `https://` or `localhost`/`127.0.0.1` for local testing), defaults the $20 spend cap for public keys that didn't set one. |
| [`app/api/agents/[id]/keys/[keyId]/route.ts`](../app/api/agents/[id]/keys/[keyId]/route.ts) (new) | DELETE (soft-revoke), scoped by both `org_id` and `agent_id` together — can't revoke a key through the wrong agent's URL. |
| [`app/api/inference/api-keys/route.ts`](../app/api/inference/api-keys/route.ts) (modified) | GET now filters `.is("agent_id", null)` — agent-scoped keys are deliberately **excluded** from this general, unscoped-keys page, not surfaced on it. (An earlier version of this feature tried surfacing them here for admin visibility; reverted — this page's create/edit form has no concept of tier/origins, so a row that can only be revoked, not managed, is a half-integration, and the stats strip would silently mix two different security postures into one number.) **POST here is unchanged** — still only ever creates unscoped private keys; there's exactly one creation path for scoped/public keys (the agent's own tab), not two that could drift apart. |
| [`app/dashboard/services/agents/_agent-keys-tab.tsx`](../app/dashboard/services/agents/_agent-keys-tab.tsx) (new) | The tab: list with tier badges + cap/origin summary, create dialog (Private/Public toggle, origins input, cap pre-filled the moment Public is picked), show-once key dialog, revoke confirm, and copy-paste integration snippets (curl for private; `fetch` + `EventSource` for public, demonstrating the `?key=` pattern). |
| [`app/dashboard/services/agents/[id]/page.tsx`](../app/dashboard/services/agents/[id]/page.tsx) (modified) | One new tab entry wiring the above in. |

## 8. Tests

| File | What it proves |
|---|---|
| [`agent-scope.test.ts`](../workers/inference/src/middleware/__tests__/agent-scope.test.ts) | Scoped key: own agent passes, different agent 403s, run-read routes pass through, every other route 403s. Unrestricted key: no-op. |
| [`origin-check.test.ts`](../workers/inference/src/middleware/__tests__/origin-check.test.ts) | Private key: no-op regardless of Origin. Public key: matching Origin passes, mismatched/missing Origin 403s, fails closed if `allowed_origins` is somehow empty. |
| [`agent-runs.test.ts`](../workers/inference/src/routes/__tests__/agent-runs.test.ts) | `redactForPublicTier` — private passthrough, public strips cost/steps, public genericizes a failed run's error, private keeps the real error. |
| `gateway.test.ts` / `agent-tool-usage.test.ts` (modified) | Pre-existing `AuthContext` fixtures updated for the 3 new required fields — no behavioral change to what they test. |

All hand-built fake Hono contexts (just the `get`/`req`/`json` methods each middleware actually touches) — no network, no real Supabase — the same convention this project's MCP work established for testing gateway logic in isolation.

## 9. Cross-platform comparison (why this shape, not another)

| Platform | Model | Spend/rate protection on the public path |
|---|---|---|
| Stripe | `pk_`/`sk_`, publishable keys inherently limited in scope | N/A |
| DigitalOcean Gradient AI | Per-agent keys for direct calls; a **separate**, keyless public/private endpoint toggle for the embed widget, secured only by a domain allowlist | **None documented** |
| Google Vertex AI / Gemini Enterprise | API-key-restricted access + an explicit "unauthenticated" option, documented as demo-only | Not specified |
| Azure AI Foundry | Entra ID/RBAC to manage agents; plain API keys **only** for running them | Not found |
| AWS Bedrock AgentCore | Full IAM — resource + identity policies, SigV4/OAuth | Governed by IAM, not a key concept |
| OpenAI Assistants/Responses | Scoped at the **project** level only — no per-assistant key exists | N/A |
| **Ours** | Per-agent key + tier, origin-checked, per-key rate-limited, **mandatory** spend cap on public keys | Most conservative of the group |

Two takeaways worth remembering, not just decoration: our session-auth-to-manage / API-key-to-run split matches Azure's model exactly, and our per-agent granularity is finer than OpenAI's own production API today. The one place a real incumbent (DigitalOcean) ships something looser than us is the exact gap migration 003 closes.

## 10. Deferred, not forgotten

- **Key edit/rotate** — DigitalOcean supports this; a real DX gap, but a separate feature (needs its own semantics for not breaking a live embed mid-rotation).
- **Per-visitor fairness rate limiting** — a popular public embed shares one RPM bucket across every site visitor. No platform in this research solves this at the single-key layer either; accepted as a known trade-off, not built speculatively.
- **Legacy `ai-agents` product** — untouched; still has its own, older per-agent-key system, entirely separate from this one.

## 11. How to verify once migrations are applied

1. Run all 3 migrations, in order.
2. Dashboard → an agent → Access Keys tab → create a private key. `curl -H "Authorization: Bearer <key>" -d '{"input":"..."}' https://api.ahurasense.com/v1/agents/{agent_id}/runs` → 202 → poll `GET .../runs/{id}` → full trace with real cost_cents.
3. Create a public key with `allowed_origins: ["https://example.com"]`. Same create call with `Origin: https://example.com` → 202; response and stream have no cost_cents/steps. `Origin: https://evil.com` (or missing) → 403 `origin_not_allowed`.
4. Same public key against a different agent's runs, or `/v1/chat/completions` → 403 `agent_scope_mismatch` / `agent_scope_restricted`.
5. Revoke either key → next request → 401.
