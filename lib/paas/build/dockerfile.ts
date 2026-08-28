/**
 * Dockerfile generation.
 *
 * v1 generated Dockerfiles as shell heredocs embedded inside Jenkins pipeline
 * XML — roughly 1,450 lines of shell producing shell, with user-controlled
 * values interpolated at several layers. This produces a plain string from
 * typed inputs, with nothing user-controlled reaching a shell unquoted.
 *
 * Two rules hold for every runtime:
 *
 *   1. The final stage runs as a NON-ROOT user. v1 ran each tenant's container
 *      as whatever UID its own Dockerfile happened to pick, in a shared
 *      namespace, with no PodSecurity admission.
 *   2. Only build args with a public prefix are baked into image layers.
 *      Everything else is injected at runtime from a Secret, so server
 *      credentials never end up in a layer that is pushed to a registry.
 */

import type { Detection } from "./detect.ts";

export const PUBLIC_ENV_PREFIXES = ["NEXT_PUBLIC_", "VITE_", "PUBLIC_", "REACT_APP_", "NUXT_PUBLIC_"] as const;

export function isPublicEnvKey(key: string): boolean {
  return PUBLIC_ENV_PREFIXES.some((p) => key.startsWith(p));
}

/** Env var keys are validated at the DB layer; assert again before templating. */
const SAFE_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface DockerfileInput {
  detection: Detection;
  packageManager: "npm" | "yarn" | "pnpm" | "bun";
  /**
   * Whether the repository actually ships a lockfile.
   *
   * Every frozen-install flag REQUIRES one — `npm ci` errors outright, and
   * pnpm, yarn and bun all refuse in their own way. Without this the
   * generated Dockerfile could not build ANY repository that does not commit
   * a lockfile, which is a large share of samples, templates and small
   * projects. Found by deploying fastify/fastify-example-todo, which failed
   * at `npm ci` with a usage message rather than anything about lockfiles.
   */
  hasLockfile?: boolean;
  /**
   * Whether this repository is a monorepo workspace.
   *
   * The deps stage normally copies only the manifest and the lockfile, so the
   * dependency layer caches independently of the source. A workspace cannot
   * install that way: its root dependencies point at sibling packages, and
   * pnpm answers ERR_PNPM_WORKSPACE_PKG_NOT_FOUND against a directory holding
   * none of them.
   *
   * So a workspace copies the tree first and gives up that caching. Slower
   * rebuilds are worth more than a monorepo that cannot build at all.
   */
  isWorkspace?: boolean;
  /**
   * Whether installing runs a script of the repository's own.
   *
   * A `postinstall` or `prepare` can read anything in the tree, and the
   * commonest one in the world — `prisma generate` — reads
   * prisma/schema.prisma. The deps stage copies only the manifest, so that
   * script either fails or, worse, succeeds against nothing: Prisma emits a
   * client with no models in it and the build dies much later with
   *
   *     Type error: Module '@prisma/client' has no exported member 'Post'
   *
   * which points at the application's own source and not at the install that
   * caused it. shadcn-ui/taxonomy failed exactly this way.
   *
   * Such a repository gives up dependency-layer caching, for the same reason
   * a workspace does: correctness first, and a slower rebuild is worth more
   * than a build that cannot succeed.
   */
  installRunsRepoScripts?: boolean;
  /** Keys only — values are passed as --build-arg at build time, never inlined. */
  publicEnvKeys: string[];
  nodeVersion?: string;
  pythonVersion?: string;
  goVersion?: string;
  /** Overrides from project settings, when the user has set them. */
  buildCommandOverride?: string | null;
  startCommandOverride?: string | null;
  outputDirectoryOverride?: string | null;
}

function argLines(keys: string[]): string {
  const safe = keys.filter((k) => SAFE_KEY.test(k) && isPublicEnvKey(k));
  if (!safe.length) return "";
  return (
    safe.map((k) => `ARG ${k}`).join("\n") + "\n" + safe.map((k) => `ENV ${k}=$${k}`).join("\n") + "\n"
  );
}

