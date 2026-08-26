/**
 * Framework detection tests.
 *
 * Runs with zero dependencies:  node --test lib/paas/build/detect.test.ts
 * (Node 24 strips types natively; node:test and node:assert are built in.)
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { detectFramework, detectPackageManager, type RepoFiles } from "./detect.ts";

function repo(paths: string[], contents: Record<string, string> = {}): RepoFiles {
  return { paths, contents };
}

function pkg(deps: Record<string, string>, scripts: Record<string, string> = {}, extra = {}) {
  return JSON.stringify({ dependencies: deps, scripts, ...extra });
}

test("Dockerfile outranks every other signal", () => {
  const d = detectFramework(
    repo(["Dockerfile", "package.json"], { "package.json": pkg({ next: "15.0.0" }, { build: "next build" }) }),
  );
  assert.equal(d.framework, "dockerfile");
  assert.equal(d.runtime, "docker");
  assert.equal(d.confidence, "certain");
});

test("Next.js detected from dependencies", () => {
  const d = detectFramework(
    repo(["package.json"], { "package.json": pkg({ next: "15.0.0", react: "19" }, { build: "next build", start: "next start" }) }),
  );
  assert.equal(d.framework, "nextjs");
  assert.equal(d.runtime, "node");
  assert.equal(d.port, 3000);
  assert.equal(d.buildCommand, "build");
});

test("Next.js standalone output changes the start command", () => {
  const d = detectFramework(
    repo(["package.json", "next.config.js"], {
      "package.json": pkg({ next: "15.0.0" }, { build: "next build" }),
      "next.config.js": "module.exports = { output: 'standalone' }",
    }),
  );
  assert.equal(d.framework, "nextjs");
  assert.equal(d.startCommand, "node server.js");
});

test("Nuxt detected and served from .output", () => {
  const d = detectFramework(repo(["package.json"], { "package.json": pkg({ nuxt: "3.12.0" }, { build: "nuxt build" }) }));
  assert.equal(d.framework, "nuxtjs");
  assert.equal(d.startCommand, "node .output/server/index.mjs");
});

test("SvelteKit detected", () => {
  const d = detectFramework(
    repo(["package.json"], { "package.json": pkg({ "@sveltejs/kit": "2.0.0" }, { build: "vite build" }) }),
  );
  assert.equal(d.framework, "sveltekit");
  assert.equal(d.runtime, "node");
});

test("Vite+React is a static build, not a Node server", () => {
  const d = detectFramework(
    repo(["package.json"], { "package.json": pkg({ vite: "5.0.0", react: "19" }, { build: "vite build" }) }),
  );
  assert.equal(d.framework, "vite-react");
  assert.equal(d.runtime, "static");
  assert.equal(d.startCommand, null);
  assert.equal(d.outputDirectory, "dist");
});

test("Vite+Vue distinguished from Vite+React", () => {
  const d = detectFramework(
    repo(["package.json"], { "package.json": pkg({ vite: "5.0.0", vue: "3.4.0" }, { build: "vite build" }) }),
  );
  assert.equal(d.framework, "vite-vue");
});

test("Angular detected as static", () => {
  const d = detectFramework(
    repo(["package.json"], { "package.json": pkg({ "@angular/core": "18.0.0" }, { build: "ng build" }) }),
  );
  assert.equal(d.framework, "angular");
  assert.equal(d.runtime, "static");
});

test("Create React App detected", () => {
  const d = detectFramework(
    repo(["package.json"], { "package.json": pkg({ "react-scripts": "5.0.1" }, { build: "react-scripts build" }) }),
  );
  assert.equal(d.framework, "create-react-app");
  assert.equal(d.outputDirectory, "build");
});

test("Express detected as a Node server", () => {
  const d = detectFramework(
    repo(["package.json"], { "package.json": pkg({ express: "4.19.0" }, { start: "node index.js" }) }),
  );
  assert.equal(d.framework, "express");
  assert.equal(d.runtime, "node");
  assert.equal(d.port, 3000);
});

test("NestJS beats plain express when both present", () => {
  const d = detectFramework(
    repo(["package.json"], { "package.json": pkg({ "@nestjs/core": "10", express: "4" }, { start: "nest start" }) }),
  );
  assert.equal(d.framework, "nestjs");
});

test("generic Node app with only a start script", () => {
  const d = detectFramework(repo(["package.json"], { "package.json": pkg({}, { start: "node server.js" }) }));
  assert.equal(d.framework, "nodejs");
  assert.equal(d.confidence, "likely");
});

test("Django detected from manage.py", () => {
  const d = detectFramework(
    repo(["requirements.txt", "manage.py"], { "requirements.txt": "Django==5.0\ngunicorn" }),
  );
  assert.equal(d.framework, "django");
  assert.equal(d.runtime, "python");
  assert.equal(d.port, 8000);
});

test("FastAPI detected from requirements", () => {
  const d = detectFramework(repo(["requirements.txt"], { "requirements.txt": "fastapi\nuvicorn" }));
  assert.equal(d.framework, "fastapi");
});

test("Flask detected from requirements", () => {
  const d = detectFramework(repo(["requirements.txt"], { "requirements.txt": "Flask==3.0\ngunicorn" }));
  assert.equal(d.framework, "flask");
});

test("Go detected from go.mod", () => {
  const d = detectFramework(repo(["go.mod", "main.go"]));
  assert.equal(d.framework, "go");
  assert.equal(d.port, 8080);
});

test("Rails detected from Gemfile", () => {
  const d = detectFramework(repo(["Gemfile"], { Gemfile: "gem 'rails', '~> 7.1'" }));
  assert.equal(d.framework, "rails");
});

test("Java Maven detected from pom.xml", () => {
  const d = detectFramework(repo(["pom.xml"]));
  assert.equal(d.framework, "java-maven");
  assert.equal(d.runtime, "java");
});

test("plain static site detected from index.html", () => {
  const d = detectFramework(repo(["index.html", "style.css"]));
  assert.equal(d.framework, "static");
  assert.equal(d.outputDirectory, ".");
});

test("unknown repo fails loudly instead of guessing nodejs", () => {
  const d = detectFramework(repo(["README.md", "LICENSE"]));
  assert.equal(d.framework, "unknown");
  assert.equal(d.confidence, "fallback");
  assert.match(d.reason, /Add a Dockerfile/);
});

test("malformed package.json does not throw", () => {
  const d = detectFramework(repo(["package.json"], { "package.json": "{ not json" }));
  assert.equal(d.framework, "unknown");
});

// ── package manager ─────────────────────────────────────────────────────────

test("pnpm from lockfile", () => {
  assert.equal(detectPackageManager(repo(["pnpm-lock.yaml", "package.json"])), "pnpm");
});

test("yarn from lockfile", () => {
  assert.equal(detectPackageManager(repo(["yarn.lock"])), "yarn");
});

test("bun from lockfile", () => {
  assert.equal(detectPackageManager(repo(["bun.lockb"])), "bun");
});

test("npm is the default", () => {
  assert.equal(detectPackageManager(repo(["package.json"])), "npm");
});

test("packageManager field used when no lockfile", () => {
  assert.equal(
    detectPackageManager(repo(["package.json"], { "package.json": pkg({}, {}, { packageManager: "pnpm@9.1.0" }) })),
    "pnpm",
  );
});

test("lockfile beats packageManager field", () => {
  assert.equal(
    detectPackageManager(
      repo(["package.json", "yarn.lock"], { "package.json": pkg({}, {}, { packageManager: "pnpm@9.1.0" }) }),
    ),
    "yarn",
  );
});
