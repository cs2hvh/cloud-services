# Deploy v2 — GitLab and Bitbucket

Last updated 2026-08-27 · branch `feat/deploy-v2-obs` · handed over from the deploy lane

v2 shipped GitHub-only; v1 had all three. This is the other two, built to
GitHub's shape rather than a new one.

**Run the tests:**

```bash
node --test --env-file=.env --env-file=.env.local "lib/paas/**/*.test.ts"
```

`--env-file` is not optional: `lib/paas/secrets.test.ts` reads
`V2_ENV_MASTER_KEY` from the environment and fails 12 of 14 without it. That is
pre-existing and not a regression — `providers/credentials.test.ts` mints its
own key and passes either way.

---

## 1. The three providers are not the same shape, and pretending otherwise is the bug

| | GitHub | GitLab | Bitbucket |
|---|---|---|---|
| Auth model | App installation | OAuth | OAuth |
| Credential we store | **none** | access + refresh token | access + refresh token |
| Token lifetime | minted per request, 1h | durable, refreshable | durable, refreshable |
| Webhook auth | HMAC-SHA256 over body | **shared token, equality** | HMAC-SHA256 over body |
| Signature header | `X-Hub-Signature-256` | `X-Gitlab-Token` | `X-Hub-Signature` *(no `-256`)* |
| Per-repo hook needed | no | yes | yes |
| Git username | `x-access-token` | `oauth2` | `x-token-auth` |
| Connection id | numeric | numeric | **UUID** |

Four of those rows are load-bearing and each has a test holding it.

### GitLab's webhook check is weaker, and the code says so

GitHub sends an HMAC over the raw body: the sender knows the secret **and** the
body is unaltered. GitLab sends `X-Gitlab-Token` — the secret itself, in a
header, not computed over anything. It proves the sender knows the secret and
says **nothing** about the payload.

Concretely: anything that sees the header can replay it against any body, and
one logged request header *is* the secret rather than a derivative. That is
GitLab's design; there is no HMAC option. The mitigation is to treat the token
accordingly and keep the comparison constant-time — not to let the two look
equivalent. An equality check dressed as a signature is worse than an honest
weaker one, because the next reader assumes parity.

A test asserts the asymmetry rather than only documenting it: the same token
verifies two different bodies. If someone "upgrades" it to an HMAC, that test
fails and makes them read why.

### Connecting GitLab gives us durable access to a customer's account

GitHub does not. Its tokens are minted per request from a private key and expire
in an hour, so `paas.installations` holds no GitHub credential at all. **A breach
of the token columns is a different severity from a breach of `env_vars`.**

`providers/credentials.ts` encrypts them — AES-256-GCM, HKDF from the same
master key as env vars but in a **separate context** (`conn1` rather than `v1`,
salted on `(provider, external_id)`, token kind bound into `info`). Reusing
`secrets.ts` with an invented `projectRef` would have put a GitLab OAuth token
in the same key space as an app's `DATABASE_URL`.

Three consequences, each tested: an access ciphertext cannot be read as a
refresh token; GitLab project 42 and GitHub installation 42 derive different
keys; an env-var ciphertext fed to this decrypt is refused **by scheme name**.

---

## 2. What is where

| Module | Does |
|---|---|
| `providers/types.ts` | The normalised shape all three flatten to |
| `providers/credentials.ts` | Token encryption at rest, and refresh timing |
| `providers/oauth.ts` | Signed state, token exchange, identity |
| `providers/policy.ts` | Deploy decision + **provider-scoped** project lookup |
| `providers/adapter.ts` | Repos for a team, failures kept separate |
| `providers/hooks.ts` | Webhook registration |
| `providers/config.ts` | Env-var reads |
| `gitlab/`, `bitbucket/` | `webhook.ts` and `client.ts` each |

Routes: `app/api/v2/{gitlab,bitbucket}/{authorize,callback}` and
`app/api/v2/webhooks/{gitlab,bitbucket}`.

---

## 3. The security decisions worth knowing

**The team comes from signed state, not the session.** Both are available in the
callback and the session is the obvious choice. It is the wrong one: an attacker
who starts an authorisation and gets a victim to open the callback URL would
have the *victim's* session name the team, binding the **attacker's** provider
account to the **victim's** team. Every project that team creates afterwards
builds from repositories the attacker controls.

So the team is read from the signature, and the session proves only that the
caller may act on that team. Both checks, neither alone. State expires at 10
minutes, is refused if dated in the future (clock skew, not a state from
tomorrow), and a state minted for one provider is refused on another's callback.

**Identity comes from the token, never the query string.** That is the deploy
lane's rule 2 in the shape OAuth gives it — there is no guessable installation
id to verify, but there is still a URL the caller controls, and nothing on it
may become a stored fact.

**A Bitbucket token granting several workspaces is refused, not guessed.** The
API's ordering is not stable, so the same token could bind a different workspace
on a retry. The user narrows their authorisation; we do not pick.

**The clone URL is clean on both.** The token goes to git through a credential
file. Git echoes the remote on failure, the build log is uploaded to R2 and
served to the whole team — embedding a GitHub token there leaks one hour of
access, embedding one of these leaks the account.

**Hook registration only ever creates.** Never deletes, never edits. "Make it
match what I expect" would remove a customer's own CI hook for not being
recognised; "add what is missing" cannot. Idempotent by **URL**, not by a stored
id — an id works until someone deletes the hook in the provider's UI, at which
point we hold an id for nothing and pushes stop silently.

---

## 4. Two live bugs this surfaced

**`projects.byRepoFullName` is provider-blind.** Correct while every project was
GitHub. With three providers, `acme/api` on GitHub and `acme/api` on GitLab are
different repositories with the same name — **a GitLab push would deploy the
GitHub project**, building one customer's commit onto another's hostname.
`paas.projects.provider` already exists, so the predicate just needs it.
Worked around in `providers/policy.ts` for the new receivers; the shared
accessor in `lib/paas/db.ts` (deploy lane) still needs it.

**`paas.installations` was GitHub-shaped in two places that are not cosmetic.**
`installation_id bigint primary key` cannot hold a Bitbucket workspace UUID, and
the `account_login` check was literally GitHub's username grammar — it would
reject valid GitLab and Bitbucket accounts inside a `SECURITY DEFINER` insert,
surfacing as a generic write error. Migration
`20260827090000_paas_installations_multi_provider.sql`, written here, applied by
the deploy lane.

Its `else false` is load-bearing: a `CASE` with no `ELSE` returns NULL for an
unmatched provider and **a CHECK constraint passes on NULL**, so a fourth
`git_provider` value would silently switch the constraint off for it.

---

## 5. Not done

- **Token refresh is not wired.** `needsRefresh` and the refresh-token column
  exist; nothing calls the refresh endpoint yet. Until it does, a GitLab
  connection stops working when its access token expires.
- **`ensureHook` is not called from project create.** The module and its tests
  exist; the create path (deploy lane) has to invoke it.
- **The branches route** — `/api/v2/git/repos/[owner]/[repo]/branches` — still
  resolves GitHub only. Both clients export `listBranches` in its shape.
- **Bitbucket Server / Data Center is unsupported**, deliberately: a different
  API (`/rest/api/1.0`) and different pagination. No host parameter, because
  accepting one would imply it works and fail as though it were an auth problem.