/**
 * How to install dependencies.
 *
 * FROZEN ONLY WHEN THERE IS SOMETHING TO FREEZE. A lockfile makes the build
 * reproducible and every package manager has a flag to insist on it — and
 * every one of those flags is a hard error when the file is absent. Choosing
 * the frozen form unconditionally meant a repository without a lockfile could
 * not be built at all, and the failure surfaced as an npm usage message that
 * never mentions lockfiles.
 *
 * So: reproducible when the repository allows it, buildable regardless.
 */
/**
 * How to install dependencies.
 *
 * FROZEN FIRST, THEN FALL BACK — and the fallback is not laziness, it is the
 * only way to survive a lockfile this build did not write.
 *
 * A frozen install is the right default: it is reproducible, and it refuses to
 * silently resolve a different tree from the one the author tested. But it
 * fails for reasons that have nothing to do with the application:
 *
   - the lockfile is a NEWER format than the package manager corepack
 *     resolves. sveltejs/realworld and vercel/next-learn both died on
 *     `ERR_PNPM_BROKEN_LOCKFILE ... duplicated mapping key` because corepack
 *     pulled pnpm 10 for a lockfile written by pnpm 11. Nothing about either
 *     repository is wrong.
 *   - the lockfile is genuinely stale against package.json, which a customer
 *     may not be able to fix on the branch they are deploying.
 *
 * Refusing to build either case means the platform supports repositories whose
 * tooling happens to match ours, which is not support. So: try frozen, and if
 * it fails, resolve fresh. The build log shows both attempts, so a fallback is
 * visible rather than silent — somebody reading it can see the lockfile was not
 * honoured and why.
 *
 * With no lockfile at all there is nothing to freeze and only the second form
 * is attempted, so the log does not carry a failure that was never possible.
 */
function installCmd(pm: DockerfileInput["packageManager"], production = false, hasLockfile = true): string {
  // `||` in a RUN line: the fallback executes only when the frozen attempt
  // exits non-zero, and the step still fails if BOTH fail — a build with no
  // dependencies must never be reported as a success.
  // PARENTHESISED. In a shell, `a && b && c || d` runs d when a or b fails too,
  // so an unparenthesised fallback would fire after a failed `corepack enable`
  // and try to run a package manager that is not there. The group binds the
  // fallback to the install alone.
  const attempt = (frozen: string, loose: string) =>
    hasLockfile ? `(${frozen} || ${loose})` : loose;

  switch (pm) {
    case "pnpm": {
      const prod = production ? " --prod" : "";
      // POSTINSTALL SCRIPTS MUST RUN, and pnpm 10 refuses them by default.
      //
      // It does not merely skip them — it exits non-zero with
      // ERR_PNPM_IGNORED_BUILDS, so the frozen attempt AND the fallback both
      // fail and the build dies. sharp, bcrypt, prisma, esbuild and every other
      // native dependency needs its install script, which means most real
      // applications could not build. vercel/next-learn died on bcrypt and
      // sharp.
      //
      // npm and yarn run these by default, and so do Vercel and Netlify — this
      // restores the behaviour every other path already has rather than
      // granting anything unusual. The build runs in a single-use VM under
      // gVisor with no registry credentials and no cluster access, which is the
      // isolation that makes running a stranger's install script acceptable at
      // all; the alternative is refusing every application with a native
      // dependency.
      const allowBuilds = `pnpm config set dangerouslyAllowAllBuilds true`;
      return `corepack enable && ${allowBuilds} && ${attempt(
        `pnpm install --frozen-lockfile${prod}`,
        `pnpm install --no-frozen-lockfile${prod}`,
      )}`;
    }
    case "yarn": {
      const prod = production ? " --production" : "";
      return `corepack enable && ${attempt(`yarn install --immutable${prod}`, `yarn install${prod}`)}`;
    }
    case "bun": {
      const prod = production ? " --production" : "";
      return attempt(`bun install --frozen-lockfile${prod}`, `bun install${prod}`);
    }
    default: {
      // `npm install` writes a lockfile inside the image, which is harmless —
      // it is thrown away with the build stage and never committed back.
      const omit = production ? " --omit=dev" : "";
      return attempt(`npm ci${omit}`, `npm install${omit}`);
    }
  }
}

