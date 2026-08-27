/**
 * Framework detection.
 *
 * v1's dashboard advertised "Auto-detect from repo" but the framework was
 * actually a user-selected enum, with `default:` falling through to nodejs.
 * This does the detection for real, from the repository's own files.
 *
 * Pure functions over a file map so the whole matrix is unit-testable with no
 * network and no build VM.
 */

export type Runtime = "node" | "python" | "go" | "ruby" | "java" | "php" | "static" | "docker";

export interface Detection {
  framework: string;
  runtime: Runtime;
  /** Command to produce build output, if the framework needs one. */
  buildCommand: string | null;
  /** Command to run the app in production. Null for purely static output. */
  startCommand: string | null;
  /** Directory of static assets, when the result is served statically. */
  outputDirectory: string | null;
  /** Port the app is expected to listen on. */
  port: number;
  /** How confident we are; "certain" means an unambiguous marker was found. */
  confidence: "certain" | "likely" | "fallback";
  /** Human-readable reason, surfaced in the build log so users can see why. */
  reason: string;
}

export interface RepoFiles {
  /** Paths present at the repo root (and any that matter), relative, POSIX separators. */
  paths: string[];
  /** Contents of files we care about, keyed by path. Missing = not read. */
  contents: Record<string, string>;
}

function has(files: RepoFiles, path: string): boolean {
  return files.paths.includes(path);
}

function hasAny(files: RepoFiles, ...paths: string[]): boolean {
  return paths.some((p) => has(files, p));
}

interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  packageManager?: string;
  main?: string;
  type?: string;
}

function readPackageJson(files: RepoFiles): PackageJson | null {
  const raw = files.contents["package.json"];
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PackageJson;
  } catch {
    return null;
  }
}

function dep(pkg: PackageJson | null, name: string): boolean {
  if (!pkg) return false;
  return Boolean(pkg.dependencies?.[name] ?? pkg.devDependencies?.[name]);
}

/**
 * Read the last EXPOSE from a Dockerfile.
 *
 * When a repository supplies its own Dockerfile we do not get to choose the
 * port, so guessing 3000 produces a pod whose readiness probe can never pass.
 * The last EXPOSE wins because it belongs to the final stage in a multi-stage
 * build. Variable forms such as `EXPOSE $PORT` are ignored, since they cannot
 * be resolved without building the image.
 */
export function parseExposedPort(dockerfile: string): number | null {
  const matches = [...dockerfile.matchAll(/^[ \t]*EXPOSE[ \t]+(\d{1,5})(?:\/(?:tcp|udp))?[ \t]*$/gim)];
  if (!matches.length) return null;
  const port = Number(matches[matches.length - 1][1]);
  return port > 0 && port <= 65535 ? port : null;
}

/** npm | yarn | pnpm | bun, from lockfile then packageManager field. */
export function detectPackageManager(files: RepoFiles): "npm" | "yarn" | "pnpm" | "bun" {
  if (has(files, "pnpm-lock.yaml")) return "pnpm";
  if (has(files, "yarn.lock")) return "yarn";
  if (has(files, "bun.lockb") || has(files, "bun.lock")) return "bun";
  if (has(files, "package-lock.json")) return "npm";
  const pm = readPackageJson(files)?.packageManager ?? "";
  if (pm.startsWith("pnpm")) return "pnpm";
  if (pm.startsWith("yarn")) return "yarn";
  if (pm.startsWith("bun")) return "bun";
  return "npm";
}

/**
 * Detect the framework. Order matters: a repo with its own Dockerfile always
 * wins, because the user has explicitly told us how to build it.
 */
