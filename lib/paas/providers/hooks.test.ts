import { test } from "node:test";
import assert from "node:assert/strict";
import { planHook, ensureHook, type ExistingHook, type HookSpec } from "./hooks.ts";

const SPEC: HookSpec = { url: "https://app.example.com/api/v2/webhooks/gitlab", secret: "whsec" };
const hook = (over: Partial<ExistingHook> = {}): ExistingHook => ({
  id: "1",
  url: SPEC.url,
  active: true,
  ...over,
});

// ── the decision ────────────────────────────────────────────────────────────

test("no hook pointing at us means create one", () => {
  assert.deepEqual(planHook([], SPEC), { create: true });
  assert.deepEqual(planHook([hook({ url: "https://someone-else.example/hook" })], SPEC), { create: true });
});

test("a working hook is left alone", () => {
  const p = planHook([hook()], SPEC);
  assert.equal(p.create, false);
  assert.equal(p.outcome?.action, "already-present");
});

test("a trailing slash does not create a second hook", () => {
  // Providers normalise URLs inconsistently. A mismatch on a slash means every
  // push is delivered twice, which is two builds of one commit.
  assert.equal(planHook([hook({ url: `${SPEC.url}/` })], SPEC).create, false);
  assert.equal(planHook([hook({ url: SPEC.url.toUpperCase() })], SPEC).create, false);
  assert.equal(planHook([hook({ url: `${SPEC.url}?x=1` })], SPEC).create, false);
});

test("a DISABLED hook is reported, never joined by a second one", () => {
  // Adding another would deliver every push twice the moment someone re-enables
  // the first.
  const p = planHook([hook({ active: false })], SPEC);
  assert.equal(p.create, false);
  assert.equal(p.outcome?.action, "needs-attention");
  assert.match(p.outcome?.action === "needs-attention" ? p.outcome.detail : "", /disabled/);
});

test("duplicate hooks are reported with the count", () => {
  const p = planHook([hook({ id: "1" }), hook({ id: "2" })], SPEC);
  assert.equal(p.create, false);
  assert.equal(p.outcome?.action, "needs-attention");
  assert.match(p.outcome?.action === "needs-attention" ? p.outcome.detail : "", /delivered 2 times/);
});

test("a disabled duplicate alongside a live one still reports the duplication", () => {
  const p = planHook([hook({ id: "1", active: false }), hook({ id: "2", active: true })], SPEC);
  assert.equal(p.outcome?.action, "needs-attention");
});

// ── the calls ───────────────────────────────────────────────────────────────

function stub(replies: Array<{ status?: number; body?: unknown }>) {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  let i = 0;
  const fetcher = async (url: string, init?: { method?: string; body?: string }) => {
    calls.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body) : null });
    const r = replies[Math.min(i++, replies.length - 1)];
    return {
      ok: (r.status ?? 200) < 400,
      status: r.status ?? 200,
      json: async () => r.body,
      text: async () => JSON.stringify(r.body ?? ""),
    };
  };
  return { fetcher, calls };
}

test("gitlab: an absent hook is created with push events only", async () => {
  const { fetcher, calls } = stub([{ body: [] }, { body: { id: 99 } }]);
  const out = await ensureHook("gitlab", { token: "t", fullName: "g/p", spec: SPEC }, fetcher);
  assert.deepEqual(out, { action: "created", id: "99" });

  const created = calls[1];
  assert.equal(created.method, "POST");
  const b = created.body as Record<string, unknown>;
  assert.equal(b.push_events, true);
  // A hook subscribed to more than it needs delivers payloads the receiver
  // refuses, which fills the provider's failure log and gets it auto-disabled.
  assert.equal(b.merge_requests_events, false);
  assert.equal(b.tag_push_events, false);
  assert.equal(b.pipeline_events, false);
});

test("gitlab: TLS verification is set explicitly, not left to the default", async () => {
  // The field someone turns off while debugging a certificate and never turns
  // back on — at which point the webhook secret travels to whoever answers on
  // that hostname.
  const { fetcher, calls } = stub([{ body: [] }, { body: { id: 1 } }]);
  await ensureHook("gitlab", { token: "t", fullName: "g/p", spec: SPEC }, fetcher);
  assert.equal((calls[1].body as Record<string, unknown>).enable_ssl_verification, true);
});

test("gitlab: the secret is sent as `token`", async () => {
  const { fetcher, calls } = stub([{ body: [] }, { body: { id: 1 } }]);
  await ensureHook("gitlab", { token: "t", fullName: "g/p", spec: SPEC }, fetcher);
  assert.equal((calls[1].body as Record<string, unknown>).token, "whsec");
});