/**
 * Run a package script — in a stage that may never have seen corepack.
 *
 * THE BUILDER IS A FRESH IMAGE. `corepack enable` runs in the deps stage, and
 * the builder starts from `FROM node:alpine` again, so it inherits nothing but
 * the node_modules copied into it. `RUN pnpm run build` there fails with
 * `/bin/sh: pnpm: not found`, and it failed for EVERY pnpm and yarn project —
 * only npm worked, because npm ships inside node.
 *
 * Found on sveltejs/realworld once the lockfile fallback got the install past
 * its first error and the build reached the next stage.
 *
 * corepack is bundled with node, so enabling it again costs a moment and no
 * network. npm needs nothing.
 */
/**
 * The base image for a Node build.
 *
 * BUN IS NOT NODE. `bun` does not exist in node:alpine — it is a separate
 * runtime, not something corepack can shim in — so every bun project failed
 * with `bun: not found` at the first install. The generated Dockerfile named
 * bun in three RUN lines and never gave itself a machine that had it.
 *
 * oven/bun ships bun AND a node-compatible runtime, so the same three stages
 * work unchanged; only the FROM differs.
 */
function baseImage(pm: DockerfileInput["packageManager"], node: string): string {
  return pm === "bun" ? "oven/bun:1-alpine" : `node:${node}-alpine`;
}

function runCmd(pm: DockerfileInput["packageManager"], script: string): string {
  const cmd = script.includes(" ") ? script : pm === "npm" ? `npm run ${script}` : `${pm} run ${script}`;
  // bun is not in the node image at all, so corepack cannot conjure it — that
  // needs a bun base image and is tracked separately rather than papered over.
  if (pm === "npm" || pm === "bun") return cmd;
  return `corepack enable && ${cmd}`;
}

/**
 * The runtime for anything that builds to static files.
 *
 * THE PID PATH IS REWRITTEN BY PATTERN, NOT BY LITERAL, and that one detail
 * decides whether any static site runs at all.
 *
 * This matched the literal `/var/run/nginx.pid`. nginx 1.27's shipped config
 * says `/run/nginx.pid`, so the substitution silently did nothing, and the
 * container — running as uid 101 — could not write its pidfile:
 *
 *     [emerg] open() "/run/nginx.pid" failed (13: Permission denied)
 *
 * nginx logged a clean startup first and then died, so the pod reported
 * Running before it began crash-looping and the platform answered 503. Every
 * static site was affected — CRA, Vite, Vue, Angular, Gatsby, Astro, Hugo —
 * and it stayed hidden because the applications deployed here until now were
 * Node servers and repo-supplied Dockerfiles, neither of which touches this
 * stage.
 *
 * Matching `^pid .*` instead survives the path moving again, which it already
 * has once.
 */
/**
 * What a native dependency needs before it can compile.
 *
 * A package with a C++ addon — sharp, bcrypt, sqlite3, canvas, anything built
 * through node-gyp — ships prebuilt binaries for common platforms and falls
 * back to compiling from source when none match. musl/alpine very often has no
 * match, so the fallback is the normal path here, not the rare one, and it needs
 * python3, make and a C++ compiler.
 *
 * Without them the install dies deep inside node-gyp with
 *
 *     gyp ERR! stack Error: Could not find any Python installation to use
 *
 * which names a missing interpreter rather than a missing toolchain and points
 * at nothing the customer controls. gatsby-starter-blog failed exactly this way,
 * and so would any Express app using bcrypt.
 *
 * These land in the dependency and build stages ONLY. The runtime stage never
 * gets a compiler — it does not need one, and shipping one enlarges both the
 * image and its attack surface.
 */
