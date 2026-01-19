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
 */
export function getNodejsDockerfile(): string {
  return `
FROM node:NODE_VERSION_PLACEHOLDER-alpine

WORKDIR /app

COPY package*.json ./

# Use npm ci if lockfile exists, otherwise npm install
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
`.trim();
}

/**
 * Generate Dockerfile for Next.js (standard mode)
 */
export function getNextjsStandardDockerfile(): string {
  return `
# ---- Build Stage ----
FROM node:NODE_VERSION_PLACEHOLDER-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Ensure public folder exists for COPY
RUN mkdir -p ./public

# ---- Run Stage ----
FROM node:NODE_VERSION_PLACEHOLDER-alpine
WORKDIR /app

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public

EXPOSE 3000
ENV PORT=3000
CMD ["npm", "start"]
`.trim();
}

/**
 * Generate Dockerfile for Next.js (standalone mode)
 */
export function getNextjsStandaloneDockerfile(): string {
  return `
# ---- Build Stage ----
FROM node:NODE_VERSION_PLACEHOLDER-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Ensure public folder exists for COPY
RUN mkdir -p ./public

# ---- Run Stage (Standalone) ----
FROM node:NODE_VERSION_PLACEHOLDER-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy standalone server and static files
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
`.trim();
}

/**
 * Generate Dockerfile for static sites (Vite, Vue, React, Angular)
 */
export function getStaticSiteDockerfile(outputDir: string = 'dist'): string {
  return `
# ---- Build Stage ----
FROM node:NODE_VERSION_PLACEHOLDER-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .
RUN npm run build

# ---- Production Stage ----
FROM node:NODE_VERSION_PLACEHOLDER-alpine
WORKDIR /app

RUN npm install -g serve

# Ensure dist exists before copying
RUN mkdir -p ./dist
COPY --from=builder /app/${outputDir}/. ./dist/

EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
`.trim();
}

/**
 * Generate Dockerfile for Angular (handles browser subfolder)
 * Uses runtime detection inside Dockerfile (more reliable!)
 */
export function getAngularDockerfile(): string {
  return `
# ---- Build Stage ----
FROM node:NODE_VERSION_PLACEHOLDER-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN if [ -f package-lock.json ]; then \
      npm ci --legacy-peer-deps || (echo "⚠️  WARNING: npm ci failed, falling back to npm install (lockfile may be outdated)" && npm install --legacy-peer-deps); \\
    else \
      npm install --legacy-peer-deps; \
    fi

COPY . .
RUN npm run build

# ---- Production Stage ----
FROM node:NODE_VERSION_PLACEHOLDER-alpine
WORKDIR /app

RUN npm install -g serve
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
    rm -rf /app/temp-dist

EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
`.trim();
}

/**
 * Generate Dockerfile for Nuxt.js (Nitro server)
 */
export function getNuxtjsDockerfile(): string {
  return `
# ---- Build Stage ----
FROM node:NODE_VERSION_PLACEHOLDER-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

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
 */
export function getSveltekitDockerfile(): string {
  return `
# ---- Build Stage ----
FROM node:NODE_VERSION_PLACEHOLDER-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .
RUN npm run build

# ---- Production Stage ----
FROM node:NODE_VERSION_PLACEHOLDER-alpine
WORKDIR /app

# Copy build output and package files
COPY --from=builder /app/build ./build
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

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
  const detection = getNodeVersionDetectionScript(20);
  const dockerfile = getNodejsDockerfile();
  
  return `
if [ -f Dockerfile ]; then
  echo "Using existing Dockerfile"
else
  echo "Generating Node.js Dockerfile with auto-detection"
  
  ${detection}
  
  cat > Dockerfile << 'DOCKERFILE_EOF'
${dockerfile}
DOCKERFILE_EOF
  
  # Replace version placeholder
  sed -i "s/NODE_VERSION_PLACEHOLDER/$NODE_VERSION/g" Dockerfile 2>/dev/null || sed -i '' "s/NODE_VERSION_PLACEHOLDER/$NODE_VERSION/g" Dockerfile
  
  echo "Dockerfile generated successfully"
  cat Dockerfile
fi
`.trim();
}

/**
 * Generate complete "Prepare Dockerfile" stage for Next.js
 */
