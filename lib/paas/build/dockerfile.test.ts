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

test("a runtime we cannot build refuses rather than emitting a broken image", () => {
  // EVERY runtime the detector can currently produce has a builder — php was the
  // last one without, and adding it made this test fail because its example was
  // no longer unsupported. The guard still matters: it is what a NEW runtime hits
  // between being detected and being buildable, and detection is deliberately
  // allowed to run ahead of the builders. So the example is one that cannot exist.
  const d = { ...detect(["README.md"]), runtime: "erlang" as unknown as "php", framework: "erlang" };
  // Asserting the PROPERTY, not the wording. This used to pin the exact string
  // `No generator for runtime`, so improving the message — which named our
  // internals and read like a crash — failed a test that had no quarrel with the
  // change. What matters is that it refuses, names what it found, and points at
  // the escape hatch.
  assert.throws(() => generateDockerfile(input({ detection: d })), (e: unknown) => {
    const m = (e as Error).message;
    return m.includes("erlang") && /Dockerfile/.test(m);
  });
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

test("PNPM IS ALLOWED TO RUN INSTALL SCRIPTS", () => {
  // pnpm 10 refuses postinstall scripts by default and does not merely skip
  // them — it exits non-zero with ERR_PNPM_IGNORED_BUILDS, so the frozen
  // attempt AND the fallback both fail and the build dies. sharp, bcrypt,
  // prisma and esbuild all need theirs, which means most real applications
  // could not build. vercel/next-learn died on bcrypt and sharp.
  //
  // npm and yarn run these by default. This restores the behaviour every other
  // path already has rather than granting anything unusual.
  const detection = detect(["package.json"], {
    "package.json": JSON.stringify({ dependencies: { next: "15" }, scripts: { build: "next build" } }),
  });
  const out = generateDockerfile(input({ detection, packageManager: "pnpm", hasLockfile: true }))!;
  const install = out.split("\n").find((l) => l.includes("pnpm install"))!;
  assert.match(install, /dangerouslyAllowAllBuilds/, "pnpm must be allowed to run install scripts");
  assert.ok(
    install.indexOf("dangerouslyAllowAllBuilds") < install.indexOf("pnpm install"),
    "the setting must be applied BEFORE the install, not after it",
  );
});

test("THE FALLBACK IS BOUND TO THE INSTALL, NOT THE WHOLE LINE", () => {
  // In a shell, `a && b && c || d` runs d when a or b fails too. Unparenthesised,
  // a failed `corepack enable` would fall through to a loose install of a
  // package manager that is not there — turning a clear "not found" into a
  // second, more confusing failure.
  const detection = detect(["package.json"], {
    "package.json": JSON.stringify({ dependencies: { next: "15" }, scripts: { build: "next build" } }),
  });
  for (const packageManager of ["pnpm", "yarn"] as const) {
    const out = generateDockerfile(input({ detection, packageManager, hasLockfile: true }))!;
    const install = out.split("\n").find((l) => l.includes(`${packageManager} install`))!;
    assert.match(install, /\(.*\|\|.*\)/, `${packageManager}: the fallback must be parenthesised`);
  }
});

test("A WORKSPACE COPIES ITS TREE BEFORE INSTALLING", () => {
  // The deps stage normally copies only the manifest and the lockfile so the
  // dependency layer caches independently of the source. A workspace cannot
  // install that way — its root dependencies point at sibling packages, and
  // pnpm answers ERR_PNPM_WORKSPACE_PKG_NOT_FOUND against a directory holding
  // none of them. Found on vitejs/vite.
  const detection = detect(["package.json"], {
    "package.json": JSON.stringify({ dependencies: { next: "15" }, scripts: { build: "next build" } }),
  });

  const mono = generateDockerfile(input({ detection, packageManager: "pnpm", hasLockfile: true, isWorkspace: true }))!;
  const firstCopy = mono.split("\n").find((l) => l.startsWith("COPY"))!;
  assert.match(firstCopy, /^COPY \. \.$/, "a workspace must copy the tree before install");

  // And the paired half: a normal repository must KEEP the cheap layer. Copying
  // everything always would slow every build to fix a minority shape.
  const single = generateDockerfile(input({ detection, packageManager: "pnpm", hasLockfile: true }))!;
  const singleCopy = single.split("\n").find((l) => l.startsWith("COPY"))!;
  assert.match(singleCopy, /package\.json/, "a single-package repo must still copy only its manifest");
  assert.doesNotMatch(singleCopy, /^COPY \. \.$/, "…and must not copy the whole tree into the deps layer");
});

// generateDockerfile returns null for a repository that supplies its own
// Dockerfile. None of these cases are that, and a null here would mean the
// generator stopped doing its job — so say so rather than testing `null`.
function mustGenerate(input: DockerfileInput): string {
  const df = generateDockerfile(input);
  assert.ok(df !== null, "expected a generated Dockerfile, got null");
  return df;
}

// PUBLIC ENVIRONMENT VARIABLES REACHING THE BUILD.
//
// The reconciler leaves public keys OUT of the runtime Secret because they are
// supposed to be baked in here. For a long time nothing baked them: deploy.ts
// passed an empty key list, so a customer's NEXT_PUBLIC_ value reached neither
// the bundle nor the container and simply vanished. These fail if that wiring
// is removed again.

test("a public key becomes an ARG and an ENV", () => {
  const df = mustGenerate({
    detection: { framework: "nextjs", runtime: "node", buildCommand: "npm run build", startCommand: "next start", outputDirectory: ".next", port: 3000, confidence: "certain", reason: "t" },
    packageManager: "npm",
    hasLockfile: true,
    publicEnvKeys: ["NEXT_PUBLIC_API_URL"],
  });
  assert.match(df, /^ARG NEXT_PUBLIC_API_URL$/m);
  assert.match(df, /^ENV NEXT_PUBLIC_API_URL=\$NEXT_PUBLIC_API_URL$/m);
});

test("the value is declared BEFORE the build, or the bundler cannot read it", () => {
  const df = mustGenerate({
    detection: { framework: "nextjs", runtime: "node", buildCommand: "npm run build", startCommand: "next start", outputDirectory: ".next", port: 3000, confidence: "certain", reason: "t" },
    packageManager: "npm",
    hasLockfile: true,
    publicEnvKeys: ["NEXT_PUBLIC_API_URL"],
  });
  const env = df.indexOf("ENV NEXT_PUBLIC_API_URL");
  const build = df.indexOf("npm run build");
  assert.ok(env >= 0 && build >= 0, "both lines must exist");
  assert.ok(env < build, "the ENV must come first");
});

test("A KEY THAT IS NOT PUBLIC NEVER ENTERS A LAYER", () => {
  const df = mustGenerate({
    detection: { framework: "nextjs", runtime: "node", buildCommand: "npm run build", startCommand: "next start", outputDirectory: ".next", port: 3000, confidence: "certain", reason: "t" },
    packageManager: "npm",
    hasLockfile: true,
    publicEnvKeys: ["DATABASE_URL", "NEXT_PUBLIC_OK"],
  });
  // Anyone who can pull the image can read its build args.
  assert.ok(!df.includes("DATABASE_URL"), "a secret must not appear in the Dockerfile");
  assert.match(df, /^ARG NEXT_PUBLIC_OK$/m);
});

test("a key that could break out of the ARG line is dropped", () => {
  const df = mustGenerate({
    detection: { framework: "nextjs", runtime: "node", buildCommand: "npm run build", startCommand: "next start", outputDirectory: ".next", port: 3000, confidence: "certain", reason: "t" },
    packageManager: "npm",
    hasLockfile: true,
    publicEnvKeys: ["NEXT_PUBLIC_A B", "NEXT_PUBLIC_GOOD"],
  });
  assert.ok(!df.includes("NEXT_PUBLIC_A B"));
  assert.match(df, /^ARG NEXT_PUBLIC_GOOD$/m);
});

test("EVERY ONE OF THESE CAN ACTUALLY FAIL", () => {
  // Without this, a generator that emitted nothing at all would pass three of
  // the four tests above.
  const df = mustGenerate({
    detection: { framework: "nextjs", runtime: "node", buildCommand: "npm run build", startCommand: "next start", outputDirectory: ".next", port: 3000, confidence: "certain", reason: "t" },
    packageManager: "npm",
    hasLockfile: true,
    publicEnvKeys: [],
  });
  assert.ok(!df.includes("ARG NEXT_PUBLIC"), "no keys means no ARG lines");
  const withKey = mustGenerate({
    detection: { framework: "nextjs", runtime: "node", buildCommand: "npm run build", startCommand: "next start", outputDirectory: ".next", port: 3000, confidence: "certain", reason: "t" },
    packageManager: "npm",
    hasLockfile: true,
    publicEnvKeys: ["NEXT_PUBLIC_API_URL"],
  });
  assert.ok(withKey.includes("ARG NEXT_PUBLIC_API_URL"), "and one key means one ARG line");
});

// A NATIVE DEPENDENCY MUST BE ABLE TO COMPILE.
//
// sharp, bcrypt, sqlite3 and anything else built through node-gyp fall back to
// compiling from source when no prebuilt binary matches the platform — which on
// musl/alpine is the normal case, not the rare one. Without python3 and a C++
// compiler the install dies inside node-gyp with "Could not find any Python
// installation to use", which names an interpreter rather than a toolchain.
// gatsby-starter-blog failed exactly this way.

test("the stage that installs dependencies can compile them", () => {
  const df = mustGenerate({
    detection: { framework: "nextjs", runtime: "node", buildCommand: "npm run build", startCommand: "next start", outputDirectory: ".next", port: 3000, confidence: "certain", reason: "t" },
    packageManager: "npm",
    hasLockfile: true,
    publicEnvKeys: [],
  });
  const deps = df.slice(df.indexOf("AS deps"), df.indexOf("AS builder"));
  assert.match(deps, /apk add --no-cache libc6-compat python3 make g\+\+/);
});

test("THE RUNTIME IMAGE NEVER SHIPS A COMPILER", () => {
  const df = mustGenerate({
    detection: { framework: "nextjs", runtime: "node", buildCommand: "npm run build", startCommand: "next start", outputDirectory: ".next", port: 3000, confidence: "certain", reason: "t" },
    packageManager: "npm",
    hasLockfile: true,
    publicEnvKeys: [],
  });
  // A compiler in the shipped image is weight and attack surface for a container
  // whose only job is to run an already-built application.
  const runner = df.slice(df.indexOf("AS runner"));
  assert.ok(!runner.includes("g++"), "the runner stage must not install a compiler");
  assert.ok(!runner.includes("python3"), "the runner stage must not install python");
});

test("a static build gets the toolchain too", () => {
  const df = mustGenerate({
    detection: { framework: "vite", runtime: "static", buildCommand: "npm run build", startCommand: null, outputDirectory: "dist", port: 80, confidence: "certain", reason: "t" },
    packageManager: "npm",
    hasLockfile: true,
    publicEnvKeys: [],
  });
  const builder = df.slice(df.indexOf("AS builder"), df.indexOf("nginx"));
  assert.match(builder, /python3 make g\+\+/);
});

// AN INSTALL THAT RUNS THE REPOSITORY'S OWN SCRIPTS NEEDS THE REPOSITORY.
//
// `prisma generate` is the commonest postinstall there is and it reads
// prisma/schema.prisma, which the manifest-only deps stage has not copied. It
// then emits a client with no models, and the build dies much later with a type
// error in the application's own source — pointing nowhere near the cause.

test("a postinstall makes the deps stage copy the whole tree", () => {
  const df = mustGenerate({
    detection: { framework: "nextjs", runtime: "node", buildCommand: "npm run build", startCommand: "next start", outputDirectory: ".next", port: 3000, confidence: "certain", reason: "t" },
    packageManager: "npm",
    hasLockfile: true,
    publicEnvKeys: [],
    installRunsRepoScripts: true,
  });
  const deps = df.slice(df.indexOf("AS deps"), df.indexOf("AS builder"));
  assert.match(deps, /^COPY \. \.$/m);
  assert.ok(!/^COPY package\.json/m.test(deps), "the manifest-only copy must be gone");
});

test("WITHOUT ONE, THE DEPENDENCY LAYER STILL CACHES", () => {
  // The whole-tree copy costs cache granularity, so it must not be the default.
  const df = mustGenerate({
    detection: { framework: "nextjs", runtime: "node", buildCommand: "npm run build", startCommand: "next start", outputDirectory: ".next", port: 3000, confidence: "certain", reason: "t" },
    packageManager: "npm",
    hasLockfile: true,
    publicEnvKeys: [],
  });
  const deps = df.slice(df.indexOf("AS deps"), df.indexOf("AS builder"));
  assert.match(deps, /^COPY package\.json/m);
});

test("the Dockerfile says WHICH reason applied", () => {
  const workspace = mustGenerate({
    detection: { framework: "nextjs", runtime: "node", buildCommand: "npm run build", startCommand: "next start", outputDirectory: ".next", port: 3000, confidence: "certain", reason: "t" },
    packageManager: "pnpm",
    hasLockfile: true,
    publicEnvKeys: [],
    isWorkspace: true,
  });
  const scripts = mustGenerate({
    detection: { framework: "nextjs", runtime: "node", buildCommand: "npm run build", startCommand: "next start", outputDirectory: ".next", port: 3000, confidence: "certain", reason: "t" },
    packageManager: "pnpm",
    hasLockfile: true,
    publicEnvKeys: [],
    installRunsRepoScripts: true,
  });
  // Two causes with the same symptom; the build log should not conflate them.
  assert.match(workspace, /siblings/);
  assert.match(scripts, /own install script/);
});

test("EVERYTHING NGINX SERVES IS ROUTED TO 8080", () => {
  // The container runs as uid 101 and cannot bind a privileged port, so
  // NGINX_STATIC listens on 8080. A Service pointed at 80 finds nothing there:
  // the pod runs, never goes Ready, and the platform answers 503 with no
  // container error to explain it, because nothing crashed. Hugo landed exactly
  // there — it built, published, routed and served nothing.
  const nginxRuntimes = [
    { framework: "vite", runtime: "static" as const, port: 80 },
    { framework: "hugo", runtime: "hugo" as const, port: 80 },
  ];
  for (const r of nginxRuntimes) {
    const port = servingPort({
      framework: r.framework,
      runtime: r.runtime,
      buildCommand: "b",
      startCommand: null,
      outputDirectory: "public",
      port: r.port,
      confidence: "certain",
      reason: "t",
    });
    assert.equal(port, 8080, `${r.framework} must be served on 8080`);
  }
});

test("a runtime that is NOT nginx keeps its own port", () => {
  // Otherwise the test above would pass against a function returning 8080 always.
  const port = servingPort({
    framework: "nextjs",
    runtime: "node",
    buildCommand: "npm run build",
    startCommand: "start",
    outputDirectory: ".next",
    port: 3000,
    confidence: "certain",
    reason: "t",
  });
  assert.equal(port, 3000);
});

// FINDING THE SITE WHEN IT IS NOT WHERE THE FRAMEWORK PROMISED.
//
// Angular forces this. Detection records outputDirectory `dist`, which was right
// until Angular 17; the CLI now writes dist/<project-name>/browser, and the
// project name is whatever the customer called their app — unknowable at
// generation time, and a Dockerfile COPY cannot glob for it.
//
// The failure is the quiet kind: COPY succeeds, because dist EXISTS — it just
// holds a directory rather than a site. nginx then answers 404 for every path on
// a build that reported success.
//
// The shell was checked against a real /bin/sh, not only read:
//   dist/myapp/browser/index.html  ->  dist/index.html

test("a static build looks for its output when the expected path has none", () => {
  const df = mustGenerate({
    detection: { framework: "angular", runtime: "static", buildCommand: "npm run build", startCommand: null, outputDirectory: "dist", port: 80, confidence: "certain", reason: "t" },
    packageManager: "npm",
    hasLockfile: true,
    publicEnvKeys: [],
  });
  assert.match(df, /if \[ ! -f "dist\/index\.html" \]/);
  assert.match(df, /-maxdepth 3 -name index\.html/);
});

test("IT RUNS AFTER THE BUILD AND BEFORE THE COPY", () => {
  // Before the build there is nothing to find; after the COPY it is too late.
  const df = mustGenerate({
    detection: { framework: "angular", runtime: "static", buildCommand: "npm run build", startCommand: null, outputDirectory: "dist", port: 80, confidence: "certain", reason: "t" },
    packageManager: "npm",
    hasLockfile: true,
    publicEnvKeys: [],
  });
  const build = df.indexOf("npm run build");
  const normalise = df.indexOf("-maxdepth 3 -name index.html");
  const copy = df.indexOf("COPY --from=builder");
  assert.ok(build < normalise, "normalisation must follow the build");
  assert.ok(normalise < copy, "and precede the copy");
});

test("finding nothing at all FAILS rather than shipping an empty site", () => {
  const df = mustGenerate({
    detection: { framework: "vite", runtime: "static", buildCommand: "npm run build", startCommand: null, outputDirectory: "dist", port: 80, confidence: "certain", reason: "t" },
    packageManager: "npm",
    hasLockfile: true,
    publicEnvKeys: [],
  });
  // An nginx serving nothing, from a build that said it succeeded, is the worst
  // available outcome — it looks like a routing fault for as long as anyone cares
  // to look.
  assert.match(df, /no index\.html anywhere under dist"; exit 1/);
});

// PHP, AND THE PART THAT IS NOT ABOUT PHP.
//
// Apache normally starts as root, binds port 80 and drops to www-data. This
// container never gets to be root, so all three assumptions have to be undone.
// Every static site on this platform once crash-looped because exactly one
// detail of this kind — an nginx pidfile — was missed, and the symptom was a 503
// behind a clean startup log.

function php() {
  return mustGenerate({
    detection: { framework: "php", runtime: "php", buildCommand: "composer install", startCommand: null, outputDirectory: "public", port: 8080, confidence: "likely", reason: "t" },
    packageManager: "npm",
    hasLockfile: false,
    publicEnvKeys: [],
  });
}

test("php listens on an unprivileged port and runs unprivileged", () => {
  const df = php();
  assert.match(df, /Listen 8080/);
  assert.match(df, /^USER 1001:1001$/m);
  assert.ok(!/^USER root$/m.test(df), "the runner must not run as root");
});

test("ITS RUNTIME PATHS ARE WRITABLE BY THE UID THAT USES THEM", () => {
  const df = php();
  // Created before they are chowned: /var/run/apache2 does not exist in the
  // base image, and `set -eux` would abort the whole layer on the chown.
  assert.match(df, /mkdir -p \/var\/run\/apache2/);
  assert.ok(
    df.indexOf("mkdir -p /var/run/apache2") < df.indexOf("chown -R 1001:1001"),
    "the directories must exist before they are chowned",
  );
  assert.match(df, /PidFile \/tmp\/apache2\.pid/);
});

test("THE DOCUMENT ROOT IS TESTED FOR, NOT ASSUMED", () => {
  // Laravel and Symfony serve from public/; a plain PHP app serves from its
  // root. Getting this wrong serves the application's SOURCE, which is a
  // security question rather than a cosmetic one.
  const df = php();
  assert.match(df, /if \[ -f \/var\/www\/html\/public\/index\.php \]/);
  assert.match(df, /DocumentRoot/);
});

test("composer runs without dev dependencies", () => {
  assert.match(php(), /composer install --no-dev/);
});
