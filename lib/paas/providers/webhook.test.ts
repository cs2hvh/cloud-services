import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import * as gitlab from "../gitlab/webhook.ts";
import * as bitbucket from "../bitbucket/webhook.ts";
import { mergeListings, listingIsComplete, isGitProvider, type ProviderListing } from "./types.ts";

const SECRET = "s3cr3t-token-value";
const SHA = "a".repeat(40);
const ZERO = "0".repeat(40);

// ── GitLab: token comparison ────────────────────────────────────────────────

test("gitlab accepts the exact token", () => {
  assert.deepEqual(gitlab.verifyToken("{}", SECRET, SECRET), { ok: true });
});

test("gitlab refuses a wrong token as mismatch", () => {
  assert.deepEqual(gitlab.verifyToken("{}", "wrong-but-same-len!", SECRET), { ok: false, reason: "mismatch" });
});

test("a wrong-LENGTH token is mismatch, not bad-format", () => {
  // Length leaks from any comparison, but the RESPONSE should not confirm it —
  // a distinct reason code tells a prober when they have the length right.
  assert.deepEqual(gitlab.verifyToken("{}", "short", SECRET), { ok: false, reason: "mismatch" });
});

test("gitlab with NO configured secret is a hard failure, never a pass", () => {
  // The most common way this endpoint gets left open: an unset env var in one
  // environment turning verification into a no-op.
  assert.deepEqual(gitlab.verifyToken("{}", SECRET, undefined), { ok: false, reason: "no-secret" });
  assert.deepEqual(gitlab.verifyToken("{}", SECRET, ""), { ok: false, reason: "no-secret" });
  assert.deepEqual(gitlab.verifyToken("{}", SECRET, "   "), { ok: false, reason: "no-secret" });
});

test("a missing token header is refused", () => {
  assert.deepEqual(gitlab.verifyToken("{}", null, SECRET), { ok: false, reason: "no-signature" });
});

test("gitlab's token authenticates ANY body — the asymmetry, asserted", () => {
  // Not a defect in our code; it is what GitLab's design proves and does not
  // prove. Asserting it keeps the docblock honest: if someone later "upgrades"
  // this to an HMAC, this test fails and makes them read why.
  const a = gitlab.verifyToken('{"object_kind":"push"}', SECRET, SECRET);
  const b = gitlab.verifyToken('{"totally":"different"}', SECRET, SECRET);
  assert.deepEqual(a, b, "the same token verifies both bodies, because it is not computed over either");
});

// ── GitLab: push parsing ────────────────────────────────────────────────────

function gitlabPush(over: Record<string, unknown> = {}) {
  return {
    object_kind: "push",
    ref: "refs/heads/main",
    after: SHA,
    user_username: "pusher",
    project: { id: 42, path_with_namespace: "group/sub/proj", default_branch: "main" },
    commits: [
      { id: "b".repeat(40), message: "older", author: { name: "First" } },
      { id: SHA, message: "newest", author: { name: "Last" } },
    ],
    ...over,
  };
}

test("gitlab parses a push into the normalised shape", () => {
  const e = gitlab.parsePushEvent(gitlabPush());
  assert.equal(e?.provider, "gitlab");
  assert.equal(e?.repoFullName, "group/sub/proj");
  assert.equal(e?.branch, "main");
  assert.equal(e?.sha, SHA);
  assert.equal(e?.deleted, false);
});

test("gitlab's commits are oldest-first, so the head is the LAST one", () => {
  // commits[0] is what a reader used to GitHub's head_commit reaches for, and
  // it is the wrong commit — wrong message, wrong author.
  const e = gitlab.parsePushEvent(gitlabPush());
  assert.equal(e?.message, "newest");
});

test("the pusher wins over the commit author", () => {
  const e = gitlab.parsePushEvent(gitlabPush());
  assert.equal(e?.author, "pusher", "matches GitHub, where author is the account that triggered the event");

  const noPusher = gitlab.parsePushEvent(gitlabPush({ user_username: undefined }));
  assert.equal(noPusher?.author, "Last", "falls back to the head commit's author");
});

test("an all-zero after is a deletion, not a commit to build", () => {
  const e = gitlab.parsePushEvent(gitlabPush({ after: ZERO }));
  assert.equal(e?.deleted, true);
  assert.equal(e?.sha, ZERO, "reported as-is rather than nulled, so the caller can see why");
});

test("a tag push is parsed but carries no branch", () => {
  const e = gitlab.parsePushEvent(gitlabPush({ ref: "refs/tags/v1.0.0" }));
  assert.equal(e?.branch, null, "a tag deployed as a branch would build the wrong ref");
});

test("gitlab refuses payloads that are not pushes", () => {
  // Merge requests, issues and pipeline events arrive at the same URL.
  assert.equal(gitlab.parsePushEvent({ ...gitlabPush(), object_kind: "merge_request" }), null);
  assert.equal(gitlab.parsePushEvent({ ...gitlabPush(), object_kind: undefined }), null);
});

