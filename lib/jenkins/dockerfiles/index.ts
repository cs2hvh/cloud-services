/**
 * Dockerfile Generation Module
 * 
 * This module provides shell script snippets for Dockerfile generation
 * that run INSIDE Jenkins (after repo is cloned).
 * 
 * DESIGN PRINCIPLES:
 * 1. Detection runs in Jenkins (where repo exists), not in TypeScript
 * 2. All detection logic is centralized here (DRY)
 * 3. Pipelines import shell snippets, not duplicate them
 * 4. Fallback to safe defaults if detection fails
 */

// =============================================================================
// SHARED DETECTION FUNCTIONS (Shell Script)
// =============================================================================

/**
 * Shell function to detect Node.js version from package.json
 * Returns: NODE_VERSION variable set
 * 
 * Detection order:
 * 1. package.json engines.node field
 * 2. .nvmrc file
 * 3. .node-version file
 * 4. Default to specified fallback (default: 20)
 */
export function getNodeVersionDetectionScript(defaultVersion: number = 20): string {
  return `
# Detect Node.js version
NODE_VERSION=${defaultVersion}
if [ -f package.json ]; then
  # Try to extract from engines.node (handles ">=20", "^20", "20.x", etc.)
  DETECTED=$(cat package.json | grep -o '"node"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -oE '[0-9]+' | head -1)
  if [ -n "$DETECTED" ] && [ "$DETECTED" -ge 18 ] 2>/dev/null; then
    NODE_VERSION=$DETECTED
  fi
fi
# Fallback: check .nvmrc
if [ "$NODE_VERSION" = "${defaultVersion}" ] && [ -f .nvmrc ]; then
  DETECTED=$(cat .nvmrc | grep -oE '[0-9]+' | head -1)
  if [ -n "$DETECTED" ] && [ "$DETECTED" -ge 18 ] 2>/dev/null; then
    NODE_VERSION=$DETECTED
  fi
fi
# Fallback: check .node-version
if [ "$NODE_VERSION" = "${defaultVersion}" ] && [ -f .node-version ]; then
  DETECTED=$(cat .node-version | grep -oE '[0-9]+' | head -1)
  if [ -n "$DETECTED" ] && [ "$DETECTED" -ge 18 ] 2>/dev/null; then
    NODE_VERSION=$DETECTED
  fi
fi
echo "Detected Node.js version: $NODE_VERSION"
`.trim();
}

/**
 * Shell function to detect Python version
 * Returns: PYTHON_VERSION variable set
 */
export function getPythonVersionDetectionScript(defaultVersion: string = '3.11'): string {
  return `
# Detect Python version
PYTHON_VERSION="${defaultVersion}"
if [ -f runtime.txt ]; then
  DETECTED=$(grep -oE "python-[0-9]+[.][0-9]+" runtime.txt | grep -oE "[0-9]+[.][0-9]+" | head -1)
  if [ -n "$DETECTED" ]; then
    PYTHON_VERSION=$DETECTED
  fi
elif [ -f .python-version ]; then
  DETECTED=$(cat .python-version | grep -oE "[0-9]+[.][0-9]+" | head -1)
  if [ -n "$DETECTED" ]; then
    PYTHON_VERSION=$DETECTED
  fi
fi
echo "Detected Python version: $PYTHON_VERSION"
`.trim();
}

/**
 * Shell script to generate .dockerignore file (security best practice)
 * Prevents sensitive files (.env, secrets, .git) from being copied into Docker image
 */
export function getDockerignoreGenerationScript(): string {
  return `
# Generate .dockerignore for security (prevent secrets in image)
if [ ! -f .dockerignore ]; then
  cat > .dockerignore << 'DOCKERIGNORE_EOF'
# Security: Exclude sensitive files
.env
.env.*
*.key
*.pem
*.crt
*.p12
secrets/
.git
.github
.vscode
.idea

# Development files
node_modules
npm-debug.log
yarn-error.log
.DS_Store
*.log
coverage/
.nyc_output/

# CI/CD
.gitlab-ci.yml
.travis.yml
Jenkinsfile
DOCKERIGNORE_EOF
  echo ".dockerignore generated"
fi
`.trim();
}

/**
 * Shell function to detect package manager from lockfile
 * Returns: PACKAGE_MANAGER variable (npm, pnpm, or yarn)
 * 
 * ⚠️ CRITICAL: This variable MUST be passed to docker build/kaniko via:
 *    --build-arg PACKAGE_MANAGER="$PACKAGE_MANAGER"
 * 
 * Without the build arg, ARG PACKAGE_MANAGER in Dockerfiles will be empty,
 * causing setupPm logic to silently fail and breaking pnpm/yarn builds.
 * 
 * All 9 framework pipelines currently pass this correctly. Do not remove.
 */
export function getPackageManagerDetectionScript(): string {
  return `
# Detect package manager from lockfile
PACKAGE_MANAGER="npm"
if [ -f pnpm-lock.yaml ]; then
  PACKAGE_MANAGER="pnpm"
  echo "Detected pnpm from pnpm-lock.yaml"
elif [ -f yarn.lock ]; then
  PACKAGE_MANAGER="yarn"
  echo "Detected yarn from yarn.lock"
elif [ -f package-lock.json ]; then
  PACKAGE_MANAGER="npm"
  echo "Detected npm from package-lock.json"
else
  echo "No lockfile found, defaulting to npm"
fi
export PACKAGE_MANAGER
`.trim();
}

// =============================================================================
// PACKAGE MANAGER HELPERS
// =============================================================================

/**
 * Generate package manager agnostic install/build commands for Dockerfile
 * 
 * INSTALL STRATEGY: Smart fallback (best of both worlds)
 * - Tries strict mode first (npm ci / pnpm install --frozen-lockfile / yarn install --frozen-lockfile)
 * - Falls back to forgiving mode if lockfile is broken/missing
 * - Result: Reproducible when possible, compatible with OSS projects always
 * 
 * @param options.production - If true, install only production deps
 * @param options.legacyPeerDeps - If true, add --legacy-peer-deps for npm
 * @returns Object with install, build, and setup commands
 */
