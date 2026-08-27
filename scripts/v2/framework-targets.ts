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
   */
  expect: "serve" | "refuse" | "app-err";
}

export const BATCHES: Record<string, Target[]> = {
  /* ── Node: the frameworks most customers arrive with ──────────────────── */

  "next-1": [
    // final-example, NOT starter-example. The starter is deliberately incomplete —
    // the tutorial has the reader create app/ui/fonts.ts — so it fails TypeScript
    // on its own source. The platform got all the way through install, build and
    // typecheck to find that, which is correct behaviour and a useless test.
    { repo: "vercel/next-learn", note: "Next.js in a monorepo subdirectory", root: "dashboard/final-example", expect: "serve" },
    { repo: "vercel/ai-chatbot", note: "Next.js, native deps and a heavy build", expect: "app-err" },
  ],
  "next-2": [
    { repo: "shadcn-ui/taxonomy", note: "Next.js app router, Prisma postinstall", expect: "app-err" },
    { repo: "vercel/commerce", note: "Next.js monorepo, pnpm workspaces", expect: "app-err" },
  ],
  react: [
    { repo: "gothinkster/react-redux-realworld-example-app", note: "CRA, a real SPA", expect: "serve" },
    { repo: "vitejs/vite", note: "Vite monorepo — a LIBRARY, must refuse", expect: "refuse" },
  ],
  vue: [
    { repo: "gothinkster/vue-realworld-example-app", note: "Vue 2 SPA", expect: "serve" },
    { repo: "nuxt/movies", note: "Nuxt 3, real app", expect: "serve" },
  ],
  angular: [
    { repo: "gothinkster/angular-realworld-example-app", note: "Angular, CLI build", expect: "serve" },
  ],
  svelte: [
    { repo: "sveltejs/realworld", note: "SvelteKit on `master`, pnpm", expect: "serve" },
  ],
  astro: [
    { repo: "satnaing/astro-paper", note: "Astro blog, real content build", expect: "serve" },
    { repo: "withastro/starlight", note: "Astro docs monorepo", expect: "app-err" },
  ],
  remix: [
    { repo: "remix-run/indie-stack", note: "Remix with a repo-supplied Dockerfile", expect: "app-err" },
  ],
  "node-backend": [
    { repo: "gothinkster/node-express-realworld-example-app", note: "Express + Prisma API", expect: "app-err" },
    { repo: "nestjs/typescript-starter", note: "NestJS, TypeScript build", expect: "serve" },
    { repo: "fastify/fastify-example-todo", note: "Fastify, no lockfile", expect: "app-err" },
  ],
  "node-other": [
    { repo: "gatsbyjs/gatsby-starter-blog", note: "Gatsby, static output", expect: "serve" },
    { repo: "facebook/docusaurus", note: "Docusaurus monorepo — a LIBRARY at the root", expect: "refuse" },
  ],

  /* ── Python ───────────────────────────────────────────────────────────── */

  python: [
    { repo: "gothinkster/django-realworld-example-app", note: "Django, requirements.txt", expect: "app-err" },
    { repo: "tiangolo/full-stack-fastapi-template", note: "FastAPI, Poetry/uv", expect: "app-err" },
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
    { repo: "laravel/laravel", note: "Laravel skeleton, composer.json", expect: "app-err" },
    { repo: "symfony/demo", note: "Symfony demo app", expect: "app-err" },
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
