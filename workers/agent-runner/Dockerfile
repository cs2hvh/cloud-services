# syntax=docker/dockerfile:1.7
#
# Multi-stage build for the agent-runner.
# Final image: ~150 MB (node:22-alpine + compiled JS + prod deps only).
#
# NOTE: build context is the parent `workers/` dir, not this folder, so the
# image can include the shared file: dependencies @ahura/runner-core AND
# @ahura/agent-core.
# Build:  docker build -t ahura-agent-runner:dev -f agent-runner/Dockerfile .   (from workers/)
# Run:    docker run --rm --env-file agent-runner/.env.local ahura-agent-runner:dev

# ── Stage 1: build ──────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Build @ahura/runner-core (file: dep) first.
COPY runner-core/package.json runner-core/package-lock.json ./runner-core/
RUN cd runner-core && npm ci --no-audit --no-fund
COPY runner-core/tsconfig.json ./runner-core/
COPY runner-core/src ./runner-core/src/
RUN cd runner-core && npm run build && npm prune --omit=dev

# Build @ahura/agent-core (file: dep) — the pure loop core. Zero runtime deps,
# so after build + prune only dist/ remains.
COPY agent-core/package.json agent-core/package-lock.json ./agent-core/
RUN cd agent-core && npm ci --no-audit --no-fund
COPY agent-core/tsconfig.json ./agent-core/
COPY agent-core/src ./agent-core/src/
RUN cd agent-core && npm run build && npm prune --omit=dev

# Install agent-runner deps (file:../runner-core + file:../agent-core resolve to
# the built trees above), then compile.
COPY agent-runner/package.json agent-runner/package-lock.json ./agent-runner/
RUN cd agent-runner && npm ci --no-audit --no-fund
COPY agent-runner/tsconfig.json ./agent-runner/
COPY agent-runner/src ./agent-runner/src/
RUN cd agent-runner && npm run build && npm prune --omit=dev

# ── Stage 2: runtime ────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

# Run as non-root. tini reaps zombie children under k8s SIGTERM.
RUN apk add --no-cache tini \
    && addgroup -S app && adduser -S app -G app

WORKDIR /app

# agent-runner/node_modules holds symlinks @ahura/runner-core -> ../../runner-core
# and @ahura/agent-core -> ../../agent-core, so both trees must be present.
COPY --from=builder --chown=app:app /app/runner-core ./runner-core
COPY --from=builder --chown=app:app /app/agent-core ./agent-core
COPY --from=builder --chown=app:app /app/agent-runner/node_modules ./agent-runner/node_modules
COPY --from=builder --chown=app:app /app/agent-runner/dist ./agent-runner/dist
COPY --from=builder --chown=app:app /app/agent-runner/package.json ./agent-runner/package.json

USER app

EXPOSE 8080

ENV NODE_ENV=production \
    NODE_OPTIONS=--enable-source-maps

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "agent-runner/dist/index.js"]