export function generateNextjsDockerfileStage(): string {
  const nodeDetection = getNodeVersionDetectionScript(20);
  const standaloneDetection = getNextjsStandaloneDetectionScript();
  const standardDockerfile = getNextjsStandardDockerfile();
  const standaloneDockerfile = getNextjsStandaloneDockerfile();
  
  return `
if [ -f Dockerfile ]; then
  echo "Using existing Dockerfile"
else
  echo "Generating Next.js Dockerfile with auto-detection"
  
  ${nodeDetection}
  
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
  
  # Replace version placeholder
  sed -i "s/NODE_VERSION_PLACEHOLDER/$NODE_VERSION/g" Dockerfile 2>/dev/null || sed -i '' "s/NODE_VERSION_PLACEHOLDER/$NODE_VERSION/g" Dockerfile
  
  echo "Dockerfile generated successfully"
  cat Dockerfile
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
  
  return `
if [ -f Dockerfile ]; then
  echo "Using existing Dockerfile"
else
  echo "Generating Python Dockerfile with auto-detection"
  
  # Initialize variables with defaults
  DJANGO_PROJECT="config"
  
  ${versionDetection}
  
  ${frameworkDetection}
  
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
 * Generate complete "Prepare Dockerfile" stage for static sites (Vite, Vue)
 */
export function generateStaticSiteDockerfileStage(outputDir: string = 'dist'): string {
  const detection = getNodeVersionDetectionScript(20);
  const dockerfile = getStaticSiteDockerfile(outputDir);
  
  return `
if [ -f Dockerfile ]; then
  echo "Using existing Dockerfile"
else
  echo "Generating static site Dockerfile with auto-detection"
  
  ${detection}
  
  cat > Dockerfile << 'DOCKERFILE_EOF'
${dockerfile}
DOCKERFILE_EOF
  
  # Replace version placeholder
  sed -i "s/NODE_VERSION_PLACEHOLDER/$NODE_VERSION/g" Dockerfile 2>/dev/null || sed -i '' "s/NODE_VERSION_PLACEHOLDER/$NODE_VERSION/g" Dockerfile
  
  echo "Dockerfile generated successfully"
  cat Dockerfile
fi
`.trim();
}

/**
 * Generate complete "Prepare Dockerfile" stage for Angular
 */
export function generateAngularDockerfileStage(): string {
  const detection = getNodeVersionDetectionScript(20);
  const dockerfile = getAngularDockerfile();
  
  return `
if [ -f Dockerfile ]; then
  echo "Using existing Dockerfile"
else
  echo "Generating Angular Dockerfile with auto-detection"
  
  ${detection}
  
  cat > Dockerfile << 'DOCKERFILE_EOF'
${dockerfile}
DOCKERFILE_EOF
  
  # Replace version placeholder
  sed -i "s/NODE_VERSION_PLACEHOLDER/$NODE_VERSION/g" Dockerfile 2>/dev/null || sed -i '' "s/NODE_VERSION_PLACEHOLDER/$NODE_VERSION/g" Dockerfile
  
  echo "Dockerfile generated successfully"
  cat Dockerfile
fi
`.trim();
}

/**
 * Generate complete "Prepare Dockerfile" stage for Nuxt.js
 */
export function generateNuxtjsDockerfileStage(): string {
  const detection = getNodeVersionDetectionScript(20);
  const dockerfile = getNuxtjsDockerfile();
  
  return `
if [ -f Dockerfile ]; then
  echo "Using existing Dockerfile"
else
  echo "Generating Nuxt.js Dockerfile with auto-detection"
  
  ${detection}
  
  cat > Dockerfile << 'DOCKERFILE_EOF'
${dockerfile}
DOCKERFILE_EOF
  
  # Replace version placeholder
  sed -i "s/NODE_VERSION_PLACEHOLDER/$NODE_VERSION/g" Dockerfile 2>/dev/null || sed -i '' "s/NODE_VERSION_PLACEHOLDER/$NODE_VERSION/g" Dockerfile
  
  echo "Dockerfile generated successfully"
  cat Dockerfile
fi
`.trim();
}

/**
 * Generate complete "Prepare Dockerfile" stage for SvelteKit
 */
export function generateSveltekitDockerfileStage(): string {
  const detection = getNodeVersionDetectionScript(20);
  const dockerfile = getSveltekitDockerfile();
  
  return `
if [ -f Dockerfile ]; then
  echo "Using existing Dockerfile"
else
  echo "Generating SvelteKit Dockerfile with auto-detection"
  
  ${detection}
  
  cat > Dockerfile << 'DOCKERFILE_EOF'
${dockerfile}
DOCKERFILE_EOF
  
  # Replace version placeholder
  sed -i "s/NODE_VERSION_PLACEHOLDER/$NODE_VERSION/g" Dockerfile 2>/dev/null || sed -i '' "s/NODE_VERSION_PLACEHOLDER/$NODE_VERSION/g" Dockerfile
  
  echo "Dockerfile generated successfully"
  cat Dockerfile
fi
`.trim();
}
