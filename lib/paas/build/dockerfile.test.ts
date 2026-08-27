/**
 * Dockerfile generation tests, weighted toward the security properties.
 *
 *   node --test lib/paas/build/dockerfile.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { generateDockerfile, servingPort, isPublicEnvKey, type DockerfileInput } from "./dockerfile.ts";
import { detectFramework, type RepoFiles } from "./detect.ts";

function detect(paths: string[], contents: Record<string, string> = {}) {
  return detectFramework({ paths, contents } as RepoFiles);
}

function input(over: Partial<DockerfileInput> & { detection: DockerfileInput["detection"] }): DockerfileInput {
  return { packageManager: "npm", publicEnvKeys: [], ...over };
}

const nextDetection = detect(["package.json"], {
  "package.json": JSON.stringify({ dependencies: { next: "15" }, scripts: { build: "next build", start: "next start" } }),
});

// ── security invariants ─────────────────────────────────────────────────────

test("every generated runtime stage drops root", () => {
  const cases = [
    detect(["package.json"], { "package.json": JSON.stringify({ dependencies: { express: "4" }, scripts: { start: "node i.js" } }) }),
    detect(["package.json"], { "package.json": JSON.stringify({ dependencies: { vite: "5" }, scripts: { build: "vite build" } }) }),
    detect(["requirements.txt"], { "requirements.txt": "fastapi" }),
    detect(["go.mod"]),
    detect(["pom.xml"]),
    detect(["Gemfile"], { Gemfile: "gem 'rails'" }),
  ];
  for (const d of cases) {
    const df = generateDockerfile(input({ detection: d }));
    assert.ok(df, `expected a Dockerfile for ${d.framework}`);
    // The UID must be NUMERIC. Kubernetes refuses to start a pod with
    // runAsNonRoot when the image declares a named user — "image has
    // non-numeric user (node), cannot verify user is non-root". That failed on
    // the live cluster, which is why this asserts the shape rather than just
    // the presence of a USER line.
    const users = [...df!.matchAll(/^USER\s+(\S+)/gm)].map((m) => m[1]);
    assert.ok(users.length > 0, `${d.framework} declares no USER`);
    for (const u of users) {
      assert.match(u, /^[1-9]\d*(:[1-9]\d*)?$/, `${d.framework} USER "${u}" must be a numeric non-zero uid`);
    }
  }
});

test("only public-prefixed env keys become build args", () => {
  const df = generateDockerfile(
    input({
      detection: nextDetection,
      publicEnvKeys: ["NEXT_PUBLIC_API_URL", "DATABASE_URL", "STRIPE_SECRET_KEY", "VITE_TITLE"],
    }),
  )!;
  assert.match(df, /ARG NEXT_PUBLIC_API_URL/);
  assert.match(df, /ARG VITE_TITLE/);
  // Server secrets must never enter an image layer.
  assert.doesNotMatch(df, /DATABASE_URL/);
  assert.doesNotMatch(df, /STRIPE_SECRET_KEY/);
});

test("env keys that fail the charset guard are dropped, not templated", () => {
  const df = generateDockerfile(
    input({ detection: nextDetection, publicEnvKeys: ["NEXT_PUBLIC_OK", "NEXT_PUBLIC_BAD;rm -rf /"] }),
  )!;
  assert.match(df, /ARG NEXT_PUBLIC_OK/);
  assert.doesNotMatch(df, /rm -rf/);
});

test("isPublicEnvKey covers the known public prefixes and nothing else", () => {
  for (const k of ["NEXT_PUBLIC_X", "VITE_X", "PUBLIC_X", "REACT_APP_X", "NUXT_PUBLIC_X"]) {
    assert.equal(isPublicEnvKey(k), true, k);
  }
  for (const k of ["DATABASE_URL", "SECRET", "MY_NEXT_PUBLIC_X", "API_KEY"]) {
    assert.equal(isPublicEnvKey(k), false, k);
  }
});

// ── per-runtime shape ───────────────────────────────────────────────────────

test("repo-supplied Dockerfile returns null so it is used verbatim", () => {
  const df = generateDockerfile(input({ detection: detect(["Dockerfile"]) }));
  assert.equal(df, null);
});

test("Next.js image is multi-stage and installs with the detected package manager", () => {
  const df = generateDockerfile(input({ detection: nextDetection, packageManager: "pnpm" }))!;
  assert.match(df, /AS deps/);
  assert.match(df, /AS builder/);
  assert.match(df, /AS runner/);
  assert.match(df, /pnpm install --frozen-lockfile/);
  assert.match(df, /pnpm-lock\.yaml/);
});

test("yarn and bun produce their own install commands", () => {
  assert.match(generateDockerfile(input({ detection: nextDetection, packageManager: "yarn" }))!, /yarn install --immutable/);
  assert.match(generateDockerfile(input({ detection: nextDetection, packageManager: "bun" }))!, /bun install --frozen-lockfile/);
});

test("static builds are served by nginx on 8080, not by node", () => {
  const d = detect(["package.json"], {
    "package.json": JSON.stringify({ dependencies: { vite: "5" }, scripts: { build: "vite build" } }),
  });
  const df = generateDockerfile(input({ detection: d }))!;
  assert.match(df, /FROM nginx:/);
  assert.match(df, /listen 8080/);
  assert.equal(servingPort(d), 8080);
});

test("static site with no build step skips the builder stage entirely", () => {
  const d = detect(["index.html"]);
  const df = generateDockerfile(input({ detection: d }))!;
  assert.doesNotMatch(df, /AS builder/);
  assert.match(df, /COPY \. \/usr\/share\/nginx\/html/);
});

test("Go produces a distroless nonroot image", () => {
  const df = generateDockerfile(input({ detection: detect(["go.mod"]) }))!;
  assert.match(df, /distroless/);
  assert.match(df, /USER 65532/);
  assert.match(df, /CGO_ENABLED=0/);
});

test("Python venv is copied into a clean runner stage", () => {
  const df = generateDockerfile(input({ detection: detect(["requirements.txt"], { "requirements.txt": "fastapi" }) }))!;
  assert.match(df, /python -m venv \/opt\/venv/);
  assert.match(df, /COPY --from=builder \/opt\/venv \/opt\/venv/);
  assert.match(df, /USER 1001/);
});

test("Java bounds heap to the container, not the host", () => {
  const df = generateDockerfile(input({ detection: detect(["pom.xml"]) }))!;
  assert.match(df, /MaxRAMPercentage/);
  assert.match(df, /temurin.*jre/);
});

test("build and start commands can be overridden by project settings", () => {
  const df = generateDockerfile(
    input({ detection: nextDetection, buildCommandOverride: "build:prod", startCommandOverride: "node custom.js" }),
  )!;
  assert.match(df, /npm run build:prod/);
  assert.match(df, /node custom\.js/);
});

test("servingPort matches the port the container actually exposes", () => {
  const node = detect(["package.json"], {
    "package.json": JSON.stringify({ dependencies: { express: "4" }, scripts: { start: "node i.js" } }),
  });
  const df = generateDockerfile(input({ detection: node }))!;
  assert.equal(servingPort(node), 3000);
  assert.match(df, /EXPOSE 3000/);
});

test("unknown runtime refuses rather than emitting a broken image", () => {
  const d = { ...detect(["README.md"]), runtime: "php" as const };
  assert.throws(() => generateDockerfile(input({ detection: d })), /No generator for runtime/);
});

test("A FROZEN INSTALL IS ONLY CHOSEN WHEN THERE IS A LOCKFILE", () => {
  // `npm ci` is a hard error without package-lock.json, and pnpm, yarn and bun
  // all refuse in their own way. Choosing the frozen form unconditionally meant
  // no repository without a lockfile could be built at all — a large share of
  // samples, templates and small projects. Found by deploying
  // fastify/fastify-example-todo, which died at `npm ci` with a usage message
  // that never mentions lockfiles.
  const detection = detect(["package.json"], {
    "package.json": JSON.stringify({ dependencies: { express: "4" }, scripts: { start: "node i.js" } }),
  });

  for (const packageManager of ["npm", "yarn", "pnpm", "bun"] as const) {
    const withLock = generateDockerfile(input({ detection, packageManager, hasLockfile: true }));
    const without = generateDockerfile(input({ detection, packageManager, hasLockfile: false }));
    assert.ok(withLock && without, `${packageManager}: expected both Dockerfiles`);

    assert.match(
      withLock!,
      /npm ci|--frozen-lockfile|--immutable/,
      `${packageManager} with a lockfile must install frozen`,
    );
    assert.doesNotMatch(
      without!,
      /npm ci(?![a-z])|--frozen-lockfile|--immutable/,
      `${packageManager} without a lockfile must NOT demand one`,
    );
  }
});

test("the install step is still reproducible by default", () => {
  // The paired half. If a missing lockfile relaxed the install for everyone,
  // every build would quietly stop being reproducible.
  const detection = detect(["package.json"], {
    "package.json": JSON.stringify({ dependencies: { express: "4" }, scripts: { start: "node i.js" } }),
  });
  const out = generateDockerfile(input({ detection, packageManager: "npm" }));
  assert.match(out!, /npm ci/, "no explicit flag means assume a lockfile and stay frozen");
});

test("A LOCKFILE THIS BUILD DID NOT WRITE MUST NOT BE FATAL", () => {
  // sveltejs/realworld and vercel/next-learn both died on
  // ERR_PNPM_BROKEN_LOCKFILE — corepack resolved pnpm 10 for a lockfile written
  // by pnpm 11. Nothing about either repository is wrong, and refusing them
  // means supporting only repositories whose tooling happens to match ours.
  //
  // So the frozen install is attempted FIRST and a fresh resolve follows it.
  // Both must be present, in that order, or the guarantee is gone.
  const detection = detect(["package.json"], {
    "package.json": JSON.stringify({ dependencies: { express: "4" }, scripts: { start: "node i.js" } }),
  });

  for (const [packageManager, frozen, loose] of [
    ["npm", "npm ci", "npm install"],
    ["pnpm", "pnpm install --frozen-lockfile", "pnpm install --no-frozen-lockfile"],
    ["yarn", "yarn install --immutable", "yarn install"],
    ["bun", "bun install --frozen-lockfile", "bun install"],
  ] as const) {
    const out = generateDockerfile(input({ detection, packageManager, hasLockfile: true }))!;
    const install = out.split("\n").find((l) => l.includes(frozen))!;
    assert.ok(install, `${packageManager}: expected a frozen install line`);
    assert.ok(
      install.includes("||"),
      `${packageManager}: the frozen install must have a fallback, not fail the build`,
    );
    assert.ok(
      install.indexOf(frozen) < install.lastIndexOf(loose),
      `${packageManager}: frozen must be attempted BEFORE the fresh resolve`,
    );
  }
});

test("with no lockfile there is no failed attempt to fall back FROM", () => {
  // The paired half. Emitting `npm ci || npm install` with no lockfile would put
  // a guaranteed failure in every build log, and a log that always contains an
  // error teaches people to ignore errors.
  const detection = detect(["package.json"], {
    "package.json": JSON.stringify({ dependencies: { express: "4" }, scripts: { start: "node i.js" } }),
  });
  const out = generateDockerfile(input({ detection, packageManager: "npm", hasLockfile: false }))!;
  const install = out.split("\n").find((l) => l.includes("npm install"))!;
  assert.doesNotMatch(install, /npm ci/, "nothing to freeze means no frozen attempt");
  assert.doesNotMatch(install, /\|\|/, "and therefore nothing to fall back from");
});

test("EVERY STAGE THAT INVOKES pnpm OR yarn ENABLES COREPACK FIRST", () => {
  // Each stage is a fresh `FROM node:alpine` and inherits nothing. corepack ran
  // in deps, so `RUN pnpm run build` in the builder died with
  // `/bin/sh: pnpm: not found` — for EVERY pnpm and yarn project. Only npm
  // worked, because npm ships inside node.
  //
  // Found on sveltejs/realworld, and there were three stages with the same bug:
  // deps had it, builder did not, and the runner's CMD invoked the package
  // manager in a third image that had never seen it either.
  const detection = detect(["package.json"], {
    "package.json": JSON.stringify({
      dependencies: { "@sveltejs/kit": "2" },
      scripts: { build: "vite build", start: "node build" },
    }),
  });

  for (const packageManager of ["pnpm", "yarn"] as const) {
    const out = generateDockerfile(input({ detection, packageManager, hasLockfile: true }))!;

    for (const stageLine of out.split("\n")) {
      // Any RUN that invokes the package manager must enable corepack on the
      // same line — a previous stage having done it proves nothing.
      if (!new RegExp(`^RUN .*\b${packageManager}\b`).test(stageLine)) continue;
      assert.match(
        stageLine,
        /corepack enable/,
        `${packageManager}: "${stageLine.slice(0, 70)}" runs the package manager without enabling corepack`,
      );
    }

    // And the runner enables it while still root: corepack writes shims into the
    // node prefix, which fails once USER has dropped privileges.
    const runner = out.slice(out.lastIndexOf("AS runner"));
    // ANCHORED TO LINE START. indexOf("USER ") matched the word inside the
    // comment explaining this very ordering, so the test failed against a
    // Dockerfile that was correct — a false red is as expensive as a false
    // green, because the next person distrusts the check rather than the code.
    const enableIdx = runner.search(/^RUN corepack enable$/m);
    const userIdx = runner.search(/^USER /m);
    assert.ok(enableIdx > 0, `${packageManager}: the runner must enable corepack`);
    assert.ok(enableIdx < userIdx, `${packageManager}: corepack must be enabled BEFORE dropping root`);
  }
});

test("npm needs no corepack anywhere", () => {
  // The paired half. Adding `corepack enable` to every image would slow every
  // npm build for nothing, and this asserts the fix stayed targeted.
  const detection = detect(["package.json"], {
    "package.json": JSON.stringify({ dependencies: { express: "4" }, scripts: { start: "node i.js" } }),
  });
  const out = generateDockerfile(input({ detection, packageManager: "npm", hasLockfile: true }))!;
  assert.doesNotMatch(out, /corepack/, "npm ships with node; enabling corepack is pure cost");
});

test("BUN GETS A BUN IMAGE, AND NOTHING ELSE DOES", () => {
  // bun is not node. It does not exist in node:alpine and corepack cannot shim
  // it in — it is a separate runtime. The generated Dockerfile named bun in
  // three RUN lines and never gave itself a machine that had it, so every bun
  // project died at `bun: not found` on the first install.
  //
  // Both directions asserted: bun must get oven/bun, and npm/pnpm/yarn must NOT
  // — switching everyone to a bun image would be a far larger change than the
  // bug it fixed.
  const detection = detect(["package.json"], {
    "package.json": JSON.stringify({
      dependencies: { "@sveltejs/kit": "2" },
      scripts: { build: "vite build", start: "node build" },
    }),
  });

  const bun = generateDockerfile(input({ detection, packageManager: "bun", hasLockfile: true }))!;
  const bunFroms = bun.split("\n").filter((l) => l.startsWith("FROM "));
  assert.ok(bunFroms.length >= 3, "expected a multi-stage build");
  for (const f of bunFroms) {
    assert.match(f, /oven\/bun/, `bun stage must use a bun image, got: ${f}`);
  }

  for (const packageManager of ["npm", "pnpm", "yarn"] as const) {
    const out = generateDockerfile(input({ detection, packageManager, hasLockfile: true }))!;
    assert.doesNotMatch(out, /oven\/bun/, `${packageManager} must stay on the node image`);
    assert.match(out, /FROM node:/, `${packageManager} must use a node image`);
  }
});
