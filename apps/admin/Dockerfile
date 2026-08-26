# Build from the REPO ROOT so shared code is in context:
#   docker build -f apps/admin/Dockerfile .
# =============================================================================
# Stage 1: deps
# =============================================================================
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# =============================================================================
# Stage 2: builder — Next.js standalone output for the admin app
# =============================================================================
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Public env vars used by browser bundles must exist at build time.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_MAIN_APP_URL

ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
ENV NEXT_PUBLIC_MAIN_APP_URL=${NEXT_PUBLIC_MAIN_APP_URL}
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=6144"

RUN npm run admin:build

# =============================================================================
# Stage 3: runner — minimal production image
# =============================================================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

# Runtime env vars are injected at runtime (docker run -e / --env-file):
# SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL,
# NEXT_PUBLIC_SUPABASE_ANON_KEY, ADMIN_EMAILS, plus whatever the migrated
# sections' shared services require (see the main app's Dockerfile list).

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# A standalone build of a sub-app keeps the monorepo layout: the server entry
# lands at apps/admin/server.js inside the standalone folder.
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/.next/static ./apps/admin/.next/static

USER nextjs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:3001/signin').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "apps/admin/server.js"]