export function getPackageManagerCommands(options: {
  production?: boolean;
  legacyPeerDeps?: boolean;
} = {}) {
  const { production = false, legacyPeerDeps = false } = options;

  // Global package manager installation command (pinned versions for stability)
  const setupPm = `ARG PACKAGE_MANAGER
RUN corepack disable && \\
    if [ "$PACKAGE_MANAGER" = "pnpm" ]; then \\
    npm install -g pnpm@9; \\
    elif [ "$PACKAGE_MANAGER" = "yarn" ]; then \\
    npm install -g yarn@1; \\
    fi`;

  // Copy lockfiles (all possible lockfiles)
  const copyLockfiles = `COPY package*.json pnpm-lock.yaml* yarn.lock* ./`;

  // Smart fallback install strategy - try strict first, fall back to forgiving
  // This matches Vercel/Railway philosophy but with production-grade reproducibility when possible
  // BENEFITS: Strict when lockfiles are good, forgiving when they're outdated/missing
  const prodFlag = production ? (legacyPeerDeps ? ' --omit=dev --legacy-peer-deps' : ' --omit=dev') : (legacyPeerDeps ? ' --legacy-peer-deps' : '');
  const installCmd = `RUN if [ "$PACKAGE_MANAGER" = "pnpm" ]; then \\
      echo "Attempting pnpm install with frozen lockfile..." && \\
      pnpm install --frozen-lockfile${production ? ' --prod' : ''} || \\
      (echo "Frozen lockfile failed, using standard install..." && pnpm install${production ? ' --prod' : ''}); \\
    elif [ "$PACKAGE_MANAGER" = "yarn" ]; then \\
      echo "Attempting yarn install with frozen lockfile..." && \\
      yarn install --frozen-lockfile${production ? ' --production' : ''} || \\
      (echo "Frozen lockfile failed, using standard install..." && yarn install${production ? ' --production' : ''}); \\
    else \\
      echo "Detected npm; checking for package-lock.json..." && \\
      if [ -f package-lock.json ]; then \\
        echo "Attempting npm ci (fast & reproducible)..." && \\
        npm ci${prodFlag} || \\
        (echo "npm ci failed, falling back to npm install..." && npm install${prodFlag}); \\
      else \\
        echo "No package-lock.json found; using npm install (for compatibility)" && \\
        npm install${prodFlag}; \\
      fi; \\
    fi`;

  // Build command
  const buildCmd = `RUN if [ "$PACKAGE_MANAGER" = "pnpm" ]; then \\
      pnpm run build; \\
    elif [ "$PACKAGE_MANAGER" = "yarn" ]; then \\
      yarn build; \\
    else \\
      npm run build; \\
    fi`;

  // Start command (for CMD) - simplified to use npm directly
  // At runtime, package manager doesn't matter - node_modules already installed
  // npm is always available in node base image and runs the "start" script
  const startCmdArray = `["npm", "start"]`;

  return {
    setupPm,
    copyLockfiles,
    install: installCmd,
    build: buildCmd,
    start: startCmdArray,
  };
}

/**
 * Shell function to detect Next.js standalone mode
 * Returns: NEXTJS_STANDALONE variable (true/false)
 */
export function getNextjsStandaloneDetectionScript(): string {
  return `
# Detect Next.js standalone output mode
NEXTJS_STANDALONE=false
for config_file in next.config.js next.config.ts next.config.mjs; do
  if [ -f "$config_file" ] && grep -q "output.*standalone" "$config_file" 2>/dev/null; then
    NEXTJS_STANDALONE=true
    echo "Detected Next.js standalone mode in $config_file"
    break
  fi
done
`.trim();
}

/**
 * Shell function to detect Python framework (FastAPI, Flask, Django)
 * Returns: PYTHON_FRAMEWORK variable only (no complex CMD arrays)
 */
export function getPythonFrameworkDetectionScript(): string {
  return `
# Detect Python framework
PYTHON_FRAMEWORK="unknown"
PYTHON_ENTRY_FILE="app.py"

# Check for entry file
for entry in main.py app.py server.py run.py; do
  if [ -f "$entry" ]; then
    PYTHON_ENTRY_FILE=$entry
    break
  fi
done
PYTHON_MODULE=$(echo $PYTHON_ENTRY_FILE | sed 's/[.]py$//')

# Export variables for later sed replacement
export PYTHON_ENTRY_FILE
export PYTHON_MODULE

# Detect framework from requirements.txt or pyproject.toml
REQ_FILE=""
if [ -f requirements.txt ]; then
  REQ_FILE="requirements.txt"
elif [ -f requirements.in ]; then
  REQ_FILE="requirements.in"
elif [ -f pyproject.toml ]; then
  REQ_FILE="pyproject.toml"
fi

if [ -n "$REQ_FILE" ]; then
  if grep -qi "fastapi" "$REQ_FILE" 2>/dev/null; then
    PYTHON_FRAMEWORK="fastapi"
    echo "Detected FastAPI framework"
  elif grep -qi "flask" "$REQ_FILE" 2>/dev/null; then
    PYTHON_FRAMEWORK="flask"
    echo "Detected Flask framework"
  elif grep -qi "django" "$REQ_FILE" 2>/dev/null; then
    PYTHON_FRAMEWORK="django"
    echo "Detected Django framework"
  fi
fi
export PYTHON_FRAMEWORK
`.trim();
}

// =============================================================================
// DOCKERFILE TEMPLATES
// =============================================================================

/**
 * Generate Dockerfile for Node.js/Express apps (non-build, simple copy)
 * Now supports pnpm/yarn/npm auto-detection
 */
