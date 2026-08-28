/**
 * What the framework sweep deploys.
 *
 * SEPARATED FROM THE RUNNER so the list can grow without touching the machinery
 * that runs it, and so `--list` is a document rather than a code read.
 *
 * THREE RULES DECIDED THIS LIST.
 *
 * 1. REAL APPLICATIONS, NOT TEMPLATES. A template proves the detector
 *    recognises a name. A real application proves the build survives a
 *    lockfile, a monorepo, a native dependency with a postinstall script, and a
 *    build step that takes minutes. Every defect this sweep has found so far —
 *    the missing lockfile, the newer lockfile format, corepack absent in two
 *    stages, pnpm refusing install scripts — would have passed against a
 *    freshly generated template.
 *
 * 2. SOME ENTRIES ARE MEANT TO FAIL, and are marked `expect: "refuse"`. A
 *    library is not an application; a repository with no marker is not
 *    deployable. Refusing those CLEARLY is a feature, and a matrix that only
 *    contains things which should work proves the platform handles the easy
 *    half. A refusal that arrives as a crash, or as a build that runs for four
 *    minutes and then fails, is a defect even though the answer is "no".
 *
 * 3. ONE REPOSITORY PER SHAPE, not per name. Three Next.js starters exercise
 *    the same path; a Next.js monorepo, a Next.js app with native dependencies
 *    and a Next.js app on `master` exercise three different ones.
 *
 * The gothinkster RealWorld family appears repeatedly on purpose: the same
 * application implemented across a dozen stacks is the closest thing to a
 * controlled experiment available here — when one of them fails and the others
 * pass, the difference is the stack rather than the app.
 */

export interface Target {
  repo: string;
  /** What this repository exercises that the others do not. */
  note: string;
  branch?: string;
  root?: string;
  /**
   * `serve` — should build, route and answer.
   * `refuse` — should be turned away with a clear reason, and quickly.
   * `app-err` — should build and route; the app itself will error (needs a
   *   database, a secret) and that is not a platform failure.
   * `build-err` — the build cannot finish because of what the repository
   *   contains: a stale Dockerfile of its own, a lockfile its own toolchain
   *   rejects, source that does not compile. Also not a platform failure, and
   *   distinct from `refuse` — we were right to try, and the answer arrived
   *   from the builder rather than from detection.
   */
  expect: "serve" | "refuse" | "app-err" | "build-err";
}

