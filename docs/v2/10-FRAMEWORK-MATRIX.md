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
| 7 | vercel/next-learn `dashboard/starter-example` | Next.js in a monorepo subdirectory | APP-ERR | build failed | The starter is DELIBERATELY incomplete — the tutorial has the reader create `app/ui/fonts.ts`, so it fails TypeScript on its own source. The platform reached install, build and typecheck to find that. Target switched to `final-example` |
| 10 | **vercel/ai-chatbot** | Next.js, pnpm, native deps, heavy build | **PASS** | **307** | A large real application, end to end. Found three of the four pnpm defects on the way |
| 11 | **gothinkster/react-redux-realworld-example-app** | CRA SPA on `master`, static/nginx | **PASS** | **200** | Found that EVERY static site crash-looped on a pidfile it could not write |
| 12 | remix-run/indie-stack | Remix, repo Dockerfile | APP-ERR | 503 | Wants a database |
| 13 | sveltejs/realworld | SvelteKit, pnpm, `master` | APP-ERR | 503 | Wants a backend. First pnpm app to route |
| 14 | **nuxt/movies** | Nuxt 3, real application | **PASS** | **200** | Clean run, no fixes needed |
| 15 | vitejs/vite | pnpm workspace monorepo — expected to refuse | APP-ERR | build failed | Refused, but only after leasing a VM. Found that NO monorepo could install |
| 16 | gothinkster/vue-realworld-example-app | Vue 2 SPA, bun lockfile | APP-ERR | build failed | The repo's own build is broken — rolldown cannot resolve its `src/main.js` |
| 17 | gothinkster/angular-realworld-example-app | Angular, **bun** | APP-ERR | build failed | The repo imports `realworld/assets/theme/styles.css` and has no such dependency. Confirmed bun detection was CORRECT — the repo really does ship `bun.lock` |
| 18 | **withastro/astro** `examples/blog` | Astro through OUR Dockerfile — no lockfile, inside a monorepo | **PASS** | **200** | Astro proven end to end. Served at `v2-astro.ahurasense.com`, then torn down |
| 19 | satnaing/astro-paper | Astro blog shipping its own Dockerfile | BUILD-ERR | build failed | Their Dockerfile, not ours: `pnpm install --frozen-lockfile` under pnpm 10 stops on `ERR_PNPM_IGNORED_BUILDS`. Proves the docker path, says nothing about Astro |
| 20 | withastro/starlight | Workspace root with no build script | REFUSED | at detect | Refused in seconds without leasing a machine. Previously spent a VM to fail on `"/dist": not found` |
| 8 | remix-run/indie-stack | Remix, repo-supplied Dockerfile | APP-ERR | 503 | Built, routed, served. The app wants a database it was not given |
| 9 | sveltejs/realworld | SvelteKit on `master`, **pnpm** | APP-ERR | 503 | Built, routed, served — **first proof pnpm works end to end**. Branch fallback to `master` also proven |

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

## Package managers

Proven means an application built with it reached a routed hostname that
answered. A correct-looking Dockerfile is not proof.

| | State | Evidence |
|---|---|---|
| npm | **Proven** | heroku/node-js-getting-started, fastify-example-todo |
| pnpm | **Proven** | sveltejs/realworld — built, routed, answered 503 from the app |
| yarn | Fixed, unproven | Same corepack fix as pnpm; no yarn application deployed yet |
| bun | Fixed, unproven | Now builds on `oven/bun`; nothing has deployed with it |

Four defects sat between npm working and pnpm working, and every one of them
would have passed against a generated template:

- the frozen install demanded a lockfile that may not exist
- a lockfile written by a newer pnpm was fatal rather than survivable
- corepack was enabled in `deps` only, so the builder could not run the build
  and the runner could not start the app
- pnpm 10 refuses install scripts and exits non-zero, which kills any project
  with a native dependency — sharp, bcrypt, prisma, esbuild

And one that had nothing to do with package managers:

- **every static site crash-looped.** The nginx runtime rewrote its pidfile path
  by literal (`/var/run/nginx.pid`); nginx 1.27 ships `/run/nginx.pid`, so the
  substitution matched nothing and uid 101 could not write it. nginx logs a
  clean startup and *then* dies, so the pod read as Running and the platform
  answered 503. CRA, Vite, Vue, Angular, Gatsby, Astro and Hugo were all
  affected, and it stayed hidden because everything deployed here before was a
  Node server or a repo-supplied Dockerfile.
- **the batch runner never ran.** `framework-batch.ts` uses a top-level await,
  which tsx cannot compile to CommonJS, so it died in the transform before
  reaching a single repository — and because the run was piped, the pipeline's
  exit code was reported rather than the script's, so it read as a clean sweep.
  Every batch result recorded before this came from running
  `framework-probe.ts` directly, which has an async entrypoint. The probe is
  spawned with `node --experimental-strip-types`, which supports top-level
  await; that is why one worked and the other did not.
- **a correct refusal was scored as a platform failure.** The runner graded on
  the verdict alone, so a target that MUST be turned away counted the same as
  one that should have served and did not. That is how the astro batch came to
  be read backwards. Targets now declare `serve`, `refuse`, `app-err` or
  `build-err` and the runner reports `as expected` or `UNEXPECTED — wanted X`.
- **a static site with nothing to build and nothing to serve leased a machine
  to fail.** With no build script the generated Dockerfile copies a pre-built
  directory out of the repository; when that directory does not exist Docker
  answers `failed to calculate checksum of ref …: "/dist": not found`, which
  names no cause. Detection now refuses up front unless there is an
  `index.html` at the root, which is the only case where that copy is right.
- **no monorepo could install.** The deps stage copied only the root manifest
  so the dependency layer could cache; a workspace's root dependencies point
  at sibling packages, and pnpm answered ERR_PNPM_WORKSPACE_PKG_NOT_FOUND
  against a directory holding none of them. That is turborepo, nx and
  pnpm-workspace layouts — a large share of real production repositories.

---

## Still to cover

Ordered by how likely a customer is to bring one.

**Angular still needs a target.** Both gothinkster Angular and Vue repositories
fail on their own source, so neither proves anything about the framework. They
did prove one thing worth keeping: both ship `bun.lock`, the platform detected
bun correctly, and bun installed and reached the build step — which is the
closest bun has come to being exercised.

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
