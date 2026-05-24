# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine AS runtime
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
