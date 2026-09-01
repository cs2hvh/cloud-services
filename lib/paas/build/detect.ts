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

export type Runtime = "node" | "python" | "go" | "ruby" | "java" | "php" | "rust" | "hugo" | "static" | "docker";

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
  /**
   * Next.js `output: 'standalone'` — the build writes a self-contained server
   * to `.next/standalone` instead of leaving one to `next start`.
   *
   * THIS IS A FACT ABOUT THE LAYOUT, NOT JUST THE COMMAND, and it is stated
   * here because both halves need it and only one of them used to know. The
   * start command became `node server.js` while the Dockerfile went on copying
   * the tree wholesale, which puts server.js at `/app/.next/standalone/server.js`
   * — so every standalone app crash-looped on `Cannot find module '/app/server.js'`.
   * Re-deriving it downstream by matching the command string would leave the
   * same two facts free to disagree again.
   */
  standalone?: boolean;
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

  // HUGO BEFORE EVERYTHING ELSE, because a Hugo site looks like two other
  // things at once. gohugoio/hugoDocs ships a go.mod (Hugo modules) and a
  // package.json (tooling), and was detected as a Go application: the build
  // ran `go mod download` against a repository with no Go program in it and
  // failed somewhere no customer could interpret.
  if (
    hasAny(files, "hugo.toml", "hugo.yaml", "hugo.json", "config/_default/hugo.toml") ||
    (has(files, "config.toml") && has(files, "archetypes/default.md"))
  ) {
    return {
      framework: "hugo",
      runtime: "hugo",
      buildCommand: "hugo --minify",
      startCommand: null,
      outputDirectory: "public",
      port: 80,
      confidence: "certain",
      reason: "Found a Hugo configuration; building the site and serving public/.",
    };
  }

  // COMPOSER OUTRANKS PACKAGE.JSON, and the order is the whole point.
  //
  // A PHP application ships a package.json for its asset pipeline — Laravel's
  // has vite and react in it — and the Node branch below matched that first.
  // laravel/laravel was detected as `vite-react (static)`: we would have built
  // its frontend assets and served them as a site, with the application that
  // owns them left out of the image entirely.
  //
  // The signals are not symmetrical. A composer.json says THIS IS A PHP
  // APPLICATION; a package.json in the same repository says only that it has
  // JavaScript somewhere, which is true of nearly every web application now.
  if (has(files, "composer.json")) {
    // WHICH PHP FRAMEWORK MATTERS, and only for one reason: Symfony runs
    // `cache:clear` from a composer auto-script, and with --no-dev that fails
    // with
    //
    //     Uncaught Error: Class Symfony\\Bundle\\DebugBundle\\DebugBundle not found
    //
    // because config/bundles.php still lists the dev bundles for the dev
    // environment. Setting APP_ENV=prod is the documented answer — and it is
    // NOT safe to set for everything: Laravel's production environment is
    // spelled `production`, so a blanket `prod` would quietly put a Laravel
    // app in an environment of its own.
    const composer = files.contents["composer.json"] ?? "";
    let requires: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(composer || "{}");
      requires = { ...(parsed.require ?? {}), ...(parsed["require-dev"] ?? {}) };
    } catch {
      // An unreadable composer.json is still a PHP project. It will fail at
      // install with an error naming the file, which is clearer than anything
      // this branch could say.
    }
    const framework = Object.hasOwn(requires, "symfony/framework-bundle")
      ? "symfony"
      : Object.hasOwn(requires, "laravel/framework")
        ? "laravel"
        : "php";

    return {
      framework,
      runtime: "php",
      buildCommand: "composer install --no-dev --optimize-autoloader",
      startCommand: null,
      outputDirectory: "public",
      // 8080, not 80. The container runs as a non-root uid and cannot bind a
      // privileged port — the same constraint that made every static site
      // crash-loop on an nginx pidfile it could not write.
      port: 8080,
      confidence: "likely",
      reason: `Found composer.json${framework === "php" ? "" : ` (${framework})`}; installing with composer and serving public/ through Apache.`,
    };
  }

  const pkg = readPackageJson(files);

  // 2. Node frameworks, most specific first.
  if (pkg) {
    const scripts = pkg.scripts ?? {};
    const build = scripts.build ? "build" : null;

    if (dep(pkg, "next")) {
      const nextConfig =
        files.contents["next.config.js"] ??
        files.contents["next.config.mjs"] ??
        files.contents["next.config.ts"] ??
        "";
      const standalone = /output\s*:\s*["']standalone["']/.test(nextConfig);

      // `output: 'export'` MEANS THERE IS NO SERVER TO START.
      //
      // next build writes a directory of static files to out/ and next start
      // refuses to run against it — so this detected as a node app, ran
      // `next start`, exited 1 and crash-looped. Found on gitlab.com/pages/
      // nextjs, which is GitLab's own Next.js sample, and it would have hit an
      // identical repository on GitHub the same way. Vercel and Netlify both
      // serve out/ for this config; so do we now.
      const exported = /output\s*:\s*["']export["']/.test(nextConfig);
      if (exported) {
        return {
          framework: "nextjs",
          // static, not node: nginx serves the directory and nothing is
          // started. The framework stays nextjs because that is what it IS,
          // and the build command still has to be Next's own.
          runtime: "static",
          buildCommand: build,
          startCommand: null,
          outputDirectory: "out",
          port: 80,
          confidence: "certain",
          reason:
            `Found "next" with output:'export'; serving its static output from out/ ` +
            "— next start cannot serve an exported build.",
        };
      }

      return {
        framework: "nextjs",
        runtime: "node",
        buildCommand: build,
        startCommand: standalone ? "node server.js" : "start",
        outputDirectory: ".next",
        port: 3000,
        confidence: "certain",
        reason: `Found "next" in dependencies${standalone ? " with output:'standalone'" : ""}.`,
        standalone,
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
        // A `start:prod` script exists precisely to say "this is how to run in
        // production", and for NestJS that distinction is the difference between
        // running and crash-looping: its `start` is `nest start`, which needs
        // @nestjs/cli — a devDependency the runtime stage prunes. The container
        // exited 1 and restarted three times before anyone could see why.
        startCommand: scripts["start:prod"]
          ? "start:prod"
          : scripts.start
            ? "start"
            : `node ${pkg.main ?? "index.js"}`,
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
  // AFTER the Node branch, unlike composer. A Rust backend beside a JS frontend
  // and a Node app with a Rust addon (napi-rs, neon) look identical from here,
  // and the second is the commoner shape — so the package.json wins, which is
  // also the behaviour that existed before Rust was detected at all.
  if (has(files, "Cargo.toml")) {
    return {
      framework: "rust",
      runtime: "rust",
      buildCommand: null,
      startCommand: null,
      outputDirectory: null,
      port: 8080,
      confidence: "certain",
      reason: "Found Cargo.toml; building the release binary.",
    };
  }

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
  // Contents, because which PHP framework it is changes how it must be built.
  "composer.json",
  // Hugo. hugo.toml is the modern name; a site made before 0.110 still uses
  // config.toml, which is far too generic on its own — archetypes/default.md
  // is what `hugo new site` writes and nothing else does, so the pair is the
  // signal.
  "hugo.toml", "hugo.yaml", "hugo.json", "config/_default/hugo.toml",
  "config.toml", "archetypes/default.md",
] as const;
