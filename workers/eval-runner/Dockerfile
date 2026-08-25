# syntax=docker/dockerfile:1.7
#
# Multi-stage build for the eval-runner.
# Final image: ~150 MB (node:22-alpine + compiled JS + prod deps only).
#
# NOTE: build context is the parent `workers/` dir, not this folder, so the
# image can include the shared @ahura/runner-core package (a file: dependency).
# Build:  docker build -t ahura-eval-runner:dev -f eval-runner/Dockerfile .   (from workers/)
# Run:    docker run --rm --env-file eval-runner/.env.local ahura-eval-runner:dev

# ── Stage 1: build ──────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Build the shared runner-core package first (it's the file: dependency the
# runner resolves to). Install deps from the committed lockfile + compile to
# dist/. npm ci keeps the exact deduped tree we build against locally.
COPY runner-core/package.json runner-core/package-lock.json ./runner-core/
RUN cd runner-core && npm ci --no-audit --no-fund
COPY runner-core/tsconfig.json ./runner-core/
COPY runner-core/src ./runner-core/src/
RUN cd runner-core && npm run build && npm prune --omit=dev

# Install eval-runner deps (file:../runner-core resolves to /app/runner-core,
# which is now built), then compile.
COPY eval-runner/package.json eval-runner/package-lock.json ./eval-runner/
RUN cd eval-runner && npm ci --no-audit --no-fund
COPY eval-runner/tsconfig.json ./eval-runner/
COPY eval-runner/src ./eval-runner/src/
RUN cd eval-runner && npm run build && npm prune --omit=dev

# ── Stage 2: runtime ────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

# Run as non-root. tini reaps zombie children (Node's signal handling alone
# doesn't always cut it for SIGTERM under k8s).
RUN apk add --no-cache tini \
    && addgroup -S app && adduser -S app -G app

WORKDIR /app

# eval-runner/node_modules holds a symlink @ahura/runner-core -> ../../runner-core,
# so the runner-core tree (dist + prod deps) must be present at /app/runner-core.
COPY --from=builder --chown=app:app /app/runner-core ./runner-core
COPY --from=builder --chown=app:app /app/eval-runner/node_modules ./eval-runner/node_modules
COPY --from=builder --chown=app:app /app/eval-runner/dist ./eval-runner/dist
COPY --from=builder --chown=app:app /app/eval-runner/package.json ./eval-runner/package.json

USER app

EXPOSE 8080

ENV NODE_ENV=production \
    NODE_OPTIONS=--enable-source-maps

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "eval-runner/dist/index.js"]
