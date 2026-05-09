# =============================================================================
# Stage 1: deps — install dependencies required for building
# =============================================================================
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# =============================================================================
# Stage 2: builder — generate OpenAPI spec + build Next.js standalone output
# =============================================================================
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Public env vars used by browser bundles must exist at build time.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}
ENV NEXT_TELEMETRY_DISABLED=1

# Some pages currently read Supabase server data during static generation.
# Pass those values as BuildKit secrets when needed instead of baking them
# into the image with ARG/ENV.
RUN --mount=type=secret,id=supabase_url,required=false \
	--mount=type=secret,id=supabase_service_role_key,required=false \
	if [ -f /run/secrets/supabase_url ]; then export SUPABASE_URL="$(cat /run/secrets/supabase_url)"; fi; \
	if [ -f /run/secrets/supabase_service_role_key ]; then export SUPABASE_SERVICE_ROLE_KEY="$(cat /run/secrets/supabase_service_role_key)"; fi; \
	npm run build

# =============================================================================
# Stage 3: runner — minimal production image for standalone server
# =============================================================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Runtime env vars are intentionally not declared with ENV here.
# Inject them at runtime via docker run -e, --env-file, or Kubernetes Secrets.
# Expected runtime vars for this app include:
# DOMAIN, APP_DOMAIN, REDIS_URL, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN,
# PTERO_DOMAIN, PTERO_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
# OPENAI_API_KEY, OPENROUTER_API_KEY, RESEND_API_KEY, RESEND_DOMAIN,
# ENCRYPTION_KEY, DIGITAL_OCEAN_TOKEN, SPACES_ACCESS_KEY, SPACES_SECRET_KEY,
# JENKINS_URL, JENKINS_WEBHOOK_SECRET, JENKINS_DEPLOYMENT_RECORD_SECRET,
# WEBHOOK_BASE_URL, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID,
# STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, CLOUDFLARE_API_TOKEN_SPECTRUM,
# CLOUDFLARE_ZONE_ID_SPECTRUM, PARENT_DOMAIN_SPECTRUM, KUBE_IP,
# KUBE_CONFIG_STRING, GITLAB_CLIENT_ID, GITLAB_CLIENT_SECRET,
# BITBUCKET_CLIENT_ID, BITBUCKET_CLIENT_SECRET, NAMECOM_API_BASE_URL,
# NAMECOM_API_TOKEN, NAMECOM_USERNAME.

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:3000/').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