export function getNodejsDockerfile(): string {
  const pm = getPackageManagerCommands({ production: true });
  
  return `
FROM node:NODE_VERSION_PLACEHOLDER-alpine

WORKDIR /app

${pm.setupPm}

${pm.copyLockfiles}

${pm.install}

COPY . .

# Security: Run as non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser && \
    chown -R appuser:nodejs /app

USER appuser

# Pass package manager as ENV for runtime CMD
ARG PACKAGE_MANAGER
ENV PACKAGE_MANAGER=$PACKAGE_MANAGER

EXPOSE 3000

CMD ${pm.start}
`.trim();
}

/**
 * Generate Dockerfile for Next.js (standard mode)
 * Supports build-time env vars for NEXT_PUBLIC_* variables
 * Now supports pnpm/yarn/npm auto-detection
 */
export function getNextjsDockerfile(envVars: Array<{key: string, value: string}> = []): string {
  const pm = getPackageManagerCommands();
  
  // Generate ARG directives for ALL env vars (build-time availability)
  // Like Vercel: All vars available during build so Next.js can pre-render API routes
  // Security: Server-side vars are still loaded from K8s Secrets at runtime
  const argDirectives = envVars.length > 0 
    ? envVars.map(e => `ARG ${e.key}`).join('\n') + '\n'
    : '';

  // Generate ENV directives to pass ARGs to Next.js build
  const envDirectives = envVars.length > 0
    ? envVars.map(e => `ENV ${e.key}=$${e.key}`).join('\n') + '\n'
    : '';

  return `
# ---- Build Stage ----
FROM node:NODE_VERSION_PLACEHOLDER-alpine AS builder
WORKDIR /app

${pm.setupPm}

${argDirectives}${pm.copyLockfiles}
${pm.install}

COPY . .

# Pass build args as environment variables for Next.js
${envDirectives}
# Always build in production mode to prevent false positive errors
ENV NODE_ENV=production
${pm.build}

# Ensure public folder exists for COPY
RUN mkdir -p ./public

# ---- Run Stage ----
FROM node:NODE_VERSION_PLACEHOLDER-alpine
WORKDIR /app

# Security: Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/package*.json ./
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

# Pass package manager as ENV for runtime CMD
ARG PACKAGE_MANAGER
ENV PACKAGE_MANAGER=$PACKAGE_MANAGER

EXPOSE 3000
ENV PORT=3000
CMD ${pm.start}
`.trim();
}

/**
 * Generate Dockerfile for Next.js (standalone mode)
 * Supports build-time env vars for ALL variables (like Vercel)
 * 
 * ⚠️ RUNTIME: Package manager is ONLY used during build.
 * Standalone mode runs "node server.js" directly (Next.js generates optimized server).
 * This is different from standard mode which uses package manager at runtime.
 */
export function getNextjsStandaloneDockerfile(envVars: Array<{key: string, value: string}> = []): string {
  const pm = getPackageManagerCommands();
  
  // Generate ARG directives for ALL env vars (build-time availability)
  // Like Vercel: All vars available during build so Next.js can pre-render API routes
  // Security: Server-side vars are still loaded from K8s Secrets at runtime
  const argDirectives = envVars.length > 0 
    ? envVars.map(e => `ARG ${e.key}`).join('\n') + '\n'
    : '';

  // Generate ENV directives to pass ARGs to Next.js build
  const envDirectives = envVars.length > 0
    ? envVars.map(e => `ENV ${e.key}=$${e.key}`).join('\n') + '\n'
    : '';

  return `
# ---- Build Stage ----
FROM node:NODE_VERSION_PLACEHOLDER-alpine AS builder
WORKDIR /app

${pm.setupPm}

${argDirectives}${pm.copyLockfiles}
${pm.install}

COPY . .

# Pass build args as environment variables for Next.js
${envDirectives}
# Always build in production mode to prevent false positive errors
ENV NODE_ENV=production
${pm.build}

# Ensure public folder exists for COPY
RUN mkdir -p ./public

# ---- Production Stage ----
FROM node:NODE_VERSION_PLACEHOLDER-alpine
WORKDIR /app

# Security: Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone server and static files
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000
CMD ["node", "server.js"]
`.trim();
}

/**
 * Generate Dockerfile for Vite-based apps (React, Vue, Svelte) and static sites
 * Supports optional build-time environment variable injection
 * Now supports pnpm/yarn/npm auto-detection
 * 
 * ⚠️ Only for static SPA builds. Vite requires VITE_ prefix for public env vars.
 * ⚠️ Build args are visible in Docker logs - DO NOT use for secrets!
 * ⚠️ RUNTIME: Uses npm for `serve` global install (runtime-only tool, not project dependency)
 * 
 * Users can access env vars via import.meta.env.VITE_API_URL in their code
 * If no env vars provided, generates a standard static site Dockerfile
 */
export function getViteDockerfile(envVars: Array<{key: string, value: string}> = [], outputDir: string = 'dist'): string {
  const pm = getPackageManagerCommands();
  
  // Generate ARG directives for build-time env vars
  const argDirectives = envVars.length > 0 
    ? envVars.map(e => {
        const key = e.key.startsWith('VITE_') ? e.key : `VITE_${e.key}`;
        return `ARG ${key}`;
      }).join('\n') + '\n'
    : '';

  // Generate ENV directives to pass ARGs to build process
  const envDirectives = envVars.length > 0
    ? envVars.map(e => {
        const key = e.key.startsWith('VITE_') ? e.key : `VITE_${e.key}`;
        return `ENV ${key}=$${key}`;
      }).join('\n') + '\n'
    : '';

  return `
# ---- Build Stage ----
FROM node:NODE_VERSION_PLACEHOLDER-alpine AS builder
WORKDIR /app

${pm.setupPm}

${argDirectives}${pm.copyLockfiles}
${pm.install}

COPY . .

# Pass build args as environment variables for Vite
${envDirectives}${pm.build}

# ---- Production Stage ----
FROM node:NODE_VERSION_PLACEHOLDER-alpine
WORKDIR /app

# ⚠️ RUNTIME STRATEGY: Always use npm for serve installation
# Package manager detection is BUILD-ONLY. Runtime uses npm because:
# 1. serve is a runtime tool, not a project dependency
# 2. Avoids Corepack conflicts and Alpine image issues
# 3. npm is guaranteed available in official Node images
RUN npm install -g --force serve

# Security: Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

# Ensure dist exists before copying
RUN mkdir -p ./dist
COPY --from=builder --chown=appuser:nodejs /app/${outputDir}/. ./dist/

USER appuser

EXPOSE 3000
ENV PORT=3000
CMD ["sh", "-c", "serve -s dist -l $PORT"]
`.trim();
}

