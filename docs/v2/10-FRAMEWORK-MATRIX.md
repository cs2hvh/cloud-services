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
| 21 | **vercel/commerce** | Next.js **pnpm workspace monorepo** | **PASS** | **200** | The monorepo fix proven on a real one. This is the shape that could not install at all a day ago |
| 22 | shadcn-ui/taxonomy | Next.js that validates env AT BUILD TIME (`@t3-oss/env-nextjs`) | BUILD-ERR | build failed | Its own `env.mjs` throws during `next build` with no `DATABASE_URL`. Found that NO environment variable reached the builder |
| 23 | gatsbyjs/gatsby-starter-blog | Gatsby, yarn, native deps | BUILD-ERR | build failed | Found TWO gaps: no build toolchain in the image, and Gatsby not detected as a framework at all. Still fails afterwards — its `lmdb-store` cannot compile against Node 22's V8 headers |
| 24 | facebook/docusaurus (root) | Monorepo root that builds a library, not a site | BUILD-ERR | build failed | Found that Docusaurus was not detected either |
| 25 | sveltejs/realworld | SvelteKit, pnpm, `master` | APP-ERR | 503 | Wants a backend. **Caught a regression I had just introduced**: honouring `.nvmrc` as a hard pin broke a repository that had been serving |
| 26 | remix-run/indie-stack | Remix with a repo-supplied Dockerfile | APP-ERR | 503 | Wants a database |
| 27 | gothinkster/node-express-realworld-example-app | Express + Prisma API | BUILD-ERR | build failed | Their `Dockerfile:17` is `COPY dist/api api` — it expects a build that already happened. A CI-only Dockerfile, not ours |
| 28 | **nestjs/typescript-starter** | NestJS, TypeScript build | **PASS** | **200** | Only after a fix. It crash-looped first, and finding out why is what the pod diagnostics were built for |
| 29 | fastify/fastify-example-todo | Fastify, no lockfile | APP-ERR | 503 | Wants configuration. The no-lockfile path holds |
| 30 | gothinkster/django-realworld-example-app | Django, requirements.txt | BUILD-ERR | build failed | `ModuleNotFoundError: django.utils.six.moves` — removed in Django 3.0. The repository is older than its own dependencies |
| 31 | tiangolo/full-stack-fastapi-template | FastAPI, uv, app in `backend/` | REFUSED | at detect | Was recorded as a correct APP-ERR 503. It was actually crash-looping on exit 2 — we had invented its entrypoint |
| 32 | tiangolo/full-stack-fastapi-template `backend/` | The same repo with our own advice applied | BUILD-ERR | build failed | Its Dockerfile bind-mounts `uv.lock` from the build context, and that file is at the repo ROOT. See the gap below |
| 33 | pallets/flask | Flask — a LIBRARY | REFUSED | at detect | Previously leased a VM to fail installing itself |
| 34 | **gohugoio/hugoDocs** | Hugo, real documentation site | **PASS** | **200** | Hugo was not a framework at all before this. Four defects between detection and a served page |
| 35 | gothinkster/golang-gin-realworld-example-app | Gin, go.mod, no root README | APP-ERR | 503 | Two platform defects: the default branch was guessed wrong, then `go build ./...` could not write multiple packages to one output. Now builds and routes; the app itself crash-loops on exit 2 |
| 36 | gothinkster/rails-realworld-example-app | Rails, Gemfile | BUILD-ERR | build failed | Bundler aborts on a 2017 Gemfile against Ruby 3.3. Ruby has the version-pinning gap Node had |
| 37 | shadcn-ui/taxonomy (with its environment set) | Next.js validating env AT BUILD TIME | BUILD-ERR | build failed | Pushed through THREE platform defects. What remains is the repository's own rot: unpinned Radix drifted and its source no longer typechecks |
| 38 | github/gitignore | No framework marker at all | REFUSED | at detect | Now says so. It used to be told to connect a GitHub account it does not need |
| 39 | docker/awesome-compose | Many apps, none at the root | REFUSED | at detect | Same, and it took a second fix — its default branch is `master` |
| 40 | **spring-projects/spring-petclinic** | Spring Boot, Maven | **PASS** | **200** | Clean run, no fixes needed. The JVM path was right first time |
| 41 | laravel/laravel | Laravel skeleton | REFUSED | at detect | Was detected as **vite-react (static)** — its package.json carries vite and react for the asset pipeline. Now correctly PHP, and refused because PHP has no builder |
| 42 | symfony/demo | Symfony demo | REFUSED | at detect | Same refusal, in plain words rather than `[dockerfile] No generator for runtime` |
| 43 | actix/examples | Actix, cargo workspace | REFUSED | at detect | Rust is not detected at all — Cargo.toml is not a marker file |
| 44 | **gatsbyjs/gatsby-starter-blog** | Gatsby, yarn, native deps | **PASS** | **200** | Was BUILD-ERR. Detecting Gatsby as static rather than as a generic Node server changed the whole path, and it no longer needs the dependency that would not compile |
| 45 | **vercel/ai-chatbot** | Next.js, native deps, heavy build | **PASS** | **307** | A redirect to sign-in, which is the app working |
| 46 | vercel/next-learn `dashboard/final-example` | Next.js that PRERENDERS from a database | BUILD-ERR | build failed | `Failed to fetch card data` while prerendering /dashboard. It needs POSTGRES_URL AT BUILD TIME — which the platform can now supply, so this is configuration rather than a defect. Never tested before: the batch runner was broken when this target was chosen |
| 47 | facebook/docusaurus `website/` | Docusaurus site with no lockfile of its own | BUILD-ERR | build failed | `ERESOLVE` on its own peer dependencies. The monorepo's lockfile is at the root, so the sub-directory falls back to `npm install`, which is strict about peers |
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
- **a PHP application was detected as a React SPA.** Laravel ships a
  package.json with vite and react in it for its asset pipeline, and the Node
  branch matched first — we would have built its frontend and served that as
  the site, with the application that owns it left out of the image. The
  signals are not symmetrical: composer.json says THIS IS A PHP APPLICATION,
  while a package.json beside it says only that the project has JavaScript
  somewhere, which is true of nearly everything now.