export const BATCHES: Record<string, Target[]> = {
  /* ── Node: the frameworks most customers arrive with ──────────────────── */

  "next-1": [
    // final-example, NOT starter-example. The starter is deliberately incomplete —
    // the tutorial has the reader create app/ui/fonts.ts — so it fails TypeScript
    // on its own source. The platform got all the way through install, build and
    // typecheck to find that, which is correct behaviour and a useless test.
    { repo: "vercel/next-learn", note: "Next.js that PRERENDERS from a database at build time", root: "dashboard/final-example", expect: "build-err" },
    { repo: "vercel/ai-chatbot", note: "Next.js, native deps and a heavy build", expect: "app-err" },
  ],
  "next-2": [
    { repo: "shadcn-ui/taxonomy", note: "Next.js app router, validates env AT BUILD TIME", expect: "build-err" },
    { repo: "vercel/commerce", note: "Next.js monorepo, pnpm workspaces", expect: "app-err" },
  ],
  react: [
    { repo: "gothinkster/react-redux-realworld-example-app", note: "CRA, a real SPA", expect: "serve" },
    { repo: "vitejs/vite", note: "Vite monorepo — a library that looks like a Vite app", expect: "build-err" },
  ],
  vue: [
    { repo: "gothinkster/vue-realworld-example-app", note: "Vue 2 SPA whose own build is broken", expect: "build-err" },
    { repo: "nuxt/movies", note: "Nuxt 3, real app", expect: "serve" },
  ],
  angular: [
    // A CURRENT Angular that actually builds. Both copies of the RealWorld
    // Angular app fail on a stylesheet no manifest declares, so neither could
    // ever prove the Angular path; this one is Angular 22 with a lockfile, and
    // it writes to dist/<project>/browser, which is the case that broke us.
    { repo: "ganatan/angular-bootstrap", note: "Angular 22, CLI build, nested output directory", expect: "serve" },
    { repo: "gothinkster/angular-realworld-example-app", note: "Angular; imports a stylesheet no manifest declares", expect: "build-err" },
  ],
  svelte: [
    { repo: "sveltejs/realworld", note: "SvelteKit on `master`, pnpm; wants a backend API", expect: "app-err" },
  ],
  astro: [
    // Astro through OUR generated Dockerfile. astro-paper ships its own, so it
    // proves the docker path and says nothing about Astro detection; starlight is
    // a workspace root whose build scripts live in its packages, so it has no root
    // build command and nothing to serve. An example inside the Astro monorepo is
    // the only one of the three that exercises detect -> build -> nginx.
    { repo: "withastro/astro", note: "Astro via our Dockerfile, no lockfile, inside a monorepo", root: "examples/blog", expect: "serve" },
    { repo: "satnaing/astro-paper", note: "Astro blog shipping its own Dockerfile", expect: "build-err" },
    { repo: "withastro/starlight", note: "workspace root with no build script — must refuse", expect: "refuse" },
  ],
  remix: [
    { repo: "remix-run/indie-stack", note: "Remix with a repo-supplied Dockerfile", expect: "app-err" },
  ],
  "node-backend": [
    { repo: "gothinkster/node-express-realworld-example-app", note: "Express + Prisma; its Dockerfile expects a build that already happened", expect: "build-err" },
    { repo: "nestjs/typescript-starter", note: "NestJS, TypeScript build", expect: "serve" },
    { repo: "fastify/fastify-example-todo", note: "Fastify, no lockfile", expect: "app-err" },
  ],
  "node-other": [
    // Gatsby's own starter cannot install on a current Node: its tree pulls
    // lmdb-store, whose C++ fails a static assertion against Node 22's V8
    // headers. Nothing on our side fixes that — the repository would need to
    // pin an older Node, which we would now honour.
    { repo: "gatsbyjs/gatsby-starter-blog", note: "Gatsby, static output", expect: "serve" },
    // The Docusaurus repository root is the monorepo that BUILDS Docusaurus.
    // Its documentation site — a real Docusaurus site, which is what a customer
    // would deploy — lives in website/.
    { repo: "facebook/docusaurus", note: "Docusaurus site in website/, with no lockfile of its own", root: "website", expect: "build-err" },
    { repo: "facebook/docusaurus", note: "monorepo ROOT — builds a library, not a site", expect: "build-err" },
  ],

  /* ── Python ───────────────────────────────────────────────────────────── */

  python: [
    { repo: "gothinkster/django-realworld-example-app", note: "Django so old its own deps import django.utils.six", expect: "build-err" },
    { repo: "tiangolo/full-stack-fastapi-template", note: "FastAPI in backend/ — root has no entrypoint", expect: "refuse" },
    // The same repository with the advice our refusal gives actually applied. If
    // "set the root directory to it" does not work, the refusal is a dead end
    // dressed as a suggestion.
    { repo: "tiangolo/full-stack-fastapi-template", note: "FastAPI from backend/; its Dockerfile wants the ROOT as context", root: "backend", expect: "build-err" },
    { repo: "pallets/flask", note: "Flask — a LIBRARY, must refuse", expect: "refuse" },
  ],

  /* ── Compiled and other runtimes ──────────────────────────────────────── */

  go: [
    { repo: "gothinkster/golang-gin-realworld-example-app", note: "Gin, go.mod", expect: "app-err" },
    { repo: "gohugoio/hugoDocs", note: "Hugo, static site generator", expect: "serve" },
  ],
  ruby: [
    { repo: "gothinkster/rails-realworld-example-app", note: "Rails, Gemfile", expect: "app-err" },
  ],
  php: [
    { repo: "laravel/laravel", note: "Laravel skeleton; PHP is unsupported, and its package.json used to fool us", expect: "refuse" },
    { repo: "symfony/demo", note: "Symfony demo; PHP is unsupported", expect: "refuse" },
  ],
  jvm: [
    { repo: "spring-projects/spring-petclinic", note: "Spring Boot, Maven", expect: "app-err" },
  ],
  rust: [
    { repo: "actix/examples", note: "Actix, cargo workspace", expect: "refuse" },
  ],

  /* ── Shapes that break assumptions ────────────────────────────────────── */

  edges: [
    { repo: "github/gitignore", note: "No framework marker at all", expect: "refuse" },
    { repo: "docker/awesome-compose", note: "Many apps, none at the root", expect: "refuse" },
  ],
};

/** Every target, in declaration order. */
export function allTargets(): Array<Target & { batch: string }> {
  return Object.entries(BATCHES).flatMap(([batch, targets]) => targets.map((t) => ({ ...t, batch })));
}