/**
 * The build step, with the project's server-side environment available to it.
 *
 * Plenty of real applications validate configuration at BUILD time rather than
 * at boot: @t3-oss/env-nextjs throws during `next build` when DATABASE_URL is
 * missing, Django's collectstatic can need the same, and a Next.js page that
 * reads a secret during static generation needs it before the container ever
 * exists. Without this those cannot be deployed at all, however correctly the
 * customer filled in their environment — shadcn-ui/taxonomy failed exactly
 * here.
 *
 * A SECRET MOUNT, NOT A BUILD ARG. A build arg is recorded in the image and
 * readable by anyone who can pull it. A secret mount exists for the lifetime of
 * this one RUN and appears in no layer.
 *
 * THE FILE IS TESTED FOR, NOT JUST SOURCED. `.` is a special builtin, and in
 * dash and ash — which is what /bin/sh is on alpine — sourcing a file that does
 * not exist EXITS THE SHELL, `|| true` or no `|| true`. A project with no
 * server-side environment is the normal case, so that path has to be the safe
 * one.
 */
/**
 * Find the built site when it is not where the framework said it would be.
 *
 * ANGULAR IS THE CASE THAT FORCES THIS. Detection records outputDirectory
 * `dist`, which was right until Angular 17; the CLI now writes
 * dist/<project-name>/browser, and the project name is whatever the customer
 * called their app. We cannot know it at generation time, and a Dockerfile
 * COPY cannot glob for it.
 *
 * The failure it prevents is the quiet kind: COPY succeeds, because dist EXISTS
 * — it just contains a directory rather than a site. nginx then serves 404 for
 * every path, on a build that reported success, with no error anywhere to
 * explain it.
 *
 * Only ever runs when the expected path has no index.html, so a framework that
 * puts its output where it promised is untouched. Depth 3 covers
 * dist/<name>/browser without wandering into node_modules-sized trees.
 */
function normaliseOutput(out: string): string {
  return [
    `RUN if [ ! -f "${out}/index.html" ]; then \\`,
    `      found=$(find "${out}" -maxdepth 3 -name index.html -print -quit 2>/dev/null || true); \\`,
    `      if [ -n "$found" ]; then \\`,
    `        src=$(dirname "$found"); \\`,
    `        echo "site is at $src, not ${out} — moving it"; \\`,
    `        mv "$src" /tmp/__site && rm -rf "${out}" && mv /tmp/__site "${out}"; \\`,
    `      else \\`,
    `        echo "no index.html anywhere under ${out}"; exit 1; \\`,
    `      fi; \\`,
    `    fi`,
  ].join("\n");
}

function buildRun(cmd: string): string {
  return (
    "RUN --mount=type=secret,id=ahura-env,target=/run/secrets/ahura-env \\\n" +
    "    if [ -f /run/secrets/ahura-env ]; then . /run/secrets/ahura-env; fi; " +
    cmd
  );
}

/**
 * Whether the dependency stage has to copy the whole repository first.
 *
 * Normally it copies the manifest and the lockfile alone, so the dependency
 * layer caches independently of the source. Two things make that impossible,
 * and both are common enough that guessing wrong breaks real applications.
 */
function needsWholeTree(i: DockerfileInput): boolean {
  return Boolean(i.isWorkspace) || Boolean(i.installRunsRepoScripts);
}

/** Said in the Dockerfile, so the reason survives into the build log. */
function wholeTreeReason(i: DockerfileInput): string {
  return i.isWorkspace
    ? "Workspace: the whole tree, because the root's dependencies are siblings."
    : "This repository runs its own install script, which reads files outside package.json.";
}

const BUILD_TOOLCHAIN = "RUN apk add --no-cache libc6-compat python3 make g++";

const NGINX_STATIC = `
FROM nginx:1.27-alpine AS runner
RUN printf 'server {\\n\\
  listen 8080;\\n\\
  root /usr/share/nginx/html;\\n\\
  index index.html;\\n\\
  location / { try_files $uri $uri/ /index.html; }\\n\\
  gzip on;\\n\\
  gzip_types text/css application/javascript application/json image/svg+xml;\\n\\
}\\n' > /etc/nginx/conf.d/default.conf \\
 && sed -i 's|user  nginx;||' /etc/nginx/nginx.conf \\
 && sed -i 's|^pid .*|pid /tmp/nginx.pid;|' /etc/nginx/nginx.conf \\
 && chown -R 101:101 /usr/share/nginx/html /var/cache/nginx /etc/nginx
USER 101:101
EXPOSE 8080
`.trim();

