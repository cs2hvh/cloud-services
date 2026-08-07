# syntax=docker/dockerfile:1.7
#
# Build context is the parent `workers/` dir so the image can include the
# shared @ahura/runner-core package (a file: dependency).
# Build:  docker build -t ahura-deploy-runner:dev -f deploy-runner/Dockerfile .  (from workers/)
FROM node:22-alpine AS builder

WORKDIR /app

# Build the shared runner-core package first (the file: dependency). Use the
# committed lockfile + npm ci for a deterministic, deduped tree — a bare install
# lets bullmq pull its own nested ioredis, whose types then break tsc.
COPY runner-core/package.json runner-core/package-lock.json ./runner-core/
RUN cd runner-core && npm ci --no-audit --no-fund
COPY runner-core/tsconfig.json ./runner-core/
COPY runner-core/src ./runner-core/src/
RUN cd runner-core && npm run build && npm prune --omit=dev

# Install deploy-runner deps (file:../runner-core resolves to the built
# /app/runner-core), then compile.
COPY deploy-runner/package.json deploy-runner/package-lock.json ./deploy-runner/
RUN cd deploy-runner && npm ci --no-audit --no-fund
COPY deploy-runner/tsconfig.json ./deploy-runner/
COPY deploy-runner/src ./deploy-runner/src/
RUN cd deploy-runner && npm run build && npm prune --omit=dev

FROM node:22-alpine AS runtime
RUN apk add --no-cache tini \
    && addgroup -S app && adduser -S app -G app
WORKDIR /app

# deploy-runner/node_modules holds a symlink @ahura/runner-core ->
# ../../runner-core, so the runner-core tree must live at /app/runner-core.
COPY --from=builder --chown=app:app /app/runner-core ./runner-core
COPY --from=builder --chown=app:app /app/deploy-runner/node_modules ./deploy-runner/node_modules
COPY --from=builder --chown=app:app /app/deploy-runner/dist ./deploy-runner/dist
COPY --from=builder --chown=app:app /app/deploy-runner/package.json ./deploy-runner/package.json

USER app
EXPOSE 8080
ENV NODE_ENV=production \
    NODE_OPTIONS=--enable-source-maps
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "deploy-runner/dist/index.js"]