**Deliberate gaps, with reasons.**

- **`npm install --legacy-peer-deps` is NOT used as a fallback.** It would let
  facebook/docusaurus's `website/` install, and a good number of older
  repositories with it. It was declined: it turns a hard failure into an
  install that may be quietly wrong, and npm's ERESOLVE output already names
  the exact conflicting versions, which is actionable. Vercel fails the same
  way. Worth revisiting only with the relaxation stated loudly in the build
  log.

- **PHP has no builder.** Detection recognises it — knowing what something is
  beats calling it unknown — and refuses before leasing a machine, naming the
  Dockerfile escape hatch. Vercel, the benchmark for this work, does not build
  PHP either. Supporting it properly means php-fpm behind nginx in one image,
  or Apache with its document root moved to public/, and a non-root uid that
  neither expects: a real piece of work rather than a missing branch.
- **Rust is not detected at all.** Cargo.toml is not a marker file, so a Rust
  repository is refused as having no recognised framework. actix/examples is a
  cargo workspace and would be refused anyway, but a single-binary Rust
  service would be too, and that is a gap rather than a judgement.
- **the default branch was guessed from two files many repositories lack.**
  Detection probed README.md and package.json on `main` and fell back to
  `master`; a Go repository has no package.json, and this one has no root
  README either. Worse, the wrong guess LOOKED right:
  raw.githubusercontent.com still serves a branch GitHub has renamed, so
  `master/go.mod` returned 200 and detection reported a ref that `git clone`
  then could not find. GitHub is now asked for `default_branch` instead.
- **`go build ./...` cannot write multiple packages to one output.** Any module
  with a package beside its main — most of them — failed after downloading
  every dependency. The main package is now located with `go list`, which
  covers a main at the root and one under cmd/ alike, and refuses clearly when
  there is none.

**Known limitation — cgo.** Go binaries are built `CGO_ENABLED=0` because the
runtime is `distroless/static`. A dependency that needs cgo — `go-sqlite3` is
the common one — builds but fails at startup. Supporting it means a second Go
runtime shape with a libc in it, which is a real decision rather than an
oversight.
- **the build could not read the project's environment.** Applications that
  validate configuration during `next build` — @t3-oss/env-nextjs is
  everywhere — could not be deployed at all, however completely the customer
  had filled their environment in. Server-side values now arrive through a
  buildkit secret mount, which is in no image layer, unlike a build arg.
- **and the last build arg was silently dropped.** The file is written with no
  trailing newline and `read` returns non-zero on a final unterminated line, so
  `while IFS= read -r line` never ran its body for it. With one variable that is
  every variable. Unreachable while buildArgs was hardcoded empty; the first
  public value ever passed went missing.
- **an install that runs the repository's own scripts got only the manifest.**
  `prisma generate` reads prisma/schema.prisma, emits a client with no models,
  and the build dies much later with a type error in the customer's own source.
- **Hugo was not a framework.** It was detected as Go (Hugo modules ship a
  go.mod), then needed npm dependencies for js.Build and Tailwind, then a
  NEWER node than Debian ships, and finally was routed to port 80 while nginx
  listened on 8080 — building, publishing and routing successfully while
  serving nothing.