function nodeDockerfile(i: DockerfileInput): string {
  const d = i.detection;
  const node = i.nodeVersion ?? "22";
  const pm = i.packageManager;
  const build = i.buildCommandOverride ?? d.buildCommand;
  const start = i.startCommandOverride ?? d.startCommand ?? "start";
  const args = argLines(i.publicEnvKeys);

  return `# syntax=docker/dockerfile:1.7
# Generated by AhuraCloud deploy v2 — framework: ${d.framework}
FROM ${baseImage(pm, node)} AS deps
WORKDIR /app
${BUILD_TOOLCHAIN}
${needsWholeTree(i) ? `# ${wholeTreeReason(i)}\nCOPY . .` : `COPY package.json ${pm === "pnpm" ? "pnpm-lock.yaml*" : pm === "yarn" ? "yarn.lock*" : pm === "bun" ? "bun.lock*" : "package-lock.json*"} ./`}
RUN --mount=type=cache,target=/root/.npm ${installCmd(pm, false, i.hasLockfile !== false)}

FROM ${baseImage(pm, node)} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
${args}${build ? buildRun(runCmd(pm, build)) : "# no build step for this framework"}

FROM ${baseImage(pm, node)} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=${d.port}
# Run as the stock non-root 'node' user, never as root.
RUN addgroup -g 1001 -S app 2>/dev/null || true
${pm === "pnpm" || pm === "yarn" ? `# corepack while still root: the CMD below invokes ${pm}, and this stage is a\n# fresh image that has never enabled it. Enabling it after USER fails, because\n# corepack writes shims into the node prefix.\nRUN corepack enable\n` : ""}COPY --from=builder --chown=1000:1000 /app ./
USER 1000:1000
EXPOSE ${d.port}
CMD ${start.includes(" ") ? `["sh","-c","${start.replace(/"/g, '\\"')}"]` : `["${pm}","run","${start}"]`}
`;
}

function staticDockerfile(i: DockerfileInput): string {
  const d = i.detection;
  const node = i.nodeVersion ?? "22";
  const pm = i.packageManager;
  const build = i.buildCommandOverride ?? d.buildCommand;
  const out = i.outputDirectoryOverride ?? d.outputDirectory ?? "dist";
  const args = argLines(i.publicEnvKeys);

  // A static site with no build step is just copied in.
  if (!build) {
    return `# syntax=docker/dockerfile:1.7
# Generated by AhuraCloud deploy v2 — framework: ${d.framework} (static, no build)
${NGINX_STATIC}
COPY ${out} /usr/share/nginx/html
`;
  }

  return `# syntax=docker/dockerfile:1.7
# Generated by AhuraCloud deploy v2 — framework: ${d.framework} (static build)
FROM ${baseImage(pm, node)} AS builder
WORKDIR /app
${BUILD_TOOLCHAIN}
${needsWholeTree(i) ? `# ${wholeTreeReason(i)}\nCOPY . .` : `COPY package.json ${pm === "pnpm" ? "pnpm-lock.yaml*" : pm === "yarn" ? "yarn.lock*" : "package-lock.json*"} ./`}
RUN --mount=type=cache,target=/root/.npm ${installCmd(pm, false, i.hasLockfile !== false)}
COPY . .
${args}${buildRun(runCmd(pm, build))}
${normaliseOutput(out)}

${NGINX_STATIC}
COPY --from=builder /app/${out} /usr/share/nginx/html
`;
}

/**
 * The Hugo version we install.
 *
 * PINNED, NOT `latest`. A site is built against the Hugo it was written for —
 * templates that work on one minor break on the next often enough that Hugo
 * documents it — and a build that silently changes version between two deploys
 * of the same commit is not a build, it is a coin flip. Moving this is a
 * deliberate act with a rebuild behind it.
 */
const HUGO_VERSION = "0.165.0";

/**
 * Hugo.
 *
 * NOT A GO APPLICATION, though it looks like one. gohugoio/hugoDocs ships a
 * go.mod for Hugo modules and a package.json for tooling, and was detected as
 * Go: the build ran `go mod download` against a repository containing no Go
 * program and failed where nobody could interpret it.
 *
 * THE BUILDER IS DEBIAN, NOT ALPINE, which is the one decision here worth
 * stating. Hugo's `extended` build — the one that compiles SCSS, which a large
 * share of themes need — is linked against glibc, and the musl shim on alpine
 * makes it fail at run time rather than at install. Go and git come with the
 * image because Hugo modules fetch through both.
 */
function hugoDockerfile(i: DockerfileInput): string {
  const d = i.detection;
  const build = i.buildCommandOverride ?? d.buildCommand ?? "hugo --minify";
  const out = i.outputDirectoryOverride ?? d.outputDirectory ?? "public";
  const args = argLines(i.publicEnvKeys);

  return `# syntax=docker/dockerfile:1.7
# Generated by AhuraCloud deploy v2 — framework: hugo
FROM golang:1.23-bookworm AS builder
WORKDIR /src
RUN apt-get update \\
 && apt-get install -y --no-install-recommends ca-certificates curl \\
 && rm -rf /var/lib/apt/lists/*
# Node comes from the official image, not from apt.
#
# Hugo pipes reach for it — js.Build resolves imports out of node_modules, and
# PostCSS and Tailwind are ordinary in a theme. Debian bookworm ships Node 18,
# and the Tailwind integration integration invokes node with --permission, which is a
# Node 20 flag, so the build died with
#
#     /usr/bin/node: bad option: --permission
#
# after installing dependencies perfectly well. Copying /usr/local from a
# node image pins the version instead of inheriting whatever the distribution
# froze, and both images are bookworm so the libc matches.
COPY --from=node:22-bookworm-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=node:22-bookworm-slim /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -sf /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \\
 && ln -sf /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \\
 && node --version && npm --version
# The checksum is not pinned because the tag is: GitHub release assets are
# immutable once published, so ${HUGO_VERSION} names exactly one file.
RUN curl -sSLf -o /tmp/hugo.tar.gz \\
  "https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/hugo_extended_${HUGO_VERSION}_linux-amd64.tar.gz" \\
 && tar -xzf /tmp/hugo.tar.gz -C /usr/local/bin hugo \\
 && rm /tmp/hugo.tar.gz \\
 && hugo version
COPY . .
# Tested at build time rather than decided at generation time: plenty of Hugo
# sites have no package.json at all, and the ones that do fail deep inside a
# template render, saying it could not resolve an import, rather than at install.
RUN if [ -f package.json ]; then (npm ci || npm install); fi
${args}${buildRun(build)}

${NGINX_STATIC}
COPY --from=builder /src/${out} /usr/share/nginx/html
`;
}

function pythonDockerfile(i: DockerfileInput): string {
  const d = i.detection;
  const py = i.pythonVersion ?? "3.12";
  const build = i.buildCommandOverride ?? d.buildCommand;
  const start = i.startCommandOverride ?? d.startCommand ?? "python main.py";

  return `# syntax=docker/dockerfile:1.7
# Generated by AhuraCloud deploy v2 — framework: ${d.framework}
FROM python:${py}-slim AS builder
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY requirements.tx[t] pyproject.tom[l] ./
RUN --mount=type=cache,target=/root/.cache/pip \\
    if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; \\
    elif [ -f pyproject.toml ]; then pip install --no-cache-dir .; fi \\
 && pip install --no-cache-dir gunicorn uvicorn
COPY . .
${build ? `RUN ${build}` : "# no build step"}

FROM python:${py}-slim AS runner
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=${d.port}
ENV PATH="/opt/venv/bin:$PATH"
COPY --from=builder /opt/venv /opt/venv
RUN useradd -u 1001 -m app
COPY --from=builder --chown=1001:1001 /app /app
USER 1001:1001
EXPOSE ${d.port}
CMD ["sh","-c","${start.replace(/"/g, '\\"')}"]
`;
}

/**
 * Rust.
 *
 * Same shape as Go: a static binary into a distroless runtime that carries no
 * shell, no package manager and no libc to attack.
 *
 * THE BINARY'S NAME IS NOT KNOWABLE HERE. It is whatever the customer called
 * their package in Cargo.toml, and a workspace may build several. Rather than
 * parse TOML badly, the build asks the filesystem: the release directory holds
 * exactly the executables cargo produced. A workspace with no binary at all —
 * a library — refuses with that said plainly, which is the same answer Go
 * gives for a module with no main package.
 *
 * musl-dev is present because the alpine image links against musl and a crate
 * with a C dependency will not otherwise compile.
 */
function rustDockerfile(i: DockerfileInput): string {
  const d = i.detection;
  const build = i.buildCommandOverride ?? d.buildCommand ?? "cargo build --release --locked";

  return `# syntax=docker/dockerfile:1.7
# Generated by AhuraCloud deploy v2 — framework: rust
FROM rust:1-alpine AS builder
WORKDIR /src
RUN apk add --no-cache musl-dev pkgconfig
COPY . .
RUN --mount=type=cache,target=/usr/local/cargo/registry \\
    --mount=type=cache,target=/src/target \\
    ${build} && \\
    mkdir -p /out && \\
    BIN=$(find target/release -maxdepth 1 -type f -perm -u+x ! -name '*.d' ! -name '*.rlib' | head -1); \\
    if [ -z "$BIN" ]; then echo "no executable in target/release — this looks like a library, not a service"; exit 1; fi; \\
    echo "shipping $BIN"; \\
    cp "$BIN" /out/server

FROM gcr.io/distroless/static-debian12:nonroot AS runner
ENV PORT=${d.port}
COPY --from=builder /out/server /server
USER 65532:65532
EXPOSE ${d.port}
ENTRYPOINT ["/server"]
`;
}

function goDockerfile(i: DockerfileInput): string {
  const d = i.detection;
  const go = i.goVersion ?? "1.23";
  return `# syntax=docker/dockerfile:1.7
# Generated by AhuraCloud deploy v2 — framework: go
FROM golang:${go}-alpine AS builder
WORKDIR /src
COPY go.mod go.su[m] ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY . .
# Building ./... matches EVERY package, and a single -o cannot receive more than one:
#
#     go: cannot write multiple packages to non-directory /out/server
#
# Any module with a package beside its main — which is most of them; this one
# has users, articles and common — failed here after downloading every
# dependency. Asking go which package is the main one covers a main at the root
# and a main under cmd/ alike, and refuses clearly when there is none, which is
# what a library looks like and should not be deployed as a server.
RUN --mount=type=cache,target=/root/.cache/go-build \\
    MAIN=$(go list -f '{{if eq .Name "main"}}{{.ImportPath}}{{end}}' ./... | head -1); \\
    if [ -z "$MAIN" ]; then echo "no main package in this module — nothing to run"; exit 1; fi; \\
    echo "building $MAIN"; \\
    CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/server "$MAIN"

FROM gcr.io/distroless/static-debian12:nonroot AS runner
ENV PORT=${d.port}
COPY --from=builder /out/server /server
USER 65532:65532
EXPOSE ${d.port}
ENTRYPOINT ["/server"]
`;
}

function javaDockerfile(i: DockerfileInput): string {
  const d = i.detection;
  const maven = d.framework === "java-maven";
  return `# syntax=docker/dockerfile:1.7
# Generated by AhuraCloud deploy v2 — framework: ${d.framework}
FROM ${maven ? "maven:3.9-eclipse-temurin-21" : "gradle:8-jdk21"} AS builder
WORKDIR /src
COPY . .
RUN --mount=type=cache,target=/root/.${maven ? "m2" : "gradle"} ${i.buildCommandOverride ?? d.buildCommand}
RUN cp $(ls ${maven ? "target" : "build/libs"}/*.jar | grep -v sources | head -1) /app.jar

FROM eclipse-temurin:21-jre-alpine AS runner
WORKDIR /app
ENV PORT=${d.port}
RUN addgroup -g 1001 -S app && adduser -u 1001 -S app -G app
COPY --from=builder --chown=1001:1001 /app.jar /app/app.jar
USER 1001:1001
EXPOSE ${d.port}
ENTRYPOINT ["java","-XX:MaxRAMPercentage=75","-jar","/app/app.jar"]
`;
}

function rubyDockerfile(i: DockerfileInput): string {
  const d = i.detection;
  return `# syntax=docker/dockerfile:1.7
# Generated by AhuraCloud deploy v2 — framework: ${d.framework}
FROM ruby:3.3-slim AS runner
WORKDIR /app
ENV RAILS_ENV=production RACK_ENV=production PORT=${d.port}
RUN apt-get update -qq && apt-get install -y --no-install-recommends build-essential libpq-dev \\
 && rm -rf /var/lib/apt/lists/*
COPY Gemfile Gemfile.loc[k] ./
RUN bundle config set --local without 'development test' && bundle install
COPY . .
${d.buildCommand ? `RUN ${d.buildCommand} || true` : ""}
RUN useradd -u 1001 -m app && chown -R 1001:1001 /app
USER 1001:1001
EXPOSE ${d.port}
CMD ["sh","-c","${(i.startCommandOverride ?? d.startCommand ?? "").replace(/"/g, '\\"')}"]
`;
}

/**
 * Produce the Dockerfile for a detected repository.
 * Returns null when the repo supplies its own — that one is used verbatim.
 */
export function generateDockerfile(input: DockerfileInput): string | null {
  const { detection } = input;
  if (detection.runtime === "docker") return null;

  switch (detection.runtime) {
    case "node":
      return nodeDockerfile(input);
    case "static":
      return staticDockerfile(input);
    case "hugo":
      return hugoDockerfile(input);
    case "python":
      return pythonDockerfile(input);
    case "rust":
      return rustDockerfile(input);
    case "go":
      return goDockerfile(input);
    case "java":
      return javaDockerfile(input);
    case "ruby":
      return rubyDockerfile(input);
    default:
      // Said the way a customer needs to hear it. This used to read
      // `[dockerfile] No generator for runtime "php"`, which names our internals
      // and reads like a crash rather than a supported answer. Detection is
      // deliberately allowed to recognise runtimes we cannot build yet — knowing
      // what something IS beats calling it unknown — so this path is a real
      // outcome, not an impossible one.
      throw new Error(
        `${detection.framework} is not supported on this platform yet, so there is no build for it. ` +
          `Add a Dockerfile to the repository and it will be built as-is.`,
      );
  }
}

/**
 * The port the generated image actually listens on. Static builds are served
 * by nginx on 8080 regardless of what detection guessed, so the manifest and
 * the container must agree on this one number.
 */
/**
 * The numeric UID the generated image runs as.
 *
 * Kubernetes refuses to start a pod with runAsNonRoot when the image declares
 * a NAMED user ("container has runAsNonRoot and image has non-numeric user"),
 * so both the Dockerfile and the pod spec state the uid numerically.
 */
export function runtimeUid(detection: Detection): number {
  switch (detection.runtime) {
    case "static":
    case "hugo":
      return 101; // nginx unprivileged
    case "go":
    case "rust":
      return 65532; // distroless nonroot
    case "node": return 1000;    // stock node user
    default: return 1001;        // python, java, ruby: created explicitly
  }
}

export function servingPort(detection: Detection): number {
  // ANYTHING NGINX SERVES LISTENS ON 8080, whatever the detection said. The
  // container runs as uid 101 and cannot bind a privileged port, so NGINX_STATIC
  // is written to listen on 8080 — and a Service pointed at 80 finds nothing
  // there. The pod then runs, never goes Ready, and the platform answers 503
  // with no container error to explain it, because nothing crashed. Hugo landed
  // exactly there: it built, published and routed, and served nothing.
  return detection.runtime === "static" || detection.runtime === "hugo" ? 8080 : detection.port;
}
