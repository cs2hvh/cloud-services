# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS builder

WORKDIR /app
# Use the committed lockfile + `npm ci` for a deterministic, deduped tree.
# A bare `npm install` (no lock) lets bullmq pull its own nested ioredis, whose
# Redis type then clashes with the top-level one and breaks `tsc`.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runtime
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