/**
 * Generate Dockerfile for Angular (handles browser subfolder)
 * Supports build-time environment variable injection via sed replacement
 * ⚠️ Build args are NOT secrets - use Kubernetes Secrets for sensitive data
 * ⚠️ Only for static SPA builds (environment.prod.ts placeholders). Not for SSR/Nx/runtime config.
 * ⚠️ RUNTIME: Uses npm for `serve` global install (runtime-only tool, not project dependency)
 * Users can use __VAR_NAME__ placeholders in environment.prod.ts
 */
export function getAngularDockerfile(envVars: Array<{key: string, value: string}> = []): string {
  // Generate ARG directives for build-time env vars
  const argDirectives = envVars.length > 0 
    ? envVars.map(e => `ARG ${e.key}`).join('\n') + '\n'
    : '';

  // Generate sed commands to replace __KEY__ placeholders in environment files
  const sedCommands = envVars.length > 0
    ? envVars.map(e => `sed -i "s|__${e.key}__|$${e.key}|g" src/environments/environment.prod.ts 2>/dev/null || true`).join(' && ')
    : '';

  const envInjection = envVars.length > 0
    ? `# Inject env vars into Angular environment files (replace __VAR__ placeholders)
# ⚠️ Only works for static builds with environment.prod.ts - NOT for SSR/Universal
RUN ${sedCommands}

`
    : '';

  const pm = getPackageManagerCommands({ legacyPeerDeps: true });

  return `
# ---- Build Stage ----
FROM node:NODE_VERSION_PLACEHOLDER-alpine AS builder
WORKDIR /app

${pm.setupPm}

${argDirectives}${pm.copyLockfiles}
${pm.install}

COPY . .

${envInjection}${pm.build}

# ---- Production Stage ----
FROM node:NODE_VERSION_PLACEHOLDER-alpine
WORKDIR /app

# ⚠️ RUNTIME STRATEGY: Always use npm for serve installation
# Package manager detection is BUILD-ONLY. Runtime uses npm because:
# 1. serve is a runtime tool, not a project dependency
# 2. Avoids Corepack conflicts and Alpine image issues
# 3. npm is guaranteed available in official Node images
RUN npm install -g --force serve

# Security: Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

RUN mkdir -p /app/dist

COPY --from=builder /app/dist/ /app/temp-dist/

# Angular 17+ outputs to dist/<project>/browser, older to dist/<project>
# Some projects output directly to dist/ root
RUN echo "=== Debugging dist structure ===" && \\
    ls -la /app/temp-dist/ && \\
    echo "=== Detecting build output location ===" && \\
    if [ -f /app/temp-dist/index.html ]; then \\
      echo "Build output in root - copying from /app/temp-dist/ (Angular 14-16 dist root)..." && \\
      cp -r /app/temp-dist/* /app/dist/; \\
    else \\
      PROJECT_DIR=$(ls -d /app/temp-dist/*/ 2>/dev/null | grep -v '/assets/$' | head -1 | xargs -I{} basename {} 2>/dev/null || echo "") && \\
      echo "Found project directory: $PROJECT_DIR" && \\
      if [ -n "$PROJECT_DIR" ] && [ -d "/app/temp-dist/$PROJECT_DIR/browser" ]; then \\
        echo "Copying from browser subfolder (Angular 17+)..." && \\
        cp -r /app/temp-dist/$PROJECT_DIR/browser/* /app/dist/; \\
      elif [ -n "$PROJECT_DIR" ] && [ -d "/app/temp-dist/$PROJECT_DIR" ] && [ -f "/app/temp-dist/$PROJECT_DIR/index.html" ]; then \\
        echo "Copying from project folder (Angular 14-16)..." && \\
        ls -la /app/temp-dist/$PROJECT_DIR/ && \\
        cp -r /app/temp-dist/$PROJECT_DIR/* /app/dist/; \\
      else \\
        echo "WARNING: Could not detect standard Angular output, using fallback..." && \\
        cp -r /app/temp-dist/* /app/dist/ 2>/dev/null || true; \\
      fi; \\
    fi && \\
    echo "=== Final dist contents ===" && \\
    ls -la /app/dist/ && \\
    if [ ! -f /app/dist/index.html ]; then \\
      echo "ERROR: index.html not found in /app/dist!" && \\
      exit 1; \\
    fi && \\
    rm -rf /app/temp-dist && \\
    chown -R appuser:nodejs /app/dist

USER appuser

EXPOSE 3000
ENV PORT=3000
CMD ["sh", "-c", "serve -s dist -l $PORT"]
`.trim();
}

/**
 * Generate Dockerfile for Nuxt.js (Nuxt 3)
 * Supports build-time env vars for NUXT_PUBLIC_* and VITE_* variables
 * Uses Nitro server output (.output/server/index.mjs)
 * Supports npm, pnpm, and yarn package managers
 */
export function getNuxtjsDockerfile(envVars: Array<{key: string, value: string}> = []): string {
  // Generate ARG directives for ALL env vars (build-time availability)
  // Like Vercel: All vars available during build so Nuxt can pre-render SSR routes
  // Security: Server-side vars are still loaded from K8s Secrets at runtime
  const argDirectives = envVars.length > 0 
    ? envVars.map(e => `ARG ${e.key}`).join('\n') + '\n'
    : '';

  // Generate ENV directives to pass ARGs to build process
  const envDirectives = envVars.length > 0
    ? envVars.map(e => `ENV ${e.key}=$${e.key}`).join('\n') + '\n'
    : '';

  const pm = getPackageManagerCommands();
  
  return `
# ---- Build Stage ----
FROM node:NODE_VERSION_PLACEHOLDER-alpine AS builder
WORKDIR /app

${pm.setupPm}

${argDirectives}${pm.copyLockfiles}

${pm.install}

COPY . .

# Pass build args as environment variables for Nuxt
${envDirectives}
# Always build in production mode to prevent false positive errors
ENV NODE_ENV=production
${pm.build}

# ---- Production Stage ----
FROM node:NODE_VERSION_PLACEHOLDER-alpine
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nuxt

COPY --from=builder --chown=nuxt:nodejs /app/.output ./.output

USER nuxt

EXPOSE 3000
ENV HOST=0.0.0.0
ENV PORT=3000
ENV NODE_ENV=production

CMD ["node", ".output/server/index.mjs"]
`.trim();
}