export function detectFramework(files: RepoFiles): Detection {
  // 1. Explicit Dockerfile — the escape hatch, and it outranks everything.
  if (has(files, "Dockerfile")) {
    const exposed = parseExposedPort(files.contents["Dockerfile"] ?? "");
    return {
      framework: "dockerfile",
      runtime: "docker",
      buildCommand: null,
      startCommand: null,
      outputDirectory: null,
      port: exposed ?? 3000,
      confidence: "certain",
      reason: exposed
        ? `Repository contains a Dockerfile; building it as-is, EXPOSE ${exposed}.`
        : "Repository contains a Dockerfile; building it as-is. No EXPOSE found, assuming 3000 — set the port explicitly if that is wrong.",
    };
  }

  const pkg = readPackageJson(files);

  // 2. Node frameworks, most specific first.
  if (pkg) {
    const scripts = pkg.scripts ?? {};
    const build = scripts.build ? "build" : null;

    if (dep(pkg, "next")) {
      const standalone = /output\s*:\s*["']standalone["']/.test(
        files.contents["next.config.js"] ??
          files.contents["next.config.mjs"] ??
          files.contents["next.config.ts"] ??
          "",
      );
      return {
        framework: "nextjs",
        runtime: "node",
        buildCommand: build,
        startCommand: standalone ? "node server.js" : "start",
        outputDirectory: ".next",
        port: 3000,
        confidence: "certain",
        reason: `Found "next" in dependencies${standalone ? " with output:'standalone'" : ""}.`,
      };
    }

    if (dep(pkg, "nuxt") || dep(pkg, "nuxt3")) {
      return {
        framework: "nuxtjs",
        runtime: "node",
        buildCommand: build,
        startCommand: "node .output/server/index.mjs",
        outputDirectory: ".output",
        port: 3000,
        confidence: "certain",
        reason: 'Found "nuxt" in dependencies.',
      };
    }

    if (dep(pkg, "@remix-run/node") || dep(pkg, "@remix-run/serve")) {
      return {
        framework: "remix",
        runtime: "node",
        buildCommand: build,
        startCommand: "start",
        outputDirectory: "build",
        port: 3000,
        confidence: "certain",
        reason: "Found Remix runtime packages.",
      };
    }

    if (dep(pkg, "@sveltejs/kit")) {
      return {
        framework: "sveltekit",
        runtime: "node",
        buildCommand: build,
        startCommand: "node build/index.js",
        outputDirectory: "build",
        port: 3000,
        confidence: "certain",
        reason: 'Found "@sveltejs/kit" in dependencies.',
      };
    }

    // Gatsby and Docusaurus both fell through to the generic Node branch, which
    // runs `npm start` against a framework that has no server to start. Both
    // produce a directory of static files and want nginx, not node — and the
    // directory is NOT the same one, which is the whole reason each needs its own
    // rule rather than a shared 'it is static' guess.
    if (dep(pkg, "gatsby")) {
      return {
        framework: "gatsby",
        runtime: "static",
        buildCommand: build,
        startCommand: null,
        outputDirectory: "public",
        port: 80,
        confidence: "certain",
        reason: 'Found "gatsby"; serving its static output from public/.',
      };
    }

    if (dep(pkg, "@docusaurus/core")) {
      return {
        framework: "docusaurus",
        runtime: "static",
        buildCommand: build,
        startCommand: null,
        outputDirectory: "build",
        port: 80,
        confidence: "certain",
        reason: 'Found "@docusaurus/core"; serving its static output from build/.',
      };
    }

    if (dep(pkg, "astro")) {
      const ssr = /output\s*:\s*["'](server|hybrid)["']/.test(files.contents["astro.config.mjs"] ?? "");
      return {
        framework: "astro",
        runtime: ssr ? "node" : "static",
        buildCommand: build,
        startCommand: ssr ? "node ./dist/server/entry.mjs" : null,
        outputDirectory: "dist",
        port: 3000,
        confidence: "certain",
        reason: `Found "astro"${ssr ? " configured for SSR" : " producing a static build"}.`,
      };
    }

    if (dep(pkg, "@angular/core")) {
      return {
        framework: "angular",
        runtime: "static",
        buildCommand: build,
        startCommand: null,
        outputDirectory: "dist",
        port: 80,
        confidence: "certain",
        reason: 'Found "@angular/core" in dependencies.',
      };
    }

    if (dep(pkg, "vite")) {
      const isVue = dep(pkg, "vue");
      return {
        framework: isVue ? "vite-vue" : "vite-react",
        runtime: "static",
        buildCommand: build,
        startCommand: null,
        outputDirectory: "dist",
        port: 80,
        confidence: "certain",
        reason: `Found "vite"${isVue ? " with vue" : ""}; static build output.`,
      };
    }

    if (dep(pkg, "react-scripts")) {
      return {
        framework: "create-react-app",
        runtime: "static",
        buildCommand: build,
        startCommand: null,
        outputDirectory: "build",
        port: 80,
        confidence: "certain",
        reason: 'Found "react-scripts" (Create React App).',
      };
    }

    if (dep(pkg, "express") || dep(pkg, "fastify") || dep(pkg, "koa") || dep(pkg, "@nestjs/core")) {
      const name = dep(pkg, "@nestjs/core")
        ? "nestjs"
        : dep(pkg, "fastify")
          ? "fastify"
          : dep(pkg, "koa")
            ? "koa"
            : "express";
      return {
        framework: name,
        runtime: "node",
        buildCommand: build,
        startCommand: scripts.start ? "start" : `node ${pkg.main ?? "index.js"}`,
        outputDirectory: null,
        port: 3000,
        confidence: "certain",
        reason: `Found "${name}" server framework in dependencies.`,
      };
    }

    // Generic Node: it has a package.json and a start script.
    if (scripts.start) {
      return {
        framework: "nodejs",
        runtime: "node",
        buildCommand: build,
        startCommand: "start",
        outputDirectory: null,
        port: 3000,
        confidence: "likely",
        reason: 'package.json has a "start" script; treating as a generic Node app.',
      };
    }
  }

  // 3. Python.
  if (hasAny(files, "requirements.txt", "pyproject.toml", "Pipfile")) {
    const reqs = (files.contents["requirements.txt"] ?? "") + (files.contents["pyproject.toml"] ?? "");
    if (has(files, "manage.py") || /\bdjango\b/i.test(reqs)) {
      return {
        framework: "django",
        runtime: "python",
        buildCommand: "python manage.py collectstatic --noinput",
        startCommand: "gunicorn --bind 0.0.0.0:8000 $(ls */wsgi.py | head -1 | xargs dirname).wsgi",
        outputDirectory: null,
        port: 8000,
        confidence: has(files, "manage.py") ? "certain" : "likely",
        reason: has(files, "manage.py") ? "Found manage.py (Django)." : "Found django in requirements.",
      };
    }
    if (/\bfastapi\b/i.test(reqs)) {
      return {
        framework: "fastapi",
        runtime: "python",
        buildCommand: null,
        startCommand: "uvicorn main:app --host 0.0.0.0 --port 8000",
        outputDirectory: null,
        port: 8000,
        confidence: "certain",
        reason: "Found fastapi in requirements.",
      };
    }
    if (/\bflask\b/i.test(reqs)) {
      return {
        framework: "flask",
        runtime: "python",
        buildCommand: null,
        startCommand: "gunicorn --bind 0.0.0.0:8000 app:app",
        outputDirectory: null,
        port: 8000,
        confidence: "certain",
        reason: "Found flask in requirements.",
      };
    }
    return {
      framework: "python",
      runtime: "python",
      buildCommand: null,
      startCommand: "python main.py",
      outputDirectory: null,
      port: 8000,
      confidence: "likely",
      reason: "Python dependency manifest present but no known web framework.",
    };
  }

  // 4. Go.
  if (has(files, "go.mod")) {
    return {
      framework: "go",
      runtime: "go",
      buildCommand: "go build -o /app/server ./...",
      startCommand: "/app/server",
      outputDirectory: null,
      port: 8080,
      confidence: "certain",
      reason: "Found go.mod.",
    };
  }

  // 5. Ruby.
  if (has(files, "Gemfile")) {
    const rails = /rails/i.test(files.contents["Gemfile"] ?? "");
    return {
      framework: rails ? "rails" : "ruby",
      runtime: "ruby",
      buildCommand: rails ? "bundle exec rake assets:precompile" : null,
      startCommand: rails ? "bundle exec rails server -b 0.0.0.0 -p 3000" : "bundle exec ruby app.rb",
      outputDirectory: null,
      port: 3000,
      confidence: "certain",
      reason: rails ? "Found Gemfile with rails." : "Found Gemfile.",
    };
  }

  // 6. Java.
  if (hasAny(files, "pom.xml", "build.gradle", "build.gradle.kts")) {
    const maven = has(files, "pom.xml");
    return {
      framework: maven ? "java-maven" : "java-gradle",
      runtime: "java",
      buildCommand: maven ? "mvn -B -DskipTests package" : "gradle build -x test",
      startCommand: "java -jar app.jar",
      outputDirectory: maven ? "target" : "build/libs",
      port: 8080,
      confidence: "certain",
      reason: maven ? "Found pom.xml." : "Found Gradle build file.",
    };
  }

  // 7. PHP.
  if (has(files, "composer.json")) {
    return {
      framework: "php",
      runtime: "php",
      buildCommand: "composer install --no-dev --optimize-autoloader",
      startCommand: null,
      outputDirectory: "public",
      port: 80,
      confidence: "likely",
      reason: "Found composer.json.",
    };
  }

  // 8. Plain static site.
  if (hasAny(files, "index.html", "public/index.html")) {
    return {
      framework: "static",
      runtime: "static",
      buildCommand: null,
      startCommand: null,
      outputDirectory: has(files, "index.html") ? "." : "public",
      port: 80,
      confidence: "likely",
      reason: "Found index.html with no build tooling; serving as a static site.",
    };
  }

  // 9. Nothing recognised. Fail loudly rather than guessing — v1's silent
  //    fallthrough to nodejs produced builds that failed confusingly.
  return {
    framework: "unknown",
    runtime: "static",
    buildCommand: null,
    startCommand: null,
    outputDirectory: null,
    port: 3000,
    confidence: "fallback",
    reason:
      "No recognised framework marker (package.json, requirements.txt, go.mod, Gemfile, pom.xml, composer.json, Dockerfile or index.html). Add a Dockerfile to build this repository.",
  };
}

/** Files worth fetching before detection runs. Keep small: these are API calls. */
export const DETECTION_FILES = [
  "Dockerfile",
  "package.json",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "astro.config.mjs",
  "requirements.txt",
  "pyproject.toml",
  "Gemfile",
  // Contents, not just presence: this file's whole purpose is the version
  // written inside it.
  ".nvmrc",
] as const;
