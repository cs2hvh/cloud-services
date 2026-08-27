/**
 * Framework detection tests.
 *
 * Runs with zero dependencies:  node --test lib/paas/build/detect.test.ts
 * (Node 24 strips types natively; node:test and node:assert are built in.)
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { detectFramework, detectPackageManager, parseExposedPort, type RepoFiles } from "./detect.ts";

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

// ── Dockerfile EXPOSE parsing ───────────────────────────────────────────────
// A repo-supplied Dockerfile chooses its own port. Guessing 3000 produces a pod
// whose readiness probe can never pass, so the port is read from the file.

test("EXPOSE is read from a repo-supplied Dockerfile", () => {
  const d = detectFramework(repo(["Dockerfile"], { Dockerfile: "FROM nginx\nEXPOSE 8080\n" }));
  assert.equal(d.framework, "dockerfile");
  assert.equal(d.port, 8080);
  assert.match(d.reason, /EXPOSE 8080/);
});

test("the LAST EXPOSE wins, since it belongs to the final stage", () => {
  const df = "FROM node AS build\nEXPOSE 3000\nFROM nginx AS run\nEXPOSE 80\n";
  assert.equal(detectFramework(repo(["Dockerfile"], { Dockerfile: df })).port, 80);
});

test("EXPOSE with a protocol suffix is understood", () => {
  assert.equal(parseExposedPort("EXPOSE 5000/tcp"), 5000);
  assert.equal(parseExposedPort("EXPOSE 5000/udp"), 5000);
});

test("variable EXPOSE is ignored rather than mis-parsed", () => {
  assert.equal(parseExposedPort("EXPOSE $PORT"), null);
  assert.equal(parseExposedPort("EXPOSE ${PORT}"), null);
});

test("no EXPOSE falls back to 3000 and says so", () => {
  const d = detectFramework(repo(["Dockerfile"], { Dockerfile: "FROM scratch\n" }));
  assert.equal(d.port, 3000);
  assert.match(d.reason, /No EXPOSE found/);
});

test("an out-of-range port is rejected", () => {
  assert.equal(parseExposedPort("EXPOSE 99999"), null);
});

// GATSBY AND DOCUSAURUS ARE NOT GENERIC NODE APPS.
//
// Both fell through to the nodejs branch, which runs `npm start` against a
// framework that has no server to start. Both build to a directory of static
// files — and not the SAME directory, which is why each needs its own rule.

test("gatsby is static, served from public/", () => {
  const d = detectFramework(repo(["package.json"], { "package.json": pkg({ gatsby: "^5.0.0" }, { build: "gatsby build" }) }));
  assert.equal(d.framework, "gatsby");
  assert.equal(d.runtime, "static");
  assert.equal(d.outputDirectory, "public");
});

test("docusaurus is static, served from build/", () => {
  const d = detectFramework(repo(["package.json"], { "package.json": pkg({ "@docusaurus/core": "^3.0.0" }, { build: "docusaurus build" }) }));
  assert.equal(d.framework, "docusaurus");
  assert.equal(d.runtime, "static");
  assert.equal(d.outputDirectory, "build");
});

test("THE TWO OUTPUT DIRECTORIES DO NOT GET CONFUSED", () => {
  // Copying the wrong one produces an nginx serving an empty root, which looks
  // like a routing failure rather than a build one.
  const g = detectFramework(repo(["package.json"], { "package.json": pkg({ gatsby: "^5.0.0" }, { build: "gatsby build" }) }));
  const d = detectFramework(repo(["package.json"], { "package.json": pkg({ "@docusaurus/core": "^3.0.0" }, { build: "docusaurus build" }) }));
  assert.notEqual(g.outputDirectory, d.outputDirectory);
});

// A DEV START SCRIPT IS NOT A PRODUCTION ONE.
//
// NestJS's `start` is `nest start`, which needs @nestjs/cli — a devDependency
// the runtime stage prunes. Running it produced a container that exited 1 and
// restarted three times, visible from outside only as a 503. `start:prod`
// exists precisely to say how the thing runs in production.

test("start:prod is preferred when the repository offers one", () => {
  const d = detectFramework(repo(["package.json"], {
    "package.json": pkg(
      { "@nestjs/core": "^10.0.0" },
      { start: "nest start", "start:prod": "node dist/main" },
    ),
  }));
  assert.equal(d.framework, "nestjs");
  assert.equal(d.startCommand, "start:prod");
});

test("plain start is still used when that is all there is", () => {
  const d = detectFramework(repo(["package.json"], {
    "package.json": pkg({ express: "^4.18.0" }, { start: "node server.js" }),
  }));
  assert.equal(d.startCommand, "start");
});

test("with no start script at all it falls back to main", () => {
  const d = detectFramework(repo(["package.json"], {
    "package.json": JSON.stringify({ dependencies: { express: "^4.18.0" }, main: "app.js", scripts: {} }),
  }));
  assert.equal(d.startCommand, "node app.js");
});

// A HUGO SITE IS NOT A GO APPLICATION, though it carries the evidence for both.
//
// gohugoio/hugoDocs ships a go.mod for Hugo modules and a package.json for
// tooling. It was detected as Go, so the build ran `go mod download` against a
// repository containing no Go program and failed where nobody could interpret it.

test("hugo.toml wins over go.mod and package.json", () => {
  const d = detectFramework(repo(["hugo.toml", "go.mod", "package.json"], {
    "package.json": pkg({}, { build: "hugo" }),
    "go.mod": "module github.com/gohugoio/hugoDocs\n",
  }));
  assert.equal(d.framework, "hugo");
  assert.equal(d.runtime, "hugo");
  assert.equal(d.outputDirectory, "public");
});

test("a pre-0.110 site is recognised by config.toml WITH archetypes", () => {
  const d = detectFramework(repo(["config.toml", "archetypes/default.md"]));
  assert.equal(d.framework, "hugo");
});

test("CONFIG.TOML ALONE IS NOT A HUGO SITE", () => {
  // Far too generic — plenty of tools keep one. Claiming Hugo here would send a
  // Go or Rust repository into a Hugo build for no reason.
  const d = detectFramework(repo(["config.toml", "go.mod"], { "go.mod": "module x\n" }));
  assert.notEqual(d.framework, "hugo");
});

test("a Dockerfile still outranks Hugo", () => {
  const d = detectFramework(repo(["Dockerfile", "hugo.toml"], { Dockerfile: "FROM alpine\n" }));
  assert.equal(d.framework, "dockerfile");
});

// A PHP APPLICATION IS NOT A REACT SPA, though it ships a package.json.
//
// Laravel's package.json has vite and react in it for the asset pipeline, and
// the Node branch matched that first: laravel/laravel was detected as
// `vite-react (static)`. We would have built its frontend and served that as the
// site, with the application that owns it left out of the image entirely.

test("composer.json outranks a package.json full of frontend tooling", () => {
  const d = detectFramework(repo(["composer.json", "package.json"], {
    "package.json": pkg({ react: "^18.0.0", vite: "^5.0.0" }, { build: "vite build" }),
    "composer.json": JSON.stringify({ require: { "laravel/framework": "^11.0" } }),
  }));
  assert.equal(d.framework, "php");
  assert.equal(d.runtime, "php");
});

test("a repository with ONLY package.json is still a Node app", () => {
  // Otherwise the test above would pass against a detector that called
  // everything PHP.
  const d = detectFramework(repo(["package.json"], {
    "package.json": pkg({ react: "^18.0.0", vite: "^5.0.0" }, { build: "vite build" }),
  }));
  assert.notEqual(d.runtime, "php");
});

test("a Dockerfile still outranks composer.json", () => {
  const d = detectFramework(repo(["Dockerfile", "composer.json"], { Dockerfile: "FROM php:8.3\n" }));
  assert.equal(d.framework, "dockerfile");
});