/**
 * Generate Dockerfile for SvelteKit (adapter-node)
 * Supports build-time env vars for ALL variables (like Vercel)
 * Now supports pnpm/yarn/npm auto-detection
 */
export function getSveltekitDockerfile(envVars: Array<{key: string, value: string}> = []): string {
  const pm = getPackageManagerCommands();
  
  // Generate ARG directives for ALL env vars (build-time availability)
  // Like Vercel: All vars available during build so SvelteKit can pre-render SSR routes
  // Security: Server-side vars are still loaded from K8s Secrets at runtime
  const argDirectives = envVars.length > 0 
    ? envVars.map(e => `ARG ${e.key}`).join('\n') + '\n'
    : '';

  // Generate ENV directives to pass ARGs to SvelteKit build
  const envDirectives = envVars.length > 0
    ? envVars.map(e => `ENV ${e.key}=$${e.key}`).join('\n') + '\n'
    : '';

  return `
# ---- Build Stage ----
FROM node:NODE_VERSION_PLACEHOLDER-alpine AS builder
WORKDIR /app

${pm.setupPm}

${argDirectives}${pm.copyLockfiles}
${pm.install}

COPY . .

# Pass build args as environment variables for SvelteKit
${envDirectives}
# Always build in production mode to prevent false positive errors
ENV NODE_ENV=production
${pm.build}

# ---- Production Stage ----
FROM node:NODE_VERSION_PLACEHOLDER-alpine
WORKDIR /app

# Security: Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 sveltekit

# Copy build output and package files
COPY --from=builder --chown=sveltekit:nodejs /app/build ./build
COPY --from=builder --chown=sveltekit:nodejs /app/package*.json ./
COPY --from=builder --chown=sveltekit:nodejs /app/node_modules ./node_modules

USER sveltekit

EXPOSE 3000
ENV PORT=3000
ENV HOST=0.0.0.0
ENV NODE_ENV=production
ENV ORIGIN=http://localhost:3000

CMD ["node", "build/index.js"]
`.trim();
}

/**
 * Generate basic Python Dockerfile template (framework-specific logic in stage generator)
 */
export function getPythonDockerfile(): string {
  return `
FROM python:PYTHON_VERSION_PLACEHOLDER-slim

WORKDIR /app

# Install dependencies (safe pattern - create empty file first)
RUN touch requirements.txt
COPY requirements.tx[t] ./
RUN pip install --no-cache-dir -r requirements.txt || true

# Install production servers
RUN pip install --no-cache-dir gunicorn uvicorn[standard] || true

COPY . .

EXPOSE 8000

# CMD will be set by framework detection
`.trim();
}

// =============================================================================
// COMPLETE DOCKERFILE STAGE GENERATORS
// =============================================================================

/**
 * Generate complete "Prepare Dockerfile" stage for Node.js/Express
 */
export function generateNodejsDockerfileStage(): string {
  const nodeDetection = getNodeVersionDetectionScript(20);
  const pmDetection = getPackageManagerDetectionScript();
  const dockerignore = getDockerignoreGenerationScript();
  const dockerfile = getNodejsDockerfile();
  
  return `
if [ -f Dockerfile ]; then
  echo "========================================="
  echo "✓ FOUND EXISTING DOCKERFILE"
  echo "========================================="
  echo "Using project's existing Dockerfile instead of generating one."
  echo "This Dockerfile will be built as-is with no modifications."
  echo ""
  echo "Dockerfile contents:"
  cat Dockerfile
  echo ""
  ${pmDetection}
  export DOCKERFILE_EXISTS=true
else
  echo "No Dockerfile found - generating Node.js Dockerfile with auto-detection"
  
  ${nodeDetection}
  ${pmDetection}
  ${dockerignore}
  
  cat > Dockerfile << 'DOCKERFILE_EOF'
${dockerfile}
DOCKERFILE_EOF
  
  # Replace version placeholder only (package manager passed as build arg)
  sed -i "s/NODE_VERSION_PLACEHOLDER/$NODE_VERSION/g" Dockerfile 2>/dev/null || sed -i '' "s/NODE_VERSION_PLACEHOLDER/$NODE_VERSION/g" Dockerfile
  
  echo "Dockerfile generated successfully"
  echo "Node.js version: $NODE_VERSION"
  echo "Package manager: $PACKAGE_MANAGER (will be passed as build arg)"
  cat Dockerfile
  export DOCKERFILE_EXISTS=false
fi
`.trim();
}

/**
 * Generate complete "Prepare Dockerfile" stage for Next.js
 */