test("gitlab: a disabled_until value means the hook is not active", async () => {
  // GitLab disables a failing hook with a timestamp rather than a boolean, so
  // an absent field is the healthy case and a present one must not read as OK.
  const { fetcher } = stub([{ body: [{ id: 5, url: SPEC.url, disabled_until: "2026-09-01T00:00:00Z" }] }]);
  const out = await ensureHook("gitlab", { token: "t", fullName: "g/p", spec: SPEC }, fetcher);
  assert.equal(out.action, "needs-attention");
});

test("gitlab: a namespaced path is URL-encoded whole", async () => {
  const { fetcher, calls } = stub([{ body: [hook()] }]);
  await ensureHook("gitlab", { token: "t", fullName: "group/sub/proj", spec: SPEC }, fetcher);
  assert.match(calls[0].url, /\/projects\/group%2Fsub%2Fproj\/hooks/);
});

test("gitlab: a self-hosted host is used for both calls", async () => {
  const { fetcher, calls } = stub([{ body: [] }, { body: { id: 1 } }]);
  await ensureHook("gitlab", { host: "https://git.example.com", token: "t", fullName: "g/p", spec: SPEC }, fetcher);
  assert.ok(calls.every((c) => c.url.startsWith("https://git.example.com/api/v4")));
});

test("bitbucket: the secret MUST be sent or no signature ever arrives", async () => {
  // Without it Bitbucket sends no signature header at all, the receiver refuses
  // every delivery, and the hook looks configured while never deploying.
  const { fetcher, calls } = stub([{ body: { values: [] } }, { body: { uuid: "{h}" } }]);
  const out = await ensureHook("bitbucket", { token: "t", fullName: "w/r", spec: SPEC }, fetcher);
  assert.deepEqual(out, { action: "created", id: "{h}" });
  const b = calls[1].body as Record<string, unknown>;
  assert.equal(b.secret, "whsec");
  assert.deepEqual(b.events, ["repo:push"]);
  assert.equal(b.active, true);
});

test("bitbucket: an existing hook is not duplicated", async () => {
  const { fetcher, calls } = stub([{ body: { values: [{ uuid: "{h}", url: SPEC.url, active: true }] } }]);
  const out = await ensureHook("bitbucket", { token: "t", fullName: "w/r", spec: SPEC }, fetcher);
  assert.deepEqual(out, { action: "already-present", id: "{h}" });
  assert.equal(calls.length, 1, "no POST was made");
});

test("neither provider ever deletes or edits", async () => {
  // This platform is writing to a repository it does not own. "Make it match
  // what I expect" would remove a customer's own CI hook for not being
  // recognised; "add what is missing" cannot.
  const { fetcher, calls } = stub([
    { body: [{ id: 7, url: "https://customers-own-ci.example/hook" }] },
    { body: { id: 8 } },
  ]);
  await ensureHook("gitlab", { token: "t", fullName: "g/p", spec: SPEC }, fetcher);
  assert.ok(calls.every((c) => c.method === "GET" || c.method === "POST"));
  assert.ok(!calls.some((c) => c.method === "DELETE" || c.method === "PUT"));
});

test("a list failure throws rather than creating a duplicate", async () => {
  // Treating an unreadable list as empty would add a second hook to a
  // repository that already has one, every time the API is briefly down.
  const { fetcher } = stub([{ status: 500, body: {} }]);
  await assert.rejects(() => ensureHook("gitlab", { token: "t", fullName: "g/p", spec: SPEC }, fetcher), /500/);
});

test("a create that returns no id is an error, not a silent success", async () => {
  const { fetcher } = stub([{ body: [] }, { body: {} }]);
  await assert.rejects(() => ensureHook("gitlab", { token: "t", fullName: "g/p", spec: SPEC }, fetcher), /no id/);

  const bb = stub([{ body: { values: [] } }, { body: {} }]);
  await assert.rejects(() => ensureHook("bitbucket", { token: "t", fullName: "w/r", spec: SPEC }, bb.fetcher), /no uuid/);
});

test("neither the token nor the secret appears in an error", async () => {
  const { fetcher } = stub([{ status: 403, body: { message: "forbidden" } }]);
  await assert.rejects(
    () => ensureHook("gitlab", { token: "SECRET-TOKEN", fullName: "g/p", spec: SPEC }, fetcher),
    (e: Error) => !e.message.includes("SECRET-TOKEN") && !e.message.includes("whsec"),
  );
});
