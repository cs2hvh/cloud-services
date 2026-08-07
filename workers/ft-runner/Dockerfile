# syntax=docker/dockerfile:1.7
#
# Multi-stage build for the ft-runner.
# Final image: ~150 MB (node:22-alpine + compiled JS + prod deps only).
#
# NOTE: build context is the parent `workers/` dir, not this folder, so the
# image can include the shared @ahura/runner-core package (a file: dependency).
# Build:  docker build -t ahura-ft-runner:dev -f ft-runner/Dockerfile .   (from workers/)
# Run:    docker run --rm --env-file ft-runner/.env.local ahura-ft-runner:dev

# ── Stage 1: build ──────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Build the shared runner-core package first (it's the file: dependency the
# runner resolves to). Install deps from the committed lockfile + compile to
# dist/. npm ci keeps the exact deduped tree we build against locally — without
# it bullmq pulls its own nested ioredis, whose mismatched types break tsc.
COPY runner-core/package.json runner-core/package-lock.json ./runner-core/
RUN cd runner-core && npm ci --no-audit --no-fund
COPY runner-core/tsconfig.json ./runner-core/
COPY runner-core/src ./runner-core/src/
RUN cd runner-core && npm run build && npm prune --omit=dev

# Install ft-runner deps (file:../runner-core resolves to /app/runner-core,
# which is now built), then compile.
COPY ft-runner/package.json ft-runner/package-lock.json ./ft-runner/
RUN cd ft-runner && npm ci --no-audit --no-fund
COPY ft-runner/tsconfig.json ./ft-runner/
COPY ft-runner/src ./ft-runner/src/
RUN cd ft-runner && npm run build && npm prune --omit=dev

# ── Stage 2: runtime ────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

# Run as non-root. tini reaps zombie children (Node's signal handling alone
# doesn't always cut it for SIGTERM under k8s).
RUN apk add --no-cache tini \
    && addgroup -S app && adduser -S app -G app

WORKDIR /app

# ft-runner/node_modules holds a symlink @ahura/runner-core -> ../../runner-core,
# so the runner-core tree (dist + prod deps) must be present at /app/runner-core.
COPY --from=builder --chown=app:app /app/runner-core ./runner-core
COPY --from=builder --chown=app:app /app/ft-runner/node_modules ./ft-runner/node_modules
COPY --from=builder --chown=app:app /app/ft-runner/dist ./ft-runner/dist
COPY --from=builder --chown=app:app /app/ft-runner/package.json ./ft-runner/package.json

USER app

EXPOSE 8080

ENV NODE_ENV=production \
    NODE_OPTIONS=--enable-source-maps

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "ft-runner/dist/index.js"]