export function generateNextjsDockerfileStage(envVars: Array<{key: string, value: string}> = []): string {
  const nodeDetection = getNodeVersionDetectionScript(20);
  const pmDetection = getPackageManagerDetectionScript();
  const dockerignore = getDockerignoreGenerationScript();
  const standaloneDetection = getNextjsStandaloneDetectionScript();
  const standardDockerfile = getNextjsDockerfile(envVars);
  const standaloneDockerfile = getNextjsStandaloneDockerfile(envVars);
  
  return `
if [ -f Dockerfile ]; then
  echo "========================================="
  echo "✓ FOUND EXISTING DOCKERFILE"
  echo "========================================="
  echo "Using project's existing Dockerfile instead of generating one."
  echo "This Dockerfile will be built as-is with no modifications."
  echo ""
  echo "Dockerfile contents:"
  cat Dockerfile
  echo ""
  ${pmDetection}
  export DOCKERFILE_EXISTS=true
else
  echo "No Dockerfile found - generating Next.js Dockerfile with auto-detection"
  
  ${nodeDetection}
  ${pmDetection}
  ${dockerignore}
  
  ${standaloneDetection}
  
  if [ "$NEXTJS_STANDALONE" = "true" ]; then
    echo "Using standalone Dockerfile template"
    cat > Dockerfile << 'DOCKERFILE_EOF'
${standaloneDockerfile}
DOCKERFILE_EOF
  else
    echo "Using standard Dockerfile template"
    cat > Dockerfile << 'DOCKERFILE_EOF'
${standardDockerfile}
DOCKERFILE_EOF
  fi
  
  # Replace version placeholder only (package manager passed as build arg)
  sed -i "s/NODE_VERSION_PLACEHOLDER/$NODE_VERSION/g" Dockerfile 2>/dev/null || sed -i '' "s/NODE_VERSION_PLACEHOLDER/$NODE_VERSION/g" Dockerfile
  
  echo "Dockerfile generated successfully"
  echo "Node.js version: $NODE_VERSION"
  echo "Package manager: $PACKAGE_MANAGER (will be passed as build arg)"
  cat Dockerfile
  export DOCKERFILE_EXISTS=false
fi
`.trim();
}

/**
 * Generate complete "Prepare Dockerfile" stage for Python
 * Uses pre-generated Dockerfiles to avoid complex sed operations
 */
export function generatePythonDockerfileStage(): string {
  const versionDetection = getPythonVersionDetectionScript('3.11');
  const frameworkDetection = getPythonFrameworkDetectionScript();
  const dockerignore = getDockerignoreGenerationScript();
  
  return `
if [ -f Dockerfile ]; then
  echo "========================================="
  echo "✓ FOUND EXISTING DOCKERFILE"
  echo "========================================="
  echo "Using project's existing Dockerfile instead of generating one."
  echo "This Dockerfile will be built as-is with no modifications."
  echo ""
  echo "Dockerfile contents:"
  cat Dockerfile
  echo ""
  export DOCKERFILE_EXISTS=true
else
  echo "No Dockerfile found - generating Python Dockerfile with auto-detection"
  
  # Initialize variables with defaults
  DJANGO_PROJECT="config"
  
  ${versionDetection}
  
  ${frameworkDetection}
  
  ${dockerignore}
  
  # Generate framework-specific Dockerfile
  if [ "$PYTHON_FRAMEWORK" = "fastapi" ]; then
    echo "Creating optimized FastAPI Dockerfile"
    cat > Dockerfile << 'FASTAPI_EOF'
FROM python:PYTHON_VERSION_PLACEHOLDER-slim

WORKDIR /app

# Copy requirements if it exists (safe pattern)
RUN touch requirements.txt
COPY requirements.tx[t] ./
RUN pip install --no-cache-dir -r requirements.txt || true
RUN pip install --no-cache-dir uvicorn[standard]

COPY . .

# Security: Run as non-root user
RUN useradd -m -u 1001 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["uvicorn", "PYTHON_MODULE_PLACEHOLDER:app", "--host", "0.0.0.0", "--port", "8000"]
FASTAPI_EOF
  
  elif [ "$PYTHON_FRAMEWORK" = "flask" ]; then
    echo "Creating optimized Flask Dockerfile"
    cat > Dockerfile << 'FLASK_EOF'
FROM python:PYTHON_VERSION_PLACEHOLDER-slim

WORKDIR /app

# Copy requirements if it exists (safe pattern)
RUN touch requirements.txt
COPY requirements.tx[t] ./
RUN pip install --no-cache-dir -r requirements.txt || true
RUN pip install --no-cache-dir gunicorn

COPY . .

# Security: Run as non-root user
RUN useradd -m -u 1001 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["gunicorn", "-b", "0.0.0.0:8000", "PYTHON_MODULE_PLACEHOLDER:app"]
FLASK_EOF
  
  elif [ "$PYTHON_FRAMEWORK" = "django" ]; then
    echo "Creating optimized Django Dockerfile"
    # Find Django project name
    DJANGO_PROJECT=$(find . -maxdepth 2 -name "wsgi.py" -path "*/*/wsgi.py" 2>/dev/null | head -1 | xargs dirname 2>/dev/null | xargs basename 2>/dev/null)
    if [ -z "$DJANGO_PROJECT" ]; then
      DJANGO_PROJECT="config"
    fi
    
    cat > Dockerfile << 'DJANGO_EOF'
FROM python:PYTHON_VERSION_PLACEHOLDER-slim

WORKDIR /app

# Copy requirements if it exists (safe pattern)
RUN touch requirements.txt
COPY requirements.tx[t] ./
RUN pip install --no-cache-dir -r requirements.txt || true
RUN pip install --no-cache-dir gunicorn

COPY . .

# Security: Run as non-root user
RUN useradd -m -u 1001 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["gunicorn", "-b", "0.0.0.0:8000", "DJANGO_PROJECT_PLACEHOLDER.wsgi:application"]
DJANGO_EOF
  
  else
    echo "Creating generic Python Dockerfile"
    cat > Dockerfile << 'PYTHON_EOF'
FROM python:PYTHON_VERSION_PLACEHOLDER-slim

WORKDIR /app

# Copy requirements if it exists (safe pattern)
RUN touch requirements.txt
COPY requirements.tx[t] ./
RUN pip install --no-cache-dir -r requirements.txt || true

COPY . .

# Security: Run as non-root user
RUN useradd -m -u 1001 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["python", "PYTHON_ENTRY_FILE_PLACEHOLDER"]
PYTHON_EOF
  fi
  
  # Replace placeholders with actual values (using unique placeholders to avoid conflicts)
  sed -i "s/PYTHON_VERSION_PLACEHOLDER/$PYTHON_VERSION/g" Dockerfile 2>/dev/null || sed -i '' "s/PYTHON_VERSION_PLACEHOLDER/$PYTHON_VERSION/g" Dockerfile
  sed -i "s/PYTHON_MODULE_PLACEHOLDER/$PYTHON_MODULE/g" Dockerfile 2>/dev/null || sed -i '' "s/PYTHON_MODULE_PLACEHOLDER/$PYTHON_MODULE/g" Dockerfile
  sed -i "s/PYTHON_ENTRY_FILE_PLACEHOLDER/$PYTHON_ENTRY_FILE/g" Dockerfile 2>/dev/null || sed -i '' "s/PYTHON_ENTRY_FILE_PLACEHOLDER/$PYTHON_ENTRY_FILE/g" Dockerfile
  sed -i "s/DJANGO_PROJECT_PLACEHOLDER/$DJANGO_PROJECT/g" Dockerfile 2>/dev/null || sed -i '' "s/DJANGO_PROJECT_PLACEHOLDER/$DJANGO_PROJECT/g" Dockerfile
  
  echo "Dockerfile generated successfully"
  cat Dockerfile
fi
`.trim();
}

