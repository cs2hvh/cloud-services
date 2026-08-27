# Framework support matrix

**What this is.** A record of every application actually deployed against
Deploy v2, what happened, and what had to change. Written while testing rather
than after, because the point is to find the gaps and the gaps are only
believable if the failures are here too.

**The rule for this document: a row is only green if a real deploy of a real
repository served a real request.** Detection returning the right framework name
is not support. A build that produces an image nobody routed is not support.
The evidence column carries the HTTP status of the served hostname or it stays
amber.

**Apps are deleted after each test.** The platform is not a graveyard of
fixtures, and an accumulating fleet would bill and would hide the next failure
in noise.

---

## Status key

| Mark | Meaning |
|---|---|
| PASS | Deployed, routed, served a 2xx |
| APP-ERR | Platform did its job; the app itself errored (missing secret, bad config) |
| FAIL | Platform could not build, route, or serve it |
| TODO | Not attempted yet |

`APP-ERR` is deliberately not `FAIL`. A Next.js app that needs `NEXTAUTH_SECRET`
and says so in its runtime logs is the platform working — the customer's
configuration is the customer's. Recording those separately is what stops a
support gap being mistaken for a build gap.

---

## Results

| # | Repository | Stack | Result | Evidence | Notes |
|---|---|---|---|---|---|
| 1 | heroku/node-js-getting-started | Node / Express | PASS | 200 | The first app ever deployed here |
| 2 | docker/welcome-to-docker | Dockerfile / static | PASS | 200 | Repo-supplied Dockerfile |
| 3 | Azure-Samples/python-docs-hello-world | Python / Flask | PASS | 200 | |
| 4 | cs2hvh/ArthaKosha | Next.js 15 (private) | PASS | 200 build, 500 serve → APP-ERR | Found three platform bugs: unauthenticated detection, unauthenticated clone, credential destroyed before the commit fetch |
| 5 | cs2hvh/ahurasense-task | Next.js (private) | APP-ERR | 500 | Needs NEXTAUTH_SECRET; runtime logs name it |
| 6 | fastify/fastify-example-todo | Fastify, no lockfile | APP-ERR | 503 | Built, routed, served — the app wants a database. Found the `npm ci` gap |
| 7 | vercel/next-learn | Next.js in a monorepo subdirectory | TODO | — | Failed on the pnpm lockfile and corepack; both fixed, needs a re-run |
| 8 | remix-run/indie-stack | Remix, repo-supplied Dockerfile | TODO | — | Built and routed; the probe timed out waiting on DNS. Needs a re-run |
| 9 | sveltejs/realworld | SvelteKit on `master`, pnpm | TODO | — | Found the corepack gap. The branch fallback to `master` worked |

---

## Gaps this testing has already found

Each of these was a real defect reached by deploying something, not by reading
code:

1. **Private repositories could not deploy at all.** Detection read
   `raw.githubusercontent.com` with no credential, so a private repo's 404 was
   indistinguishable from "no package.json". 36 of 49 of the operator's
   repositories are private. Fixed by using the installation token.
2. **The build VM cloned anonymously.** `BuildRequest.gitToken` existed,
   documented "private repositories only", and was never set.
3. **The clone credential was destroyed before the commit fetch.** Cloning a
   branch and fetching a sha are two authenticated operations.
4. **A failure before `building` never left the queue** — retried every 15s
   forever, shown as "queued" with no reason anywhere a customer could see.
5. **Custom domains never got an Ingress**, so every one 404'd regardless of DNS.
6. **No repository without a lockfile could build.** `npm ci` requires one,
   and pnpm, yarn and bun's frozen flags all refuse without one. The
   generated Dockerfile always chose the frozen form.
7. **A lockfile written by a newer package manager was fatal.** corepack
   resolved pnpm 10 for a pnpm 11 lockfile. The frozen install now falls back
   to a fresh resolve rather than failing the build.
8. **Every pnpm and yarn project failed**, in three stages at once. Each
   build stage is a fresh `FROM node:alpine`; corepack was enabled only in
   `deps`, so the builder could not run the build script and the runner could
   not start the app. Only npm worked, because npm ships inside node.

Items 6 to 8 all came from the first batch of three real applications, which
is the argument for testing real repositories rather than templates: a
template ships a fresh lockfile and uses npm, and would have passed all three.

---

## Still to cover

Ordered by how likely a customer is to bring one.

**Node**: Next.js (app router, pages router, standalone output), Remix, Nuxt,
SvelteKit, Astro, Vite SPA, Create React App, Angular, Express, Fastify, NestJS,
Koa, Hono, Bun, Deno.

**Python**: Flask, Django, FastAPI, Streamlit, Gradio, Poetry projects,
requirements.txt vs pyproject.toml.

**Go**: net/http, Gin, Echo, Fiber, module vs vendored.

**Ruby**: Rails, Sinatra.

**PHP**: Laravel, Symfony, plain.

**JVM**: Spring Boot (Maven), Spring Boot (Gradle), Quarkus.

**Rust**: Actix, Axum, Rocket.

**Static**: plain HTML, Hugo, Jekyll, Eleventy, Docusaurus, MkDocs.

**Shapes that break assumptions**, and the reason each is worth its own row:

- A monorepo where the app is in a subdirectory — exercises `root_directory`
- A repo whose default branch is `master`, not `main`
- A repo with a Dockerfile AND a package.json — which wins?
- A repo with no lockfile
- A repo with a `.node-version` or `engines` constraint
- An app that listens on a port other than the detected one
- An app that needs a build-time environment variable
- An app that takes longer than the build timeout
- A repo with no framework marker at all — must refuse clearly, not crash
- An empty repository
- A repository the installation cannot see
