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
    assert.match(
      df!,
      /USER\s+(node|app|nonroot|101)/,
      `${d.framework} runtime stage must run as non-root`,
    );
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
  assert.match(df, /USER nonroot:nonroot/);
  assert.match(df, /CGO_ENABLED=0/);
});

test("Python venv is copied into a clean runner stage", () => {
  const df = generateDockerfile(input({ detection: detect(["requirements.txt"], { "requirements.txt": "fastapi" }) }))!;
  assert.match(df, /python -m venv \/opt\/venv/);
  assert.match(df, /COPY --from=builder \/opt\/venv \/opt\/venv/);
  assert.match(df, /USER app/);
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