/**
 * Generate complete "Prepare Dockerfile" stage for static sites (Vite, Vue, React)
 * Always uses Vite-style Dockerfile for consistency (supports optional env vars)
 */
export function generateStaticSiteDockerfileStage(outputDir: string = 'dist', envVars: Array<{key: string, value: string}> = []): string {
  const nodeDetection = getNodeVersionDetectionScript(20);
  const pmDetection = getPackageManagerDetectionScript();
  const dockerignore = getDockerignoreGenerationScript();
  // Always use getViteDockerfile() for consistency - it handles both cases (with/without env vars)
  const dockerfile = getViteDockerfile(envVars, outputDir);
  
  return `
if [ -f Dockerfile ]; then
  echo "========================================="
  echo "✓ FOUND EXISTING DOCKERFILE"
  echo "========================================="
  echo "Using project's existing Dockerfile instead of generating one."
  echo "This Dockerfile will be built as-is with no modifications."
  echo ""
  echo "Dockerfile contents:"
  cat Dockerfile
  echo ""
  
  # Still detect package manager for metadata/logging purposes
  ${pmDetection}
  export DOCKERFILE_EXISTS=true
else
  echo "No Dockerfile found - generating static site Dockerfile with auto-detection"
  
  ${nodeDetection}
  ${pmDetection}
  ${dockerignore}
  
  cat > Dockerfile << 'DOCKERFILE_EOF'
${dockerfile}
DOCKERFILE_EOF
  
  # Replace version placeholder only (package manager passed as build arg)
  sed -i "s/NODE_VERSION_PLACEHOLDER/$NODE_VERSION/g" Dockerfile 2>/dev/null || sed -i '' "s/NODE_VERSION_PLACEHOLDER/$NODE_VERSION/g" Dockerfile
  
  echo "Dockerfile generated successfully"
  echo "Node.js version: $NODE_VERSION"
  echo "Package manager: $PACKAGE_MANAGER (will be passed as build arg)"
  cat Dockerfile
  export DOCKERFILE_EXISTS=false
fi
`.trim();
}

/**
 * Generate complete "Prepare Dockerfile" stage for Angular
 */
export function generateAngularDockerfileStage(envVars: Array<{key: string, value: string}> = []): string {
  const nodeDetection = getNodeVersionDetectionScript(20);
  const pmDetection = getPackageManagerDetectionScript();
  const dockerignore = getDockerignoreGenerationScript();
  const dockerfile = getAngularDockerfile(envVars);
  
  return `
if [ -f Dockerfile ]; then
  echo "========================================="
  echo "✓ FOUND EXISTING DOCKERFILE"
  echo "========================================="
  echo "Using project's existing Dockerfile instead of generating one."
  echo "This Dockerfile will be built as-is with no modifications."
  echo ""
  echo "Dockerfile contents:"
  cat Dockerfile
  echo ""
  ${pmDetection}
  export DOCKERFILE_EXISTS=true
else
  echo "Generating Angular Dockerfile with auto-detection"
  
  ${nodeDetection}
  ${pmDetection}
  ${dockerignore}
  
  cat > Dockerfile << 'DOCKERFILE_EOF'
${dockerfile}
DOCKERFILE_EOF
  
  # Replace version placeholder only (package manager passed as build arg)
  sed -i "s/NODE_VERSION_PLACEHOLDER/$NODE_VERSION/g" Dockerfile 2>/dev/null || sed -i '' "s/NODE_VERSION_PLACEHOLDER/$NODE_VERSION/g" Dockerfile
  
  echo "Dockerfile generated successfully"
  echo "Node.js version: $NODE_VERSION"
  echo "Package manager: $PACKAGE_MANAGER (will be passed as build arg)"
  cat Dockerfile
fi
`.trim();
}

/**
 * Generate complete "Prepare Dockerfile" stage for Nuxt.js
 */
export function generateNuxtjsDockerfileStage(envVars: Array<{key: string, value: string}> = []): string {
  const nodeDetection = getNodeVersionDetectionScript(20);
  const pmDetection = getPackageManagerDetectionScript();
  const dockerignore = getDockerignoreGenerationScript();
  const dockerfile = getNuxtjsDockerfile(envVars);
  
  return `
if [ -f Dockerfile ]; then
  echo "========================================="
  echo "✓ FOUND EXISTING DOCKERFILE"
  echo "========================================="
  echo "Using project's existing Dockerfile instead of generating one."
  echo "This Dockerfile will be built as-is with no modifications."
  echo ""
  echo "Dockerfile contents:"
  cat Dockerfile
  echo ""
  ${pmDetection}
  export DOCKERFILE_EXISTS=true
else
  echo "No Dockerfile found - generating Nuxt.js Dockerfile with auto-detection"
  
  ${nodeDetection}
  ${pmDetection}
  ${dockerignore}
  
  cat > Dockerfile << 'DOCKERFILE_EOF'
${dockerfile}
DOCKERFILE_EOF
  
  # Replace version placeholder only (package manager passed as build arg)
  sed -i "s/NODE_VERSION_PLACEHOLDER/$NODE_VERSION/g" Dockerfile 2>/dev/null || sed -i '' "s/NODE_VERSION_PLACEHOLDER/$NODE_VERSION/g" Dockerfile
  
  echo "Dockerfile generated successfully"
  echo "Node.js version: $NODE_VERSION"
  echo "Package manager: $PACKAGE_MANAGER (will be passed as build arg)"
  cat Dockerfile
  export DOCKERFILE_EXISTS=false
fi
`.trim();
}

