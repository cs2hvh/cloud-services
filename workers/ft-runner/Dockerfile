# syntax=docker/dockerfile:1.7
#
# Multi-stage build for the ft-runner.
# Final image: ~150 MB (node:20-alpine + compiled JS + prod deps only).
#
# Build:  docker build -t ahura-ft-runner:dev .
# Run:    docker run --rm --env-file .env.local ahura-ft-runner:dev

# ── Stage 1: build ──────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install build deps first (better layer caching)
COPY package.json ./
RUN npm install --no-audit --no-fund

# Now the source + compile
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Prune dev deps for the runtime stage
RUN npm prune --omit=dev

# ── Stage 2: runtime ────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

# Run as non-root. tini reaps zombie children (Node's signal handling alone
# doesn't always cut it for SIGTERM under k8s).
RUN apk add --no-cache tini \
    && addgroup -S app && adduser -S app -G app

WORKDIR /app

COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/package.json ./package.json

USER app

EXPOSE 8080

ENV NODE_ENV=production \
    NODE_OPTIONS=--enable-source-maps

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