test("gitlab refuses a malformed sha rather than deploying a guess", () => {
  assert.equal(gitlab.parsePushEvent(gitlabPush({ after: "not-a-sha" })), null);
  assert.equal(gitlab.parsePushEvent(gitlabPush({ after: 12345 })), null);
});

test("the project id becomes a STRING connection id", () => {
  // Numeric on GitLab, a UUID on Bitbucket. One column, so text everywhere.
  const e = gitlab.parsePushEvent(gitlabPush());
  assert.equal(e?.connectionId, "42");
  assert.equal(typeof e?.connectionId, "string");
});

test("the default branch is read, never guessed as main", () => {
  assert.equal(gitlab.defaultBranchFrom(gitlabPush()), "main");
  // A guessed production branch decides production-vs-preview, and guessing it
  // wrong puts a feature branch on the customer's live hostname.
  assert.equal(gitlab.defaultBranchFrom(gitlabPush({ project: { id: 1, path_with_namespace: "a/b" } })), null);
  assert.equal(gitlab.defaultBranchFrom({}), null);
});

// ── Bitbucket: signature ────────────────────────────────────────────────────

const sign = (body: string, secret = SECRET) =>
  `sha256=${createHmac("sha256", secret).update(Buffer.from(body, "utf8")).digest("hex")}`;

test("bitbucket verifies an HMAC over the raw body", () => {
  const body = '{"push":{"changes":[]}}';
  assert.deepEqual(bitbucket.verifySignature(body, sign(body), SECRET), { ok: true });
});

test("bitbucket's signature is bound to the body, unlike gitlab's token", () => {
  // The distinction the two modules exist to keep visible.
  const body = '{"a":1}';
  assert.deepEqual(bitbucket.verifySignature('{"a":2}', sign(body), SECRET), { ok: false, reason: "mismatch" });
});

test("a re-serialised body computes a different digest", () => {
  // Why the raw bytes matter: a verifier that re-serialises rejects everything
  // — and then gets "fixed" by someone skipping the check.
  //
  // WHITESPACE, not key order. Key order survives a JS round-trip for string
  // keys, so the obvious demonstration does not demonstrate anything; real
  // payloads arrive with spaces and pretty-printing that re-serialising strips.
  const raw = '{"a": 1, "b": 2}';
  const reserialised = JSON.stringify(JSON.parse(raw));
  assert.notEqual(raw, reserialised, "the round trip must actually change the bytes");
  assert.deepEqual(bitbucket.verifySignature(reserialised, sign(raw), SECRET), { ok: false, reason: "mismatch" });
});

test("bitbucket with no secret or no signature is refused, not skipped", () => {
  const body = "{}";
  assert.deepEqual(bitbucket.verifySignature(body, sign(body), undefined), { ok: false, reason: "no-secret" });
  // With no secret set on the hook, Bitbucket sends no header at all — which is
  // indistinguishable from someone stripping it. Both refused.
  assert.deepEqual(bitbucket.verifySignature(body, null, SECRET), { ok: false, reason: "no-signature" });
});

test("a non-sha256 or non-hex signature is bad-format, not a crash", () => {
  const body = "{}";
  assert.deepEqual(bitbucket.verifySignature(body, "sha1=abcd", SECRET), { ok: false, reason: "bad-format" });
  assert.deepEqual(bitbucket.verifySignature(body, `sha256=${"z".repeat(64)}`, SECRET), { ok: false, reason: "bad-format" });
  // Short hex would make timingSafeEqual throw on a length mismatch.
  assert.deepEqual(bitbucket.verifySignature(body, "sha256=abcd", SECRET), { ok: false, reason: "bad-format" });
});

test("the header name differs from GitHub's and is exported so nobody guesses", () => {
  // X-Hub-Signature, no -256 suffix, despite the algorithm being SHA-256.
  assert.equal(bitbucket.BITBUCKET_SIGNATURE_HEADER, "x-hub-signature");
});

// ── Bitbucket: push parsing ─────────────────────────────────────────────────

function bbPush(changes: unknown[]) {
  return {
    actor: { nickname: "pusher" },
    repository: {
      full_name: "workspace/repo",
      uuid: "{repo-uuid}",
      workspace: { uuid: "{ws-uuid}", slug: "workspace" },
    },
    push: { changes },
  };
}

const bbBranchChange = {
  new: { name: "main", type: "branch", target: { hash: SHA, message: "msg", author: { user: { nickname: "committer" } } } },
  old: { name: "main", type: "branch" },
};