/**
 * Generate complete "Prepare Dockerfile" stage for SvelteKit
 */
export function generateSveltekitDockerfileStage(envVars: Array<{key: string, value: string}> = []): string {
  const nodeDetection = getNodeVersionDetectionScript(20);
  const pmDetection = getPackageManagerDetectionScript();
  const dockerignore = getDockerignoreGenerationScript();
  const dockerfile = getSveltekitDockerfile(envVars);
  
  return `
if [ -f Dockerfile ]; then
  echo "========================================="
  echo "✓ FOUND EXISTING DOCKERFILE"
  echo "========================================="
  echo "Using project's existing Dockerfile instead of generating one."
  echo "This Dockerfile will be built as-is with no modifications."
  echo ""
  echo "Dockerfile contents:"
  cat Dockerfile
  echo ""
  ${pmDetection}
  export DOCKERFILE_EXISTS=true
else
  echo "No Dockerfile found - generating SvelteKit Dockerfile with auto-detection"
  
  ${nodeDetection}
  ${pmDetection}
  ${dockerignore}
  
  cat > Dockerfile << 'DOCKERFILE_EOF'
${dockerfile}
DOCKERFILE_EOF
  
  # Replace version placeholder only (package manager passed as build arg)
  sed -i "s/NODE_VERSION_PLACEHOLDER/$NODE_VERSION/g" Dockerfile 2>/dev/null || sed -i '' "s/NODE_VERSION_PLACEHOLDER/$NODE_VERSION/g" Dockerfile
  
  echo "Dockerfile generated successfully"
  echo "Node.js version: $NODE_VERSION"
  echo "Package manager: $PACKAGE_MANAGER (will be passed as build arg)"
  cat Dockerfile
  export DOCKERFILE_EXISTS=false
fi
`.trim();
}

// =============================================================================
// JAVA/MAVEN DOCKERFILE GENERATION
// =============================================================================

/**
 * Shell function to detect Java version from pom.xml or system
 * Returns: JAVA_VERSION variable set
 */
export function getJavaVersionDetectionScript(defaultVersion: number = 17): string {
  return `
# Detect Java version
JAVA_VERSION=${defaultVersion}
if [ -f pom.xml ]; then
  # Try to extract from maven.compiler.source or maven.compiler.target
  DETECTED=$(grep -oE '<maven.compiler.(source|target)>[0-9]+' pom.xml | grep -oE '[0-9]+' | head -1)
  if [ -n "$DETECTED" ] && [ "$DETECTED" -ge 11 ] 2>/dev/null; then
    JAVA_VERSION=$DETECTED
  else
    # Try java.version property
    DETECTED=$(grep -oE '<java.version>[0-9]+' pom.xml | grep -oE '[0-9]+' | head -1)
    if [ -n "$DETECTED" ] && [ "$DETECTED" -ge 11 ] 2>/dev/null; then
      JAVA_VERSION=$DETECTED
    fi
  fi
fi
echo "Detected Java version: $JAVA_VERSION"
`.trim();
}

/**
 * Generate production-ready Java/Maven Dockerfile
 */
export function getJavaDockerfile(): string {
  return `# Multi-stage build for Java/Maven applications
FROM maven:3.9-eclipse-temurin-JAVA_VERSION_PLACEHOLDER AS build

WORKDIR /app

# Copy pom.xml and download dependencies (cache layer)
COPY pom.xml .
RUN mvn dependency:go-offline -B

# Copy source and build
COPY src ./src
RUN mvn clean package -DskipTests

# Production stage - minimal runtime image
FROM eclipse-temurin:JAVA_VERSION_PLACEHOLDER-jre-alpine

WORKDIR /app

# Copy JAR from build stage
COPY --from=build /app/target/*.jar app.jar

# Security: Run as non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/actuator/health || exit 1

ENTRYPOINT ["java", "-jar", "app.jar"]`;
}

/**
 * Generate complete "Prepare Dockerfile" stage for Java/Maven
 */
export function generateJavaDockerfileStage(): string {
  const javaDetection = getJavaVersionDetectionScript(17);
  const dockerignore = getDockerignoreGenerationScript();
  const dockerfile = getJavaDockerfile();
  
  return `
if [ -f Dockerfile ]; then
  echo "========================================="
  echo "✓ FOUND EXISTING DOCKERFILE"
  echo "========================================="
  echo "Using project's existing Dockerfile instead of generating one."
  echo "This Dockerfile will be built as-is with no modifications."
  echo ""
  echo "Dockerfile contents:"
  cat Dockerfile
  echo ""
  export DOCKERFILE_EXISTS=true
else
  echo "No Dockerfile found - generating Java/Maven Dockerfile with auto-detection"
  
  ${javaDetection}
  ${dockerignore}
  
  cat > Dockerfile << 'DOCKERFILE_EOF'
${dockerfile}
DOCKERFILE_EOF
  
  # Replace version placeholder
  sed -i "s/JAVA_VERSION_PLACEHOLDER/$JAVA_VERSION/g" Dockerfile 2>/dev/null || sed -i '' "s/JAVA_VERSION_PLACEHOLDER/$JAVA_VERSION/g" Dockerfile
  
  echo "Dockerfile generated successfully"
  echo "Java version: $JAVA_VERSION"
  cat Dockerfile
  export DOCKERFILE_EXISTS=false
fi
`.trim();
}
