# Agents v2 — MCP Tools (Service D) Implementation Plan

**Date:** 2026-07-06 · **Companion to:** [11-agent-implementation-plan.md](11-agent-implementation-plan.md) (§4 plugin model, S4) · [02-agent-infrastructure.md](02-agent-infrastructure.md) (Service D) · **Status:** M1–M4 shipped, all 4 migrations applied + live-verified (including an M4 edit-support follow-up and an M4 schema-refresh-cron follow-up). M5 verified manually across many real scenarios, still no automated L2/L3/L4 test artifact. M6 not started.

> **BUILD STATUS (2026-07-07) — M1 (adapter core + minimal builder UI) — ✅ SHIPPED.**
> `tools/mcp-client.ts` (SDK wrapper, `@modelcontextprotocol/sdk@^1.29.0`) + `tools/mcp.ts` (adapter: resolve inline config, connect, namespace/scrub/allow-list, `flattenMcpResult`) + `tools/mcp-attach.ts` (`attachMcpTools`). **Better than planned:** `attachMcpTools` turned out to be a pure **decorator** — it wraps the base `Dispatcher` from the outside using only its existing public interface, so `dispatch.ts` needed **zero changes** (not just "stays sync" — literally untouched). MCP decls also never touch `spec.ts`/`resolveSpec` at all: `buildDispatcher` already no-ops unknown/unresolvable decl types, so `lifecycle.ts` just filters `cfg.tools` for `type==='mcp'` and hands them to `attachMcpTools` directly — one less file in the "modular" claim than originally planned. Both `connectMcpTools` and `attachMcpTools` take an injectable factory param (`openClient`/`connect`, defaulting to the real implementation) — the concrete mechanism behind the "fake client, no network" L1 promise in §9b, exercised by 23 tests in `workers/agent-runner/src/__tests__/mcp.test.ts` (flat layout — matches this repo's actual test convention, not the `tools/__tests__/` path originally sketched in §8). `McpToolDecl` extended in `agent-core/src/types.ts` exactly per §4's dual-mode shape. Builder UI shipped in M1, not deferred to M4 per §12b: `_constants.ts` (`McpDef`/`emptyMcp`/`buildMcpTools`/`mcpToolsOf`) + a "MCP servers" section (`Plug` icon) in both `new/page.tsx` and `[id]/page.tsx`'s Settings tab, mirroring "Custom functions" 1:1. Trace rendering needed zero changes, confirmed live via the generic `detailRows()` path. `auth_token` is stored inline in the `tools` JSONB in plaintext for M1 — same as the existing `function` tool's `secret` today; encryption-at-rest is an M3 **registry**-only concern (`byok-keys` pattern), not required until server config moves server-side.
>
> **✅ LIVE E2E VERIFIED (2026-07-07, M5 pulled forward)** — before M2/M3 were even built: signed in as a real user, created a real agent via `POST /api/agents` with an inline `mcp` tool, ran it via the real `POST /api/agents/runs` against a genuine local MCP server (Streamable HTTP, real SDK client + server), and confirmed the full trace — `step_type:"mcp"`, `tool_name:"mcp__test__add"`, `unit_label:"mcp_call"`, and a final model answer that **actually used** the real tool result (not a hallucination). Also verified graceful degradation: an agent pointed at a dead server completes normally (best-effort skip, §7 scenario 3), not a run failure. This is the §9b human acceptance checklist, passed for real, backed by curl instead of the browser (no browser-automation tool in this environment — the React builder forms themselves were never click-tested, only the API contracts they call).
>
> **BUILD STATUS (2026-07-07) — M2 (metering) — ✅ SHIPPED, migration applied + live-verified.** Migration `20260707000001_agent_mcp_pricing.sql` (`agent/mcp` row, `cents_per_mcp_call`, PENDING_FINANCE) is **applied** — confirmed live via direct query and via a real run's trace (`unit_label:"mcp_call"`, `cost_cents:0.2` on the step, matching the rate exactly). `mcp_call → "mcp_call"` in `lifecycle.ts`'s `TOOL_PRICE_KEY_TO_LABEL`; `mcp_call → "mcp"` in `tool-usage-report.ts`'s `REPORTABLE_UNIT_LABELS` (this required correcting a stale test that had asserted `mcp_call` was a no-op — it wasn't stale when written, M2 just hadn't shipped yet). Gateway side: `computeUnitCost()` + `isPerUnitLabel()` gained a `mcp_call` case in `workers/inference/src/consumers/usage.ts`; the `/v1/agent-tool-usage` ingress route gained `toolType: "mcp"` → `agent/mcp`. Tests added in all three places (agent-runner, usage consumer, ingress route) — zero regressions.
>
> **BUILD STATUS (2026-07-07) — M3 (registry) — ✅ SHIPPED, migration applied + live-verified.** Migration `20260707000002_agentcore_mcp_servers.sql` (table + RLS mirroring `agentcore.agents`, plus `ALTER TYPE inference.audit_action ADD VALUE` for two new audit actions) is **applied** — confirmed live: registered a real server via the API, resolved it by slug at runtime, real tool call succeeded. **Still not built from this stage's own scope** (§4's `tool_schemas` cache + "refresh on register + a cron"): the runner still does a fresh `connect()`+`listTools()` every run for registry-mode servers, same as inline mode — a scalability optimization, not a correctness gap, but genuinely not done, not just deferred-and-forgotten-about. Registry-mode resolution stays out of `mcp.ts` per §2b rule 2: a new `mcp-registry.ts` (`resolveRegistryMcpConfig`) is the *only* file that queries the registry, and a new `mcp-crypto.ts` (decrypt-only AES-GCM, mirrors `lib/inference/crypto.ts`'s format so agent-runner — a standalone Node package with no import path into `app/lib/*` — can decrypt what the API route encrypts) is the *only* file that touches key material. `mcp-attach.ts` gained a 4th param (`deps: {supabase, orgId, dek}`, optional) and branches on `decl.server_slug` — this is the one file allowed to grow per §2b rule 3 (mcp.ts's `connectMcpTools`/`mcpCallTool`/`flattenMcpResult` stay 100% frozen; only the *orchestration* layer learns a new resolution mode). API: `app/api/agents/mcp-servers/route.ts` + `[id]/route.ts`, mirroring `byok-keys` almost line-for-line (Zod → org-scope → `encryptAesGcm` → mask on read via a `has_token` boolean, never the ciphertext) but reusing `/api/agents`'s Bearer-capable auth (`authenticateUserFromHeader` + `canWrite`), not byok-keys' cookie-only auth — this is an agentcore-family endpoint. New `AgentcoreMcpServers` query module in `lib/supabase/queries/agentcore.ts`. Builder UI: a new `_mcp-server-picker.tsx` component (fetch + multi-attach chips) added to the "MCP servers" section in both `new/page.tsx` and `[id]/page.tsx`, additive alongside the M1 inline rows — proving "register once, bind by slug in any agent" is now literally a dropdown, not just a plan. 11 new tests (`mcp-registry.test.ts`: crypto round-trip + 5 resolution cases; `mcp.test.ts`: 3 registry-mode `attachMcpTools` branch cases) — 115/115 agent-runner tests green, zero regressions, full app-wide `tsc --noEmit` clean.
>
> **BUILD STATUS (2026-07-07) — M4 (curated catalog + management screen) — ✅ SHIPPED, migration applied + live-verified (with 2 scope differences from §9's row, both intentional simplifications, called out here explicitly rather than left silently drifted).** M3 shipped the registry's read/resolve path but the only way to *register* a server was the API directly — no UI, no nav entry, no way to see a server's status once attached. New `app/dashboard/services/agents/mcp-servers/page.tsx` (mirrors `byok-keys/page.tsx`: `DataTable` + register `Dialog` + status dot (active/error/disabled) + delete `AlertDialog`, curated rows shown read-only as "platform-owned" since the org-scoped DELETE can't touch `org_id IS NULL` rows anyway) + a new "MCP Servers" sidebar entry under A.I. Labs → Build, next to Agents. Migration `20260707000003_agentcore_mcp_curated_catalog.sql` is **applied** — confirmed live, seeded 2 curated rows (DeepWiki, Context7) — **both live-verified end-to-end already** (real tool calls, real answers, proven during M3's live test), not guessed-at endpoints.
>
> **Scope differences from §9's M4 row, stated plainly:** (1) §9 describes a separate **"curated-catalog tab (one-click enable)"** on the management page — not built; curated rows just show inline in the same list. "One-click enable into an agent" still works, but through the *existing* per-agent builder picker (which already lists curated + private together), not a dedicated action on this new page. (2) The **`mcp-schema-refresh` cron** (§4's `tool_schemas` cache, populate-on-register + periodic refresh) was **not built at the time this M4 block was first written** — see the dedicated follow-up block below, where this gap is closed.
>
> **Two real bugs caught live during this pass, both fixed:**
> 1. **Registry-mode namespace label used `display_name` (free text) instead of `slug` (already validated clean).** Found by literally reading the rendered trace UI: a server named "DeepWiki (GitHub repo Q&A)" produced the tool name `mcp__deepwiki__github_repo_q___ask_question` — `sanitizeLabel`'s 24-char cut mangled it mid-word. Fixed in `mcp-registry.ts` to derive the label from `slug` (`^[a-z0-9][a-z0-9_-]*$`, already guaranteed short and clean at registration) → clean `mcp__deepwiki__ask_question`. Regression test added; `display_name` dropped from the resolver's SELECT since it's now unused there.
> 2. **React key collision in the Overview tab's tool-chip list** (`[id]/page.tsx`): `key={t.type}` breaks the instant an agent binds two tools of the same type — which registry mode makes a completely normal configuration (this demo agent has two `mcp` tools). Found via the actual Next.js dev-overlay error. Fixed with an index-qualified key, plus a `toolChipLabel()` helper so two same-type chips are distinguishable (`mcp: deepwiki` / `mcp: context7`) instead of both reading identically as `mcp`.
>
> Also live-verified (same pass): a real transient timeout against DeepWiki (15s test-harness timeout, real query took slightly longer) correctly billed `units: 0` and did not fail the run — the model retried the same tool and succeeded, exactly matching §7 scenario #4's design, unprompted, against a real third-party server outside our control.
>
> **Not yet done, confirmed by checking the live DB + grepping the codebase, not assumed:** the M4 curated-catalog tab as its own UI element (functionality exists via the picker instead), the L2 Docker-gated protocol-integration test (`mcp.integration.test.ts` from §8's file layout — never created; all live verification so far was manual, not an automated, repeatable test), L3 (MCP Inspector cron smoke-check) and L4 (agent-level eval dataset) from §9b, and all of M6 (OAuth 2.1, connection pooling, hosting). (The `mcp-schema-refresh` cron itself is no longer on this list — see the follow-up block below.)
>
> **Migration status, verified live (2026-07-07), not assumed:** `20260707000001` (pricing), `20260707000002` (registry), `20260707000003` (curated catalog), and `20260707000004` (see the M4 follow-up block below) — **all 4 applied**. The private/curated `deepwiki`/`context7` slug collision this section used to warn about was resolved: the two private test rows were deleted once the curated rows landed, confirmed live (the demo agent's bindings now resolve through the curated rows, byte-identical behavior).
>
> **BUILD STATUS (2026-07-07) — M4 follow-up: Edit support — ✅ SHIPPED, migration applied.** Delete-only turned out to be a real gap the moment a customer (the live test account) tried to fix a typo in their own registered server and had no way to do it short of delete-and-recreate — risky, since every agent referencing that slug would break if the slug were mistyped on recreation. Added `PATCH /api/agents/mcp-servers/[id]` (`AgentcoreMcpServers.update()`, `updateMcpServerSchema`) — editable: `display_name`, `server_url`, `auth_token` (blank = keep existing, since the current one is never returned to the client), `allowed_tools`. **Deliberately NOT editable**: `slug` (the stable bind-key every agent's `{server_slug}` decl references — changing it would silently break every existing binding) and `visibility` (curated rows aren't reachable through this org-scoped route regardless). New migration `20260707000004_agent_mcp_server_updated_audit.sql` (`mcp_server.updated` audit action, closing the CRUD set) — **applied**, confirmed by finding a real `mcp_server.updated` row in `inference.audit_log` from the live edit test. New "Edit" button in `mcp-servers/page.tsx`, `ghost` variant next to Delete, private rows only.
>
> **Found + fixed live during this same pass — the real reason to test with a second decl field, not just the happy path:** registry-mode resolution silently dropped a decl's own `allowed_tools`/`label` entirely. `mcp-attach.ts` was calling `resolveRegistryMcpConfig(supabase, orgId, decl.server_slug, dek)` — note what's missing: `decl.allowed_tools` and `decl.label` were never passed in at all, so doc §4's explicit promise ("org-level allowlist — **agent decl can narrow further**") silently did nothing for any `{server_slug}` decl. Caught by creating two real agents against the same live `context7` server — one with `allowed_tools: ["resolve-library-id"]`, one unrestricted — and both called `query-docs` anyway. Fixed: `resolveRegistryMcpConfig` now takes a `declOverrides` param; the decl's `allowed_tools` intersects with the row's own restriction (if any), and a decl-level `label` override wins when set. 3 new tests (narrow-with-no-row-restriction, intersect-with-row-restriction, label-override) + updated the existing registry-mode `attachMcpTools` test for the new call signature. Re-verified live after restarting agent-runner: the narrowed agent called `resolve-library-id` six times running, never once called the excluded `query-docs`.
>
> **Also found + fixed in this pass (smaller):** `AgentcoreMcpServers.list()` sorted `visibility` ascending with a comment claiming "curated last" — ascending actually sorts curated *first* (`'curated' < 'private'` alphabetically). Fixed to descending so an org's own servers list before the platform catalog, matching the comment's original intent.
>
> **Comprehensive live flow-testing done after all of the above (2026-07-07), a full session, not a spot check:** a new kept agent bound to both curated servers, with 3 real scenarios proven end-to-end: (1) **multi-turn conversation chaining** via `previous_response_id` — asked about Svelte, then asked a follow-up referencing "that same framework" with no name given, twice, across separate runs; the model correctly resolved it from prior-turn context both times and answered accurately from a fresh real tool call each time; (2) **one run needing tools from both servers** — a compound question resolved via 4 real tool calls across DeepWiki and Context7 in sequence, both parts answered correctly; (3) **edit-takes-effect** — restricted a server's `allowed_tools` via the new PATCH route, and the very next run picked up the change with no restart (confirmed by the *absence* of the excluded tool across 6 calls, not just the presence of the allowed one); (4) **a live real DNS failure** (pointed a server at a genuinely nonexistent domain) — run completed normally, server silently skipped, restored afterward. One unrelated, transient failure surfaced during this pass: a single run failed with `persist run_step 4 failed: TypeError: fetch failed` — a Supabase network hiccup in `persistStep`'s own DB write (by design this throws rather than silently dropping a step, a prior fix from before this MCP work), not an MCP defect; retrying the identical request immediately succeeded.
>
> **BUILD STATUS (2026-07-07) — M4 follow-up: `mcp-schema-refresh` cron — ✅ SHIPPED, live-verified, no migration needed (writes into columns migration `20260707000002` already created).** Closes the gap the M4 block above flagged: `status`/`last_error` on a registered server were write-once at creation — nothing ever flipped a server to `'error'` when it actually went down, so the §7 scenario #13 promise ("customer sees it in the registry `last_error`") had no mechanism to ever become true. New `workers/agent-runner/src/tools/mcp-schema-refresh.ts` (`refreshAllMcpServers`/`refreshOne`): a service-role sweep over every non-`disabled` row in `agentcore.mcp_servers` (private + curated, no org filter — a maintenance job, not a request path), sequentially (not `Promise.all`, deliberately — a background sweep has no latency pressure and this avoids opening N concurrent connections to N untrusted remote servers at once) `connect()`+`listTools()`-ing each one and writing `status`/`last_error`/`tool_schemas`/`schemas_refreshed_at` back. Runs **inside agent-runner itself**, not a Next.js reaper route like session-reaper/run-reaper, because the MCP SDK only lives in agent-runner per §2b rule 4. Wired via a new `startMcpSchemaRefreshLoop()` in `index.ts` — fires once at boot (so status is fresh without waiting a full interval) then on a `setInterval` (`.unref()`'d, new `MCP_SCHEMA_REFRESH_INTERVAL_MS` env var, default 30 min, `0` disables the loop). Reuses the exact same frozen pieces the per-run adapter uses — `mcp-client.ts` (SDK wrapper), `mcp-crypto.ts` (decrypt-only), `ssrf.ts`'s `assertSafeWebhookUrl` (fail-closed on a private/loopback target, same `allowPrivate` dev escape hatch as the function-webhook tool) — and, per §2b rule 3, **does not touch `mcp.ts`/`mcp-attach.ts`/`mcp-registry.ts` at all**: this is a wholly separate, additive, out-of-band job, not a change to the per-run resolution path. A token-bearing row fails closed (marked `error`, `last_error: "no DEK configured..."`) if no DEK is configured, matching run-time resolution's existing posture — never attempts to guess or skip verification silently. 6 new tests in `mcp-schema-refresh.test.ts` (healthy server, unreachable server, SSRF-blocked private IP, no-DEK fail-closed, one-bad-server-doesn't-stop-the-sweep, list-query-failure-returns-zero-summary) — agent-runner now at 126 tests passing (8 skipped), zero regressions, full workspace `tsc --noEmit` clean. **Live-verified as a full round-trip against the real database**, not just unit tests: swept all 3 real registered servers (deepwiki, context7, deep) → `{checked: 3, ok: 3, failed: 0}`, real `tool_schemas` populated for each; broke the "deep" server's URL via a real `PATCH` → next sweep → `{checked: 3, ok: 2, failed: 1}`, DB row showing `status: "error", last_error: "fetch failed"`; restored the URL via `PATCH` → next sweep → back to `{checked: 3, ok: 3, failed: 0}`, `status: "active"`. **Explicitly still deferred, not part of this follow-up:** the other half of §4's original `tool_schemas` scope — using the cached `tool_schemas` as a run-time read to *skip* the per-run `connect()`+`listTools()` round-trip for registry-mode servers (the scalability optimization). `tool_schemas` is written by this cron but not yet read anywhere at run time; the adapter still connects fresh every run. This follow-up closes the correctness/status-visibility gap (§7 scenario #13) only.

This is the design we will follow to add **MCP** as the third agent plugin channel (after hosted tools and inline function webhooks). It is written to be **modular, simple to read, easy to extend, and easy to test**, and it reuses the existing tool seam rather than inventing new machinery. Every choice below is justified against how the codebase already works and against current MCP practice (see Research at the end).

---

## 1. Scope decision — MCP **client**, not MCP **hosting** (yet)

Doc 02's Service D is two things bundled: **(a)** an MCP *client* so an agent can call tools on an MCP server, and **(b)** MCP *hosting* — we run the customer's MCP server as a managed serverless container + private registry + always-on billing (`agentcore.mcp_servers`, `billing.active_agent_mcp`).

**We build (a) first, defer (b).**

| | MCP client (this plan) | MCP hosting (deferred) |
|---|---|---|
| What | Agent connects to a **remote MCP server URL** the customer provides, lists its tools, calls them during the loop | We host the customer's server container (deploy-runner → serverless), registry, always-on billing |
| Lift | One tool adapter (like `function.ts`) | New deployable path + `mcp_servers`/`active_agent_mcp` tables + grace lifecycle + registry UI |
| New infra | **None** (reuses runner + dispatcher + dispose + ssrf + metering) | Container hosting, always-on `active_*` billing, registry |
| Value | Agents use the entire MCP ecosystem (customer's own servers, public remote servers) | We operate the server too (convenience) |

**Why client-first is the right call:** modern MCP servers are reachable over **Streamable HTTP** (remote), so a client unlocks 90% of the value with ~5% of the work, on the exact tool-adapter pattern we already have. Hosting is a heavy, optional convenience layer that re-opens the container + always-on-billing surface — add it only if customers actually ask us to run their server. This mirrors the plan's own "cut complexity, reuse seams" stance (doc 11 §2).

**This build = MCP client runtime + a thin registry** (register a server once, bind by slug across agents, plus a curated catalog of vetted servers). The registry is what makes it a real *many-service, extensible* system — see §4. What's deferred: MCP **hosting** (we run the customer's container, §11) and the doc-08 revenue-share **marketplace** (sell agents/models) — both are separate, heavier concerns and out of scope here.

---

## 2. How it plugs into what exists (the seam)

MCP is **one more `AgentTool`**, resolved through the same registry + dispatcher every other tool uses. Nothing about the loop, runner, gateway, or billing changes shape.

```
agent.tools = [ {type:"web_search"}, {type:"mcp", server_url, auth?, ... } ]
                                              │
   buildDispatcher(decls, env, supabase, sandboxPool)   ← UNCHANGED (stays sync)
   await attachMcpTools(dispatcher, mcpDecls, deps)      ← NEW, additive (see §6)
                                              │
        ┌── static hosted tools (spec.ts HOSTED_TOOL_SPECS)  — unchanged
        ├── dynamic function webhooks (dynamicToolSpec)      — unchanged
        └── dynamic MCP  ← NEW: connect(server_url) → listTools() → advertise
                          each MCP tool becomes a normal entry in the dispatcher
                                              │
   loop: model sees MCP tool schemas alongside the rest →
         model calls "mcp__docs__search" → dispatcher.dispatch() →
         mcp adapter → client.callTool() → brand-scrub → ToolResult
                                              │
   run end: dispatcher.dispose()  ← NEW: also client.close() for each MCP server
                                     (the dispose() seam already exists for the sandbox)
```

**Reused, not rebuilt:**
- `tools/types.ts` `AgentTool` interface + `ToolResult` (`{output, metering, detail}`) — MCP returns the same shape.
- `spec.ts` registry `dynamicToolSpec()` — the `mcp` branch is currently `return null`; we fill it.
- `dispatch.ts` `buildDispatcher()` + `dispose()` — MCP connections are per-run and torn down in the existing `dispose()`, exactly like the sandbox pool.
- `ssrf.ts` `assertSafeWebhookUrl` / `isPrivateAddress` — reused verbatim to vet the server URL (and any redirect/discovery URL).
- `detail.ts` `preview()` + brand-scrub — every MCP result + tool description passes it.
- The metering pipeline (`reportToolUsage` → `/v1/agent-tool-usage` → `USAGE_EVENTS`) + a new `agent/mcp` catalog price row — so **billing later "just works"** with zero rework.

---

## 2b. Modularity & decoupling contract (the rule we do NOT break)

The build MUST stay a **DAG of small units, each meeting the next at exactly one typed interface** — never shared mutable state, never a cyclic import. This is what lets each part be built + unit-tested alone and keeps the codebase from turning into a mash. The seams:

| Interface (the boundary) | Decouples | Unit-tested in isolation with |
|---|---|---|
| `AgentTool` — `run(args, ctx) → ToolResult` | MCP adapter ↔ loop/dispatcher | a fake `dispatchTool` (no MCP knowledge in the loop) |
| `McpClient` — `connect / listTools / callTool / close` | our code ↔ `@modelcontextprotocol/sdk` | inject a **fake client**; an SDK upgrade touches ONE file (`mcp-client.ts`) |
| `ResolvedMcpConfig` — `{ url, token, label, allowed_tools }` | **where** config comes from (inline / registry) ↔ **how** it's used (adapter) | a plain object; the adapter never imports the registry |
| metering `unitLabel: "mcp_call"` | tool running ↔ tool priced/billed | a `priceStep` unit test |
| `/api/agents/mcp-servers` (HTTP contract) | UI/control-plane ↔ storage | UI against a mock; queries against a fake supabase |

**Enforced rules:**
1. **`buildDispatcher` stays sync and untouched.** MCP is added by a separate `await attachMcpTools(...)` — purely additive, and **removable by deleting one call + the mcp files** (the modularity litmus test: *can you cleanly delete it?* → yes).
2. **The adapter never imports the registry, the UI, or billing.** It receives a `ResolvedMcpConfig` and emits a `ToolResult` with a metering label. That's its whole contract.
3. **No stage may force a change to an earlier stage.** M3 (registry) produces the same `ResolvedMcpConfig` M1's inline mode already produces → M1 code is frozen once merged. If a later stage would require editing an earlier one, the interface was wrong — fix the interface, not by coupling.
4. **The SDK lives behind `mcp-client.ts` only.** No other file imports `@modelcontextprotocol/sdk`.
5. **Every unit ships with its own test that needs no network, no DB, no other stage.** (Registry queries → fake supabase; adapter → fake client; resolution → pure function; UI → mock API.)

If a change can't be made without touching two units across a seam, that's the signal the seam is leaking — stop and fix the boundary before adding code.

---

## 3. The one library we add

`@modelcontextprotocol/sdk` (official TypeScript SDK) in **`workers/agent-runner`** only. We use just the **client**:
- `Client` (high-level: `connect`, `listTools`, `callTool`, `close`)
- `StreamableHTTPClientTransport` (remote transport; supports custom `headers` for the customer's auth token)

We do **not** hand-roll the JSON-RPC/MCP wire protocol — that is exactly the kind of standardized-protocol work a library should own (per the earlier build-vs-framework call: adopt narrow protocol SDKs, not agent frameworks).

> Confirm the exact import subpath against the installed version (`@modelcontextprotocol/sdk/client/index.js` + `.../client/streamableHttp.js`, or the newer `@modelcontextprotocol/client` split). Pin the version in `package.json`.

---

## 4. Data model — a **registry**, so it supports many services (not a marketplace)

**The extensibility layer is a registry, not a per-agent URL.** Registering a server once and binding it by name across agents is what makes this a *proper, many-service system* — DRY config, one place to rotate a token, and a **curated catalog** of vetted servers customers enable in one click. This is doc 02 Service D's "private org registry + curated public registry of vetted connectors." It is **NOT** the doc-08 revenue-share *marketplace* (publish/sell agents + payouts) — that's a separate Phase-8 cluster and explicitly out of scope.

### Two binding modes — the adapter resolves the same shape from either

1. **Inline (quick / one-off):** `{type:"mcp", server_url, auth_token?, allowed_tools?}` in the agent's `tools` JSONB — no registration, good for testing a single server.
2. **Registry (reuse / many services):** `{type:"mcp", server_slug}` → resolved from `agentcore.mcp_servers` (URL + decrypted token + allowed_tools + cached schemas). **Register once, bind by slug in any agent.**

Both resolve to the same internal `{ url, token, label, allowed_tools }` that §12's adapter consumes — so the adapter is **agnostic to where config came from**, and the registry is a clean *additive* layer, not a rewrite.

```ts
// agent-core/src/types.ts  — one decl, two modes (exactly one of server_url | server_slug)
export interface McpToolDecl {
  type: "mcp";
  server_url?: string;    // inline mode (Streamable HTTP URL)
  server_slug?: string;   // registry mode → agentcore.mcp_servers row
  label?: string;         // namespaces this server's tools (a-z0-9_); defaults from host/slug
  auth_token?: string;    // inline-mode bearer token (registry mode stores it encrypted server-side)
  allowed_tools?: string[]; // bind only vetted tools; absent = all the server offers
}
```

### The registry table (one migration — control-plane metadata only)

Straight from doc 02 §4, **minus the hosting columns** (no `deployment_id` — client-first points at a remote URL, not a container we run):

```sql
CREATE TABLE IF NOT EXISTS agentcore.mcp_servers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID REFERENCES inference.orgs(id) ON DELETE CASCADE,  -- NULL = platform-curated
  slug          TEXT NOT NULL,                     -- bind key (org-unique, or global for curated)
  display_name  TEXT NOT NULL,
  server_url    TEXT NOT NULL,                     -- remote Streamable HTTP endpoint
  auth_token_enc BYTEA,                            -- encrypted (AES-256-GCM, lib/inference/crypto.ts)
  allowed_tools JSONB NOT NULL DEFAULT '[]',       -- org-level allowlist (agent decl can narrow further)
  visibility    TEXT NOT NULL DEFAULT 'private'
                CHECK (visibility IN ('private','curated')),  -- curated = platform-vetted catalog
  tool_schemas  JSONB NOT NULL DEFAULT '[]',       -- cached tools/list (refresh on register + cron)
  schemas_refreshed_at TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','error','disabled')),
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, slug)
);
-- RLS: members read own org (is_org_member) + all curated rows; service_role ALL. Same shape as agentcore.agents.
```

**Curated catalog** = platform-owned rows (`org_id = NULL`, `visibility='curated'`) for popular vetted servers (GitHub, Slack, Notion, Linear, …). Adding a new ready-to-use service = **inserting a row, zero code.** Customers one-click enable a curated server into an agent.

> **Scale the catalog, don't hand-maintain it.** Rather than typing rows forever, **seed the curated catalog from the official MCP registry** (`registry.modelcontextprotocol.io` — browse/search/filter by capability, machine-readable server metadata + tool definitions). A periodic sync job pulls vetted entries → `mcp_servers` rows (`visibility='curated'`), so "many services" grows with the ecosystem, not with our typing. This is the metaregistry pattern (Smithery/Docker/official registry are all metadata-only catalogs, not code) — we're a downstream consumer of it, not a re-implementation.

**`tool_schemas` cache = the scalability win.** The runner reads a server's tool list from the registry row (populated on register + refreshed by a cron), so it does **not** `connect()`+`listTools()` on every run — it only opens a connection when a tool is actually **called**. Refresh path mirrors the connector-scheduler pattern (doc 04).

> No `billing.active_agent_mcp` here — that's the always-on *hosting* charge; the client bills **per call** (`mcp_call`, §2), which needs no always-on table.

**Metering row (one small migration):** `agent/mcp` pseudo-catalog row with `cents_per_mcp_call` (PENDING_FINANCE), mirroring `20260703000002`. Plus `cents_per_mcp_call → "mcp_call"` in the runner's `TOOL_PRICE_KEY_TO_LABEL`. This is the "billing-later works" contract.

---

## 5. Security — the part that makes this "proper, not stupid"

MCP is a **new, larger attack surface** than function webhooks, because the *server itself is untrusted* and it controls **tool descriptions the model reads**. The 2026 MCP security guidance is explicit (see Research). We apply these, all client-side:

| Risk | Mitigation (client-side, in our adapter) |
|---|---|
| **SSRF** (server URL / OAuth-discovery URLs / redirects point at `169.254.169.254`, `10.x`, `localhost`, Redis, k8s API) | Run `assertSafeWebhookUrl(server_url)` (reuse `ssrf.ts`: blocks private/link-local/metadata, non-http(s) schemes, credentials-in-URL) **before connecting**. Enforce **HTTPS** in shared envs (`http://` only for loopback dev). Do **not** auto-follow redirects to internal targets. **Known residual: DNS rebinding (TOCTOU)** — validation resolves safe, request resolves internal; the real fix is a network **egress allowlist** on the runner pod (documented follow-up, same as the sandbox's prod-isolation gap). |
| **Tool poisoning** (malicious tool *description* carries hidden "ignore your instructions / exfiltrate X" directives that the model obeys) | Treat every `description`, `name`, and result as **untrusted**: brand-scrub + **hard-cap** description length (e.g. 1 KB) before advertising; **namespace** tool names (`mcp__{label}__{tool}`) so a server can't shadow a hosted tool like `code`; honor `allowed_tools` so the customer binds only what they vet; surface the server label in the trace so a human can see which server a step used. (We can't fully neutralize prompt-injection in a description the model must read — the customer *chose* this server; we make the choice explicit + auditable + scoped.) |
| **Token passthrough / confused deputy** | The `auth_token` is the **customer's** credential for **their** server — we pass only that, on that one transport. We **never** attach the platform key, service-role creds, or the on-behalf-of headers to an MCP call. No OAuth proxy/dynamic-registration in v1 (static customer token sidesteps the confused-deputy class entirely). |
| **Untrusted output** | Every `callTool` result is brand-scrubbed + size-capped (`preview`) before it reaches the model or `run_steps.detail`, same discipline as web_search/code. |
| **Secret leakage** | `auth_token` stored encrypted at rest (reuse the BYOK/`lib/inference/crypto.ts` pattern that function `secret` uses); never logged, never in `detail`; a test asserts it can't appear in the trace. |
| **Cost / DoS** | Per-call **timeout** (`toolTimeoutMs`), per-run `max_steps` + `max_cost_cents` already bound how many MCP calls happen; connect + `listTools` also timeout-bounded so a dead server can't hang run start. |

**Rule of thumb:** an MCP server is exactly as trusted as the customer who attached it — but its *output and descriptions* are always treated as hostile input. Scope (allowlist), cap, scrub, namespace, timeout, and make it visible in the trace.

---

## 6. Connection lifecycle & scalability

**Per-run connect, dispose at run end** — the same lifecycle the sandbox pool already uses:

1. **`buildDispatcher()` stays sync and untouched.** A separate, additive `await attachMcpTools(dispatcher, mcpDecls, deps)` does all MCP work — so the existing (tested) dispatcher path changes by **zero lines** and MCP is removable by deleting one call. For each `mcp` decl: resolve config (inline or registry) → `assertSafeWebhookUrl` → open the `McpClient` wrapper (timeout-bounded `connect`) → `listTools` (or read the registry's cached schemas) → register each (allow-listed, namespaced, scrubbed) tool into the dispatcher's map + `modelTools`. lifecycle already `await`s the runner brain, so awaiting one more step is trivial.
2. During the loop, `dispatch("mcp__label__tool")` → the bound MCP client's `callTool`.
3. `dispatcher.dispose()` (already called in lifecycle's `finally`) now also `client.close()` for each connected server.

**Failure isolation (best-effort, never fail the run):** if a server's `connect`/`listTools` fails or times out, we **skip that server** (its tools aren't advertised) and log — the run proceeds without it, exactly like `web_search` returning "not configured". One bad server never breaks the agent.

**Scalability path (documented, not built in v1):**
- **Tool-list caching** — `connect`+`listTools` at every run start adds latency. Cache `(server_url → tool schemas)` in CF KV / an in-process LRU with a short TTL (doc 02 called this the "MCP-binding hot cache"). Add when latency matters; the interface already isolates it.
- **Multiple servers per agent** — each connects independently; namespacing prevents collisions; N servers = N independent, isolated connections.
- **Connection reuse across runs** — v1 is connect-per-run (simple, stateless, no pool to leak). A pooled long-lived client is a later optimization behind the same adapter interface.
- **Horizontal** — nothing here is stateful in the runner beyond a run's lifetime, so `agent-runner` still scales by replicas exactly as today.
- **Aggregating gateway (the enterprise evolution).** At high scale the industry pattern (AWS Bedrock AgentCore Gateway) is a **managed gateway that fronts many MCP servers behind one endpoint** with centralized inbound+outbound auth, so the agent connects to *one* gateway instead of N servers. Our per-run-direct-connect is the simpler correct start; if concurrency/auth-management demands it, that gateway slots in **behind the same `McpClient` interface** — the adapter connects to our gateway URL instead of N URLs, nothing else changes. Documented direction, not v1.

---

## 7. Scenarios we design for (walk each, define the behavior)

| # | Scenario | Expected behavior |
|---|---|---|
| 1 | Agent has no `mcp` tool | Zero MCP work, zero cost — the block only runs when an `mcp` decl is present. |
| 2 | Healthy server, model calls a tool | connect → list → advertise; model calls `mcp__label__tool`; result scrubbed + fed back; billed 1 `mcp_call`; visible trace step. |
| 3 | Server down / connect times out | Skipped (best-effort), logged; run proceeds without those tools. Not a run failure. |
| 4 | `callTool` errors or times out mid-run | Returned as tool **output** (`{error}`), not thrown — model can react/try another tool (same as function). |
| 5 | Server returns a huge result | `preview()`-capped before model + `detail`; no unbounded payload in `run_steps`. |
| 6 | Malicious tool description (injection) | Scrubbed + length-capped; namespaced so it can't shadow `code`/`web_search`; customer's `allowed_tools` can exclude it; server label shown in trace. |
| 7 | `server_url` → internal IP / metadata / `localhost` | Rejected by `assertSafeWebhookUrl` before any connection. |
| 8 | Two servers expose a tool with the same name | No collision — namespaced `mcp__{label}__{tool}`; dispatcher maps back to the right (server, tool). |
| 9 | Server needs auth | `auth_token` → `Authorization: Bearer` on the transport; never logged; if it's wrong the call errors as output (#4). |
| 10 | ZDR org | MCP calls send data to a third party by definition — surface this in the UI when attaching; (optional) gate behind an org setting like memory's ZDR gate. **Open decision (§10).** |
| 11 | Server offers 200 tools | Cap the number advertised (e.g. first N + `allowed_tools`) so we don't blow the model's context / tool budget. |
| 12 | Runner crashes mid-run | No orphaned MCP connection survives (client is per-process, dies with it); no DB rows to reap (unlike the sandbox). |
| 13 | Server requires OAuth (not a static token) | v1: connect fails cleanly → server skipped (#3) with a clear "requires OAuth" status; the customer sees it in the registry `last_error`. Full OAuth is the M6-first follow-up (§10.2). |
| 14 | Tool result is an image / resource / binary (MCP `content[]`) | `flattenMcpResult` keeps text parts, replaces image/resource parts with a `[type omitted]` placeholder (never raw bytes into the model/trace); text is scrub+capped. |
| 15 | Server returns a malformed / huge `inputSchema` | We advertise a safe default (`{type:"object",properties:{}}`) if the schema is missing/unparseable; oversized schemas are not forwarded verbatim. |

---

## 8. Modular file layout (small, single-purpose, testable)

```
workers/agent-runner/src/tools/
  mcp.ts                 NEW  — the MCP client adapter: connect, list→advertise, callTool
  mcp-client.ts          NEW  — thin wrapper over @modelcontextprotocol/sdk (Client+transport),
                                so tests can inject a fake and we isolate the SDK in one place
  spec.ts                EDIT — dynamicToolSpec(): fill the `mcp` branch (was `return null`)
  mcp-attach.ts          NEW  — attachMcpTools(dispatcher, mcpDecls, deps): the ONE async step
                                (keeps buildDispatcher sync; MCP is purely additive/removable)
  dispatch.ts            EDIT — tiny: dispose() also closes MCP clients (register a disposer)
  __tests__/mcp.test.ts  NEW  — adapter tests against a fake MCP client (no network)

workers/agent-core/src/types.ts   EDIT — extend McpToolDecl (server_url, label, auth_token, allowed_tools)
workers/agent-runner/src/lifecycle.ts EDIT — await attachMcpTools (buildDispatcher stays SYNC); report mcp_call usage (reuse reportToolUsage)
workers/agent-runner/src/__tests__/mcp.integration.test.ts  NEW — L2: real client ↔ reference server (RUN_MCP_IT=1, Docker-gated)
supabase/migrations/2026XXXX_agent_mcp_pricing.sql  NEW — agent/mcp row (mcp_call, PENDING_FINANCE)
lib/agentcore/agent-schema.ts     EDIT — validate the mcp decl (Zod) — `mcp` is already a valid type here

# UI + API surface — see §12b for the stage-by-stage "what you can click" walkthrough
app/dashboard/services/agents/new/page.tsx        EDIT (M1) — "MCP servers (inline)" section, mirrors "Custom functions"
app/dashboard/services/agents/[id]/page.tsx       EDIT (M1) — same section on the edit view; trace renders mcp steps for free
app/dashboard/services/agents/_constants.ts       EDIT (M1) — McpDef/emptyMcp()/buildMcpTools(), mirrors FnDef/buildFunctionTools()
app/api/agents/mcp-servers/route.ts + [id]/route.ts  NEW (M3) — CRUD, mirrors app/api/inference/byok-keys/route.ts (encryptAesGcm)
app/dashboard/services/agents/mcp-servers/page.tsx   NEW (M4) — management screen, mirrors app/dashboard/services/inference/byok-keys/page.tsx
```

**Why a separate `mcp-client.ts`:** it quarantines the one external SDK behind a 20-line interface (`connect(url, headers) → { listTools(), callTool(name,args), close() }`). The adapter (`mcp.ts`) and its tests depend on that interface, not the SDK — so unit tests inject a fake, and an SDK upgrade touches one file.

---

## 9. Staged delivery (each stage shippable + testable on its own)

| Stage | Scope | Test (isolated) |
|---|---|---|
| **M1 — adapter core** ✅ SHIPPED (runtime + first clickable UI) | `mcp-client.ts` wrapper + `mcp.ts` adapter (resolve config → connect, list→namespace/scrub/allowlist, callTool, timeout, errors-as-output) + `spec.ts` wiring + `mcp-attach.ts` (`attachMcpTools`, **`buildDispatcher` stays sync**) + `dispose` closes clients. Works with **inline** decls first, plus a minimal builder UI section (mirrors "Custom functions") so it's demoable, not just testable — see §12b. | `mcp.test.ts` with a **fake MCP client**: lists tools → advertised namespaced; call → result scrubbed + metered; server error → output error; SSRF url → rejected; auth token never in output. No network. |
| **M2 — metering** ✅ SHIPPED | `agent/mcp` pricing migration + `TOOL_PRICE_KEY_TO_LABEL` + `reportToolUsage` for `mcp_call` | assert an mcp step prices > 0 toward the ceiling + emits a `UsageEvent` (same as other tools). |
| **M3 — registry** ✅ SHIPPED (the many-service layer) | `agentcore.mcp_servers` migration (+ RLS) · `/api/agents/mcp-servers` CRUD (register/list/delete, encrypt token) · slug→config resolution in the runner · builder gains a "saved servers" dropdown (§12b). **Deferred to M4**: `tool_schemas` populate-on-register + a `mcp-schema-refresh` cron — M3 resolves fresh from the registry row's URL/token every run, same connect-per-run lifecycle as inline mode; the cache is a scalability optimization, not a correctness requirement. | queries + resolution tests (org-scoped/curated visibility, token never returned in reads, fail-closed with no DEK) — `mcp-registry.test.ts` + `mcp.test.ts`'s registry-mode `attachMcpTools` cases. |
| **M4 — curated catalog + management screen** ✅ SHIPPED (migration pending apply) | seed 2 `visibility='curated'` rows (DeepWiki, Context7 — both live-verified, not GitHub/Slack/Notion as first sketched) · **NEW** `mcp-servers/page.tsx` management screen (mirrors `byok-keys/page.tsx`: list, status, delete). **Not built**: a separate curated-catalog tab with its own "one-click enable" action (the picker already does this) — see the BUILD STATUS banner above for the exact diff. | render tests not written (no component-test harness exists for this page in the repo — verified via a real page load returning 200 + live register/list/delete through the actual API instead). |
| **M5 — live verify** (informal parts done, formal artifact not) | a real remote MCP server via the registry attached to a test agent; run through the real stack | **Manually done, repeatedly, against two real third-party servers** (registered → resolved by slug → real `callTool` → trace step → `cost_cents` on the row) — but the dedicated **L2 Docker-gated integration test** (`mcp.integration.test.ts`, §8/§9b) was never created, so this proof isn't a repeatable, automated regression test yet, just verified-by-hand this session. |
| **M6 (optional, later)** | connection pooling · MCP **hosting** (§11, run the customer's container) · OAuth 2.1 instead of static token · publish-to-marketplace (doc 08) | — |

**Critical path M1 → M2 → M3 → M4 → M5.** M1 (inline mode) is a fully unit-tested, mergeable slice on its own; M3 turns it into the extensible many-service system.

---

## 9b. Usability & test strategy — proving it actually **works**, not just connects

Unit tests prove our *logic*; they do **not** prove the feature is *usable*. A client that connects but the model never calls, or that breaks on a real server's response shape, is worthless. So we test in **four layers**, each cheap because it reuses infra we already have. This is how the MCP ecosystem itself tests (the MCP **Inspector** is "Postman for MCP"; the SDK ships an integration-test client).

| Layer | Proves | How | Runs in |
|---|---|---|---|
| **L1 — Unit** | our adapter logic: namespacing, description scrub + cap, `allowed_tools`, errors-as-output, SSRF reject, auth-token never in trace | `mcp.test.ts` with a **fake `McpClient`** — no network, no DB | CI (always) |
| **L2 — Protocol integration** | our `mcp-client.ts` **actually speaks MCP** (`initialize` → `tools/list` → `tools/call` over Streamable HTTP) against a **real** server — catches real response shapes (`content[]`, `isError`, resources) a fake can't | run the real client against a **reference server** (`@modelcontextprotocol/server-everything` or a filesystem server) in a container. **Opt-in + Docker-gated** (`RUN_MCP_IT=1`), skips where Docker is absent — same pattern as `sandbox.integration.test.ts` | CI-optional / pre-merge |
| **L3 — MCP Inspector** | a **curated-catalog** server is healthy + its live tools/schemas still match our cached `tool_schemas` | `npx @modelcontextprotocol/inspector` interactively during dev; **`--cli` smoke check in the schema-refresh cron / CI** over curated servers → mark `status='error'` on drift | dev + cron |
| **L4 — Agent-level eval** ⭐ | the **model** discovers the MCP tool, calls it with correct args, and **uses the result** to finish a task — *this is "actual usability"* | **reuse the Phase-4 evals service**: a small dataset of tasks that require a specific MCP tool (e.g. "what's the latest commit on repo X" → GitHub MCP), scored on task success. Regression-guards that a model+server combo actually works end to end | on demand / pre-release |

**L2 and L4 are the ones that answer "is it usable."** L2 = works against real servers (not a fake); L4 = a real model uses it well. Both reuse patterns you already ship (Docker-gated IT; the evals service).

**Human acceptance checklist (the manual gate before enabling a curated server for customers):**
1. Register/enable the server → the agent builder lists its tools (names + descriptions render, scrubbed).
2. Run a task in the **playground** that needs that tool.
3. Trace shows a real `mcp__label__tool` step with the actual call args + result (expandable `detail`).
4. The final answer **actually used** the tool's result (not a hallucination).
5. Kill the server mid-way → the run **degrades gracefully** (tool errors as output, run still completes), not a hang or crash.
6. Confirm the auth token appears **nowhere** in the trace, logs, or usage rows.

If all six hold for a server, it's usable and safe to add to the curated catalog.

---

## 10. Decisions (locked 2026-07-07 — recommended defaults, revisit if reality disagrees)

1. **ZDR + MCP → allow + prominent UI warning for v1.** An MCP call ships the agent's data to a third-party server; a hard org-level gate (like memory's ZDR gate) is a fast-follow if it turns out customers need it, not a v1 blocker.
2. **Auth model → static customer bearer token for M1–M5.** Simple, unblocks most servers now, sidesteps the confused-deputy class entirely. **OAuth 2.1 + Protected Resource Metadata is the M6-first follow-up**, not "someday" — the 2026 ecosystem made it table-stakes (AWS AgentCore's 3 flows; Cloudflare's zero-config OAuth 2.1). OAuth discovery URLs are themselves an SSRF vector (§5) — the same URL guard applies to PRM/discovery/redirect fetches when M6 lands.
3. **Tool budget → cap ~20 tools per server**, honor `allowed_tools` to narrow further.
4. **HTTPS enforcement → hard-required** in staging/prod; `http://localhost` allowed only in dev.

---

## 11. Leaving room for hosting (Service D part b) — not built now

If we later host customer MCP servers: add `agentcore.mcp_servers` (slug, deployment_id, endpoint_url, tool_schemas cache) + `billing.active_agent_mcp` (always-on per-hour, grace lifecycle) per doc 02 §4, deploy via the existing deploy-runner → serverless path, and a `{type:"mcp", server_slug}` decl resolves the slug → an internal `endpoint_url` and then **flows through the exact same `mcp.ts` adapter** (client to our own hosted endpoint). So the client we build now is the substrate hosting reuses — nothing thrown away.

---

## 12. Code sketch — the adapter (simple, human-readable)

```ts
// workers/agent-runner/src/tools/mcp.ts  (M1)
import type { AgentTool, RunCtx, ToolResult } from "@ahura/agent-core";
import { assertSafeWebhookUrl } from "./ssrf.js";
import { preview } from "./detail.js";
import { openMcpClient, type McpClient } from "./mcp-client.js"; // wraps the SDK

const DESC_CAP = 1024;
const MAX_TOOLS_PER_SERVER = 20;
const sanitizeLabel = (s: string) => s.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 24);

/** One MCP server → a set of AgentTools (already namespaced). Connect + list happen
 *  here (async, at dispatcher build). Returns [] on any failure (best-effort). */
export async function connectMcpTools(
  decl: { server_url: string; label?: string; auth_token?: string; allowed_tools?: string[] },
  opts: { timeoutMs: number; requireHttps: boolean },
): Promise<{ tools: Array<{ name: string; description: string; parameters: object; tool: AgentTool }>; client: McpClient | null }> {
  try {
    await assertSafeWebhookUrl(decl.server_url); // SSRF + scheme guard (+ https in prod via opts)
    const label = sanitizeLabel(decl.label ?? new URL(decl.server_url).host);
    const client = await openMcpClient(decl.server_url, decl.auth_token, opts.timeoutMs);
    const listed = await client.listTools();
    const allow = decl.allowed_tools?.length ? new Set(decl.allowed_tools) : null;

    const tools = listed
      .filter((t) => (allow ? allow.has(t.name) : true))
      .slice(0, MAX_TOOLS_PER_SERVER)
      .map((t) => ({
        name: `mcp__${label}__${t.name}`,                       // namespaced, collision-free
        description: preview(t.description ?? "", DESC_CAP),      // untrusted → scrub + cap
        parameters: t.inputSchema ?? { type: "object", properties: {} },
        tool: mcpCallTool(client, t.name, opts.timeoutMs),
      }));
    return { tools, client };
  } catch {
    return { tools: [], client: null }; // one bad server never fails the run
  }
}

/** MCP tool results are a STRUCTURED array — { content: [{type:'text'|'image'|'resource', ...}],
 *  isError?: boolean } — NOT a plain string (a fake can hide this; L2/real servers surface it).
 *  Flatten text parts, note non-text parts, honor isError. */
function flattenMcpResult(result: { content?: Array<{ type: string; text?: string }>; isError?: boolean }): { text: string; isError: boolean } {
  const parts = (result?.content ?? []).map((c) =>
    c.type === "text" ? (c.text ?? "") : `[${c.type} omitted]`   // images/resources → placeholder, not raw bytes
  );
  return { text: parts.join("\n"), isError: result?.isError === true };
}

function mcpCallTool(client: McpClient, toolName: string, timeoutMs: number): AgentTool {
  return {
    type: "mcp",
    async run(args: unknown): Promise<ToolResult> {
      try {
        const raw = await client.callTool(toolName, args, timeoutMs);
        const { text, isError } = flattenMcpResult(raw);
        const out = preview(text, 4000);                          // untrusted output → scrub + cap
        return {
          // A tool-level error (isError) is fed back as output, not thrown — the model can react.
          output: isError ? { error: out } : { result: out },
          metering: { units: 1, unitLabel: "mcp_call" },          // billed even on tool-error (work happened)
          detail: { tool: toolName, status: isError ? "error" : "ok", output: out },
        };
      } catch (e) {
        // Transport/timeout failure (not a tool-level error): no work billed.
        return { output: { error: `mcp call failed: ${e instanceof Error ? e.message : String(e)}` },
                 metering: { units: 0, unitLabel: "mcp_call" } };
      }
    },
  };
}
```

The `dispatcher` collects each server's `tools` into its name→executor map + `modelTools`, keeps the `client`s, and `dispose()` calls `client.close()` on each. That's the whole feature: **one adapter, one thin SDK wrapper, one registry branch, one metering row.**

---

## 12b. UI & API surface — what you can click, and when

Every stage should be **visible**, not just green in CI — you should be able to open the dashboard and see MCP working as each stage lands, not wait until M4 for the first clickable thing. Nothing here is a new UI paradigm; every screen mirrors a pattern that already ships.

| Stage | UI screen | API route | What you click through to see it work |
|---|---|---|---|
| **M1** | Agent builder gets a new **"MCP servers (inline)"** section in `app/dashboard/services/agents/new/page.tsx` (+ `[id]/page.tsx`) — a repeatable-row block that mirrors the existing **"Custom functions"** section 1:1 (`server_url`, `auth_token`, optional `allowed_tools`), driven by a new `McpDef` / `emptyMcp()` / `buildMcpTools()` in `_constants.ts` (mirrors `FnDef`/`buildFunctionTools()`). | None new — inline decls save through the **existing** agent create/update route (`tools` JSONB), same as `function` tools today. | Add a public reference MCP server URL to an agent → run a task in the **playground** → expand the trace step. The generic `detailRows()` renderer already orders `args`/`output` first, so an `mcp` step's `detail:{tool,status,output}` renders with **zero trace-UI changes**. **This is the first "it's alive" moment — it ships in M1, not M4.** |
| **M2** | No UI change. | No new route. | The same trace step now shows a real `cost_cents` — the existing per-step cost line is already generic, nothing to add. |
| **M3** | Builder's MCP section gains a **"saved servers"** dropdown next to the inline fields (pick a registered `slug` instead of typing a URL each time) — same section, additive, not a new screen. | **NEW** `app/api/agents/mcp-servers/route.ts` (+ `[id]/route.ts`) — CRUD, mirrors `app/api/inference/byok-keys/route.ts` line-for-line: Zod validate → org-scope (`getOrBootstrapOrgForUser`, `canWrite`) → `encryptAesGcm(auth_token, BYOK_DEK)` via `lib/inference/crypto.ts` → store ciphertext → **mask on every read** (never return plaintext) → `AuditLogService.create`. | Register a server once → bind it by slug in **two different agents** → both show it in their builder dropdown. Proves "register once, reuse many" actually works, not just in theory. |
| **M4** | **NEW** `app/dashboard/services/agents/mcp-servers/page.tsx` — a management screen copied wholesale from `app/dashboard/services/inference/byok-keys/page.tsx` (`DataTable` + register `Dialog` + status badge `active/error/disabled` + delete `AlertDialog`), plus a **curated catalog** tab (one-click enable a vetted server). | Same M3 routes; catalog rows are just `visibility='curated'` reads — no new route. | Open the management screen, see every registered server's live `status`/`last_error` at a glance, one-click-enable a curated server (GitHub/Slack/…) into an agent — the "many-service, extensible" promise made literally clickable. |
| **M5** | No new UI. | No new route. | The full loop end to end through the screens above — this is the §9b human acceptance checklist, now backed by real screens instead of curl/SQL. |

**Trace UI polish (optional, not blocking):** `TraceTimeline`'s `StepIcon` helper only special-cases `web_search`/`model` today, falling back to a generic wrench icon — everything else, including `mcp`, already renders correctly via the generic detail-rows path. Adding an `mcp` case (icon + server-label badge) is a 3-line cosmetic touch, not a functional requirement — a nice-to-have at M4, not a blocker for M1.

**Why UI lands at M1, not M4:** deferring all UI to M4 (the original plan) meant three stages of backend-only work with nothing clickable. Moving the **inline-mode form** into M1 — it's the same "Custom functions"-shaped block, a small copy-adapt — means the very first merged stage is already demoable end-to-end: add a server, run it, see the trace. M3/M4 then upgrade the *same* section from "type a URL" to "pick from a list" to "manage a catalog" — each additive, none a rewrite (the §2b contract again: a later stage extends the UI, it never forces the earlier stage's UI to be redone).

---

## 13. Research basis (why the above)

- **SDK / transport:** the official `@modelcontextprotocol/sdk` `Client` + `StreamableHTTPClientTransport` is the standard way to reach a **remote** MCP server; custom `Authorization` headers pass through the transport; `listTools`/`callTool`/`close` are the client surface. Remote = Streamable HTTP.
- **Security (2026):** MCP's own Security Best Practices + industry guidance flag, for *clients* specifically: **SSRF** on server/discovery/redirect URLs (block private ranges + metadata, enforce HTTPS, beware DNS-rebinding TOCTOU → egress proxy is the real fix), **tool poisoning** via untrusted descriptions (treat name/description/output as hostile), **token passthrough / confused deputy** (never forward the wrong credential; static per-server token avoids the OAuth-proxy class in v1), and **scope minimization**. A 2026 audit found 40% of MCP servers require no auth, 43% carry command-injection, 79% handle creds in plaintext — i.e. *the server is untrusted*, which is the assumption baked into §5.

**Sources:**
- [MCP TypeScript SDK (GitHub)](https://github.com/modelcontextprotocol/typescript-sdk)
- [@modelcontextprotocol/sdk (npm)](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
- [MCP Security Best Practices (modelcontextprotocol.io)](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices)
- [OWASP MCP Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html)
- [MCP Security Risks & Best Practices (TrueFoundry)](https://www.truefoundry.com/blog/mcp-security-risks-best-practices)