- **two public repositories were told to connect a GitHub account.** The flag
  behind that message reported whether we held a TOKEN, not whether we could
  read anything, while its own comment claimed otherwise. The inverse of this
  project's recurring bug: treating observed-empty as could-not-observe.
- **Python entrypoints were invented, not read.** `gunicorn app:app` for
  Flask and a `wsgi.py` hunt for Django are what a Python app USUALLY looks
  like, not anything found in the repository. When the guess was wrong there
  was no good failure: one spent a build machine failing to install itself,
  the other built, routed and then crash-looped on exit 2 — reaching the
  customer as a 503 with no cause, and sitting in this matrix as a correct
  app error. Both are now refused in a second, naming the fix.

**Still open — the build context cannot be separated from the root
directory.** Setting a root directory makes it the Docker build context, which
is the usual PaaS meaning and right for most repositories. A monorepo whose
Dockerfile is written to be built from the REPO root with
`-f backend/Dockerfile` cannot express that: `tiangolo/full-stack-fastapi-
template` bind-mounts `uv.lock`, which lives one level above its Dockerfile.
Supporting it means a second setting — Dockerfile path, separate from context
— which is what Railway and Render offer and Vercel does not.
- **NestJS ran its DEV start script and crash-looped.** `nest start` needs
  @nestjs/cli, a devDependency the runtime stage prunes, so the container
  exited 1 and restarted — which from outside is a 503 and nothing else.
  `start:prod` exists precisely to say how a project runs in production and is
  now preferred for server frameworks.
- **a 503 was the end of the investigation, not the start of one.** The probe
  reported `APP-ERR 503` and then deleted the project, so the pod was gone
  before anyone could ask why — and 503 covers a crash loop, a readiness probe
  that never passes, and an image that will not pull, which have different
  owners. It now prints pod phase, waiting reason, exit code and restart count
  before tearing down. `KubePod` had to grow `state` and `lastState` to carry
  it; in a crash loop the current state is Waiting and the reason it died is in
  the previous one. The UI reads the same type.
- **no native dependency could compile.** sharp, bcrypt, sqlite3 and anything
  else built through node-gyp ship prebuilt binaries for common platforms and
  compile from source when none match — and on musl/alpine no match is the
  NORMAL case. The image had no toolchain, so the install died inside node-gyp
  with `gyp ERR! stack Error: Could not find any Python installation to use`,
  which names a missing interpreter rather than a missing compiler. python3,
  make and g++ now go into the stages that install; the runtime stage still
  gets neither, so the shipped image carries no compiler.
- **Gatsby and Docusaurus were not frameworks.** Both fell through to the
  generic Node branch, which runs `npm start` against a framework that has no
  server to start. Both build to a directory of static files and want nginx —
  and NOT the same directory (`public/` vs `build/`), which is why each needs
  its own rule rather than one shared guess.
- **the Node version was hardcoded to 22.** A repository pins Node because a
  native addon has no prebuilt binary for a newer ABI, or a dependency reads a
  V8 header that has since changed; building those on the newest Node fails
  with `v8-local-handle.h:269:42: error: static assertion failed: type check`,
  which names a C++ header rather than a version mismatch. `.nvmrc` and
  `engines.node` are now both read. `.nvmrc` wins — a developer writes it to
  say what they actually run — and within `engines` a floor is not a target,
  so `>=18` builds on 22.
- **public environment variables reached nothing at all.** A
  `NEXT_PUBLIC_` / `VITE_` / `PUBLIC_` value is read by the bundler and
  written into the JavaScript it emits; no later step can supply it. The
  reconciler knew that and deliberately left public keys OUT of the runtime
  Secret, on the stated grounds that they were "already baked into the image
  as build args" — but `deploy.ts` passed `publicEnvKeys: []` and
  `buildArgs: {}`, so nothing baked them. A customer who set
  `NEXT_PUBLIC_API_URL` got it in neither place: the build succeeded, the page
  loaded, and the fetch went to `undefined`. Both are now passed, and a build
  arg carrying a newline is refused rather than silently forging a second one.
- **the v2 test suite was never run by any script.** `lib/paas/**/*.test.ts`
  are `node:test` files; `npm test` is vitest with `include: tests/**`. 998
  tests — including every regression guard written during this sweep — sat
  unrun while the suite reported green. `npm run test:paas` now runs them.
  Adding them to vitest's globs is NOT the fix: vitest imports the file,
  node:test executes at import, and the results land outside vitest's
  reporting while still failing the process.
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