test("bitbucket parses a branch push", () => {
  const e = bitbucket.parsePushEvent(bbPush([bbBranchChange]));
  assert.equal(e?.provider, "bitbucket");
  assert.equal(e?.repoFullName, "workspace/repo");
  assert.equal(e?.branch, "main");
  assert.equal(e?.sha, SHA);
  assert.equal(e?.author, "pusher");
  assert.equal(e?.deleted, false);
});

test("a multi-branch push reports how many changes it did NOT parse", () => {
  // One Bitbucket push can move several branches; GitHub and GitLab send one
  // ref per delivery. Taking the first silently would make a two-branch push
  // look identical to a one-branch push.
  const e = bitbucket.parsePushEvent(bbPush([bbBranchChange, bbBranchChange, bbBranchChange]));
  assert.equal(e?.additionalChanges, 2);
  const single = bitbucket.parsePushEvent(bbPush([bbBranchChange]));
  assert.equal(single?.additionalChanges, 0);
});

test("a deletion has no `new` and no zero-sha to recognise", () => {
  // Bitbucket signals deletion by ABSENCE, where git and GitHub use all-zeroes.
  const e = bitbucket.parsePushEvent(bbPush([{ new: null, old: { name: "feature", type: "branch" }, closed: true }]));
  assert.equal(e?.deleted, true);
  assert.equal(e?.branch, "feature", "the branch name comes from `old`, which is all a deletion has");
  assert.equal(e?.sha, ZERO, "zeroes rather than a made-up hash, matching what GitHub sends");
});

test("a tag push carries no branch", () => {
  const e = bitbucket.parsePushEvent(
    bbPush([{ new: { name: "v1.0.0", type: "tag", target: { hash: SHA } }, old: null }]),
  );
  assert.equal(e?.branch, null, "type must be read; a tag deployed as a branch builds the wrong ref");
  assert.equal(e?.deleted, false);
});

test("the connection id is the WORKSPACE uuid, not the slug", () => {
  // A slug is renameable. A connection keyed on one silently detaches the day
  // someone renames their workspace.
  const e = bitbucket.parsePushEvent(bbPush([bbBranchChange]));
  assert.equal(e?.connectionId, "{ws-uuid}");
});

test("the commit author's email is stripped from the raw identity line", () => {
  // Bitbucket sends `author.raw` as a git identity: `Name <email>`. The address
  // is personal data nothing downstream needs, and the display name answers the
  // only question anyone asks of this field.
  //
  // `actor` is removed so the fallback path runs — with a pusher present the
  // commit author is never consulted.
  const payload = bbPush([
    {
      new: { name: "main", type: "branch", target: { hash: SHA, author: { raw: "Ada Lovelace <ada@example.com>" } } },
      old: null,
    },
  ]);
  const e = bitbucket.parsePushEvent({ ...payload, actor: undefined });

  assert.equal(e?.author, "Ada Lovelace");
  assert.ok(!e?.author?.includes("@"), "no address survives into the event");
});

test("bitbucket refuses an empty or malformed push", () => {
  assert.equal(bitbucket.parsePushEvent(bbPush([])), null);
  assert.equal(bitbucket.parsePushEvent({ repository: { full_name: "a/b" } }), null);
  assert.equal(bitbucket.parsePushEvent({ push: { changes: [bbBranchChange] } }), null, "no repository");
  assert.equal(
    bitbucket.parsePushEvent(bbPush([{ new: { name: "main", type: "branch", target: { hash: "nope" } }, old: null }])),
    null,
  );
});

// ── the shared listing contract ─────────────────────────────────────────────

test("an unread provider is not an empty provider", () => {
  // The failure this whole type exists to prevent: GitLab down must not render
  // as "you have no GitLab repos".
  const listings: ProviderListing[] = [
    { provider: "github", repos: [], error: null },
    { provider: "gitlab", repos: null, error: "502 from gitlab.com" },
  ];
  const m = mergeListings(listings);
  assert.equal(m.repos.length, 0);
  assert.equal(m.complete, false);
  assert.deepEqual(m.failed, [{ provider: "gitlab", error: "502 from gitlab.com" }]);
});

test("a genuinely empty listing IS complete", () => {
  const m = mergeListings([{ provider: "github", repos: [], error: null }]);
  assert.equal(m.complete, true);
  assert.deepEqual(m.failed, []);
});

test("no listings at all is not complete", () => {
  // Nothing asked is not everything answered.
  assert.equal(listingIsComplete([]), false);
});

test("the provider enum matches the database's", () => {
  // paas.git_provider is ('github','gitlab','bitbucket'). A value accepted here
  // and rejected by the column fails at INSERT, inside a SECURITY DEFINER RPC,
  // as a generic write error.
  assert.ok(isGitProvider("github") && isGitProvider("gitlab") && isGitProvider("bitbucket"));
  assert.ok(!isGitProvider("gitea"));
  assert.ok(!isGitProvider("GitHub"), "the enum is lowercase");
  assert.ok(!isGitProvider(null));
});
