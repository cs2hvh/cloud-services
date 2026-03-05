# API Exposure Blueprint

_Audience: platform leads, product, and API engineering_  
_Last Updated: February 25, 2026_  
_Status: Implementation Ready_

This document outlines a comprehensive public API strategy that extends our deployment, data, networking, and billing capabilities to third-party automation and enterprise integration. The API design prioritizes developer experience, monetization opportunities, and alignment with industry standards (similar to DigitalOcean, AWS, and Vercel).

**Reference Documents:**
- [docs/APPLICATION_DEPLOYMENT_PLATFORM_SYNOPSIS.md](docs/APPLICATION_DEPLOYMENT_PLATFORM_SYNOPSIS.md) - Platform architecture
- [docs/DATABASE_INTEGRATION_DESIGN.md](docs/DATABASE_INTEGRATION_DESIGN.md) - Database integration patterns
- [config/services.ts](config/services.ts) - Service definitions
- [config/functions.ts](config/functions.ts) - Encryption and utility functions
- [config/spectrum-functions.ts](config/spectrum-functions.ts) - Networking automation

## Table of Contents
1. [Application Lifecycle API](#1-application-lifecycle-api) ⭐ Priority 1
2. [Database Management API](#2-database-management-api) ⭐ Priority 1
3. [Integration & Environment Variables API](#3-integration--environment-variables-api) ⭐ Priority 2
4. [DNS & Custom Domains API](#4-dns--custom-domains-api) ⭐ Priority 2
5. [Spectrum / Networking API](#5-spectrum--networking-api) ⭐ Priority 2
6. [Object Storage API](#6-object-storage-api) ⭐ Priority 3
7. [Monitoring & Logs API](#7-monitoring--logs-api) ⭐ Priority 2
8. [Billing & Credits API](#8-billing--credits-api) ⭐ Priority 3
9. [Projects & Team Management API](#9-projects--team-management-api) ⭐ Priority 2
10. [Audit Logs API](#10-audit-logs-api) ⭐ Priority 3
11. [AI Agents API](#11-ai-agents-api) 🎯 Differentiation Feature
12. [Cross-Cutting Standards](#cross-cutting-api-standards)
13. [Implementation Roadmap](#implementation-roadmap)
14. [Monetization Strategy](#monetization-strategy)

---

## 1. Application Lifecycle API

**Purpose**: Full CRUD automation of application deployment, scaling, and lifecycle management for CI/CD pipeline integration.

### Endpoints

#### Applications
```
POST   /v1/apps                    Create and deploy new application
GET    /v1/apps                    List all apps (filterable by project)
GET    /v1/apps/{appId}           Get application details and status
PATCH  /v1/apps/{appId}           Update configuration (plan, replicas, env vars)
DELETE /v1/apps/{appId}           Delete application and cleanup resources
```

#### Deployments
```
POST   /v1/apps/{appId}/deployments          Trigger new deployment
GET    /v1/apps/{appId}/deployments          List deployment history
GET    /v1/apps/{appId}/deployments/{depId}  Get deployment details
POST   /v1/apps/{appId}/deployments/{depId}/rollback  Rollback to previous
```

#### Environment Variables
```
GET    /v1/apps/{appId}/env-vars             List environment variables
PUT    /v1/apps/{appId}/env-vars             Bulk update environment variables
DELETE /v1/apps/{appId}/env-vars/{key}       Delete specific env var
```

#### Auto-Deploy & Webhooks
```
POST   /v1/apps/{appId}/webhooks             Enable auto-deploy from Git
GET    /v1/apps/{appId}/webhooks             List configured webhooks
DELETE /v1/apps/{appId}/webhooks/{webhookId} Disable auto-deploy
```

#### Scaling
```
POST   /v1/apps/{appId}/scale                Manual scale (replicas)
PATCH  /v1/apps/{appId}/autoscale            Configure autoscaling rules
```

### Key Parameters

**Application Creation:**
- `name` (string, unique, DNS-safe, max 63 chars)
- `project_id` (UUID, required)
- `git_provider` (enum: github|gitlab|bitbucket)
- `repository_url` (string, required)
- `branch` (string, default: main)
- `build_command` (string, optional - auto-detected if omitted)
- `start_command` (string, optional - auto-detected if omitted)
- `plan_size` (enum: small|medium|large)
- `replicas` (integer, default: 1, max: 10)
- `auto_deploy` (boolean, default: false)
- `env_vars` (array of {key, value, encrypted})
- `health_check_path` (string, default: /)
- `framework` (string, optional - auto-detected)
- `docker_image` (string, optional for pre-built images)
- `idempotency_key` (string, optional for safe retries)

**Deployment Triggers:**
- `force_rebuild` (boolean, skip cache)
- `deployment_message` (string, changelog note)

**Environment Variables:**
- `key` (string, uppercase recommended)
- `value` (string)
- `encrypted` (boolean, mask in logs/UI)

### Security

- **Authentication**: Supabase-issued JWT via `Authorization: Bearer <token>` header
- **Authorization**: Project-scoped RBAC via `projects.owner` and future `project_members` table
  - Owner: Full CRUD access
  - Developer: Create, read, deploy (no delete)
  - Viewer: Read-only access
- **Rate Limiting**: 30 req/min (free), 100 req/min (pro), 500 req/min (enterprise)
- **Webhook Signatures**: HMAC-SHA256 signing with shared secret (reuse Git webhook logic)
- **Environment Variable Encryption**: Automatic for values matching secret patterns, uses existing `Encryption.encrypt()` from [config/functions.ts](config/functions.ts)
- **Audit Logging**: All mutations logged via `AuditLogService.create()` to `audits.audit_logs` table

### Request/Response Examples

**Create Application:**
```json
POST /v1/apps
{
  "name": "my-nextjs-app",
  "project_id": "proj_abc123",
  "git_provider": "github",
  "repository_url": "https://github.com/user/repo",
  "branch": "main",
  "plan_size": "small",
  "auto_deploy": true,
  "env_vars": [
    {"key": "NODE_ENV", "value": "production"},
    {"key": "API_KEY", "value": "secret_123", "encrypted": true}
  ]
}

Response 201:
{
  "id": "app_xyz789",
  "name": "my-nextjs-app",
  "status": "deploying",
  "url": "https://my-nextjs-app.galaxyhvh.com",
  "created_at": "2026-02-25T10:00:00Z",
  "deployment_id": "dep_initial_001"
}
```

### Implementation Notes

- **Database**: Uses existing `Platform_Apps` query class from [lib/supabase/queries/platform_apps.ts](lib/supabase/queries/platform_apps.ts)
- **Deployment Engine**: Integrates with Jenkins pipeline and Kubernetes deployment flow
- **Framework Detection**: Leverages existing `/api/detect-framework` endpoint logic
- **Name Uniqueness**: Enforced via `Platform_Apps.check_name_exists()` (DNS/subdomain collision prevention)
- **Resource Limits**: Check `Platform_Apps.count_by_owner()` against plan quotas before creation

### Alignment

Directly exposes the automated deployment flow described in [APPLICATION_DEPLOYMENT_PLATFORM_SYNOPSIS.md](docs/APPLICATION_DEPLOYMENT_PLATFORM_SYNOPSIS.md), enabling DevOps teams to integrate the App Platform into CI/CD pipelines similar to DigitalOcean's App Platform API, Vercel API, and Heroku Platform API.

**Monetization**: Primary driver for plan upgrades (small → medium → large) and horizontal scaling (additional replicas = additional compute credits).

## 2. Database Management API
- **Purpose**: Programmatic provisioning and lifecycle control for managed Postgres/MySQL/Mongo offerings, enabling credential rotation and plan upgrades.
- **Core endpoints**: `POST /v1/databases`, `GET /v1/databases` (+filters), `GET /v1/databases/{dbId}`, `PATCH /v1/databases/{dbId}` (resize, backups, replicas), `DELETE /v1/databases/{dbId}`, `POST /v1/databases/{dbId}/users`, `POST /v1/databases/{dbId}/credentials/rotate`.
- **Key params**: `engine`, `version`, `plan_id`, `region`, retention policy, maintenance window, allow-list CIDRs, SSL enforcement, `force` delete flag.
- **Security**: JWT + project ACL, audit logging, MFA confirmation for destructive ops, credential outputs encrypted via helpers in [config/functions.ts](config/functions.ts#L1-L220).
- **Alignment**: Matches the “Databases” product defined in [config/services.ts](config/services.ts#L1-L14) and design goals in [docs/DATABASE_INTEGRATION_DESIGN.md](docs/DATABASE_INTEGRATION_DESIGN.md), driving upsell paths like DigitalOcean Managed Databases.

## 3. Integration & Environment Variables API

**Purpose**: Programmatically link apps to databases and other services, automatically inject credentials as environment variables.

### Endpoints

```
POST   /v1/apps/{appId}/integrations            Link app to database/service
GET    /v1/apps/{appId}/integrations            List app integrations
GET    /v1/integrations/{integrationId}         Get integration details
PATCH  /v1/integrations/{integrationId}         Update integration settings
DELETE /v1/integrations/{integrationId}         Unlink integration
```

### Key Parameters

- `database_id` (UUID from Database Management API)
- `env_var_prefix` (e.g., "DB_" generates DB_HOST, DB_USER, etc.)
- `use_public_connection` (boolean, default true)
- `auto_redeploy` (boolean, trigger deployment after linking)
- `notification_webhook` (URL for status callbacks)

### Security

- **Dual Ownership**: User must own both app AND database
- **State Machine**: `pending` → `linked` → `failed` (tracked in `database_integrations.status`)
- **Idempotency**: Prevent duplicate active integrations via `Database_Integrations.get_active()`

### Implementation

Implements design from [DATABASE_INTEGRATION_DESIGN.md](docs/DATABASE_INTEGRATION_DESIGN.md). Uses `Database_Integrations` and `Platform_Apps.set_env_vars()` helpers. Low-friction way to drive database adoption.

## 4. DNS & Custom Domains API

**Purpose**: Automate domain management, DNS configuration, and SSL certificate provisioning.

### Endpoints

```
POST   /v1/apps/{appId}/domains            Add custom domain
GET    /v1/apps/{appId}/domains            List domains for app
PATCH  /v1/domains/{domainId}              Update domain settings
DELETE /v1/domains/{domainId}              Remove domain
POST   /v1/domains/{domainId}/verify       Initiate DNS verification
GET    /v1/domains/{domainId}/status       Check verification status
GET    /v1/domains/{domainId}/certificate  Get certificate details
```

### Key Parameters

- `domain` (FQDN), `certificate_type` (single|wildcard)
- `redirect_to_https` (boolean), `redirect_www` (boolean)
- `verification_method` (dns|http), `verification_token` (provided)

### Security

- **Ownership Proof**: TXT record or HTTP challenge
- **Rate Limiting**: 5 domain adds per hour (prevent certificate abuse)
- **HSTS**: Enforced for production domains
- **Token Expiry**: Verification tokens expire after 24 hours

### Implementation

Leverages cert-manager and Let's Encrypt integration. Exposes DNS service logic from Platform Apps configuration. Similar to DigitalOcean Domains API and Cloudflare DNS API.

## 5. Spectrum / Networking API

**Purpose**: Expose Cloudflare Spectrum-backed L4 proxy for TCP/UDP workloads with DDoS protection and anycast networking.

### Endpoints

```
POST   /v1/network/spectrum-apps              Create Spectrum application
GET    /v1/network/spectrum-apps              List Spectrum applications
GET    /v1/network/spectrum-apps/{id}         Get Spectrum app details
PATCH  /v1/network/spectrum-apps/{id}         Update configuration
DELETE /v1/network/spectrum-apps/{id}         Delete Spectrum app
GET    /v1/network/spectrum-apps/{id}/analytics  Traffic statistics
```

### Key Parameters

- `protocol` (tcp|udp), `dns.name` (subdomain), `tls` (off|full|strict)
- `origin_direct` (array of IP:PORT), `ip_firewall` (boolean)
- `edge_ips` (dynamic|static), `traffic_type` (direct|http|https)
- `project_id` (for billing and RBAC)

### Security

- **Cloudflare Token**: Secured in environment variables
- **Project Scoping**: Users manage only their own Spectrum apps
- **Audit Logging**: All mutations logged to `project_logs`
- **Rate Limiting**: 10 req/min

### Implementation

Already implemented in [config/spectrum-functions.ts](config/spectrum-functions.ts). Pricing via `getRatesForSpectrum()`. Differentiated networking SKU like DigitalOcean's Load Balancer API.

**Monetization**: Premium networking add-on, priced per Spectrum app + bandwidth usage.

## 6. Object Storage API

**Purpose**: S3-compatible bucket management for user files, backups, and static assets.

### Endpoints

```
POST   /v1/spaces                           Create bucket
GET    /v1/spaces                           List buckets
GET    /v1/spaces/{bucketName}              Get bucket details
PATCH  /v1/spaces/{bucketName}              Update CORS/ACL settings
DELETE /v1/spaces/{bucketName}              Delete bucket
POST   /v1/spaces/{bucketName}/keys         Generate access keys
GET    /v1/spaces/{bucketName}/keys         List access keys
DELETE /v1/spaces/{bucketName}/keys/{keyId} Revoke key
GET    /v1/spaces/{bucketName}/usage        Storage & bandwidth stats
```

### Key Parameters

- `name` (globally unique), `region`, `acl` (private|public-read)
- `cors_enabled`, `versioning_enabled` (booleans)
- `lifecycle_policy` (JSON for auto-deletion rules)
- `project_id` (for billing attribution)

### Security

- **Access Keys**: Encrypted with `Encryption.encrypt()`
- **Signed URLs**: S3 pre-signed URLs for temporary access
- **Rate Limiting**: 20 req/min
- **Audit Logging**: Key generation and bucket deletion

### Implementation

Uses `ObjectSpaces` queries and DigitalOcean Spaces backend. Pricing via `getRatesForObjectStorage()`. Integrates with `object_storage_integrations` for app connections.

**Monetization**: Storage ($0.02/GB) + bandwidth charges.

---

## 7. Monitoring & Logs API

**Purpose**: Expose metrics and logs for external observability platforms (Datadog, Grafana, etc.).

### Endpoints

```
GET    /v1/apps/{appId}/metrics            Query metrics (CPU, memory, requests)
GET    /v1/databases/{dbId}/metrics        Database metrics
GET    /v1/apps/{appId}/logs               Fetch logs (paginated)
GET    /v1/apps/{appId}/logs/stream        SSE real-time log stream
POST   /v1/apps/{appId}/alerts             Create alert rule
GET    /v1/apps/{appId}/alerts             List alerts
DELETE /v1/apps/{appId}/alerts/{alertId}  Delete alert
```

### Key Parameters

- **Metrics**: `metric` (cpu|memory|disk|requests), `start`, `end` (ISO 8601), `step` (resolution)
- **Logs**: `level` (info|warn|error), `limit`, `cursor`, `search` (full-text)
- **Alerts**: `threshold`, `comparison` (gt|lt), `webhook` (notification URL)

### Security

- **Resource Ownership**: Validate app/database belongs to user's project
- **Rate Limiting**: 60 req/min metrics, 30 req/min logs
- **Secret Masking**: Detect and mask passwords, API keys in logs
- **SSE Streams**: Long-lived JWT with expiry

### Implementation

Leverages Kubernetes/Prometheus metrics and logging infrastructure. Key differentiator for enterprise users integrating with existing observability stacks.

## 8. Billing & Credits API

**Purpose**: Programmatic billing management, usage monitoring, and automated plan changes.

### Endpoints

```
GET    /v1/billing/credits                      Get credit balance
POST   /v1/billing/credits/top-ups              Add credits (Stripe integration)
GET    /v1/billing/credits/transactions         Transaction history
GET    /v1/projects/{projectId}/usage           Current billing period usage
GET    /v1/projects/{projectId}/usage/breakdown Usage by service type
POST   /v1/apps/{appId}/plan                    Upgrade/downgrade plan
POST   /v1/databases/{dbId}/plan                Resize database plan
GET    /v1/billing/invoices                     List invoices
GET    /v1/billing/invoices/{invoiceId}         Download invoice PDF
```

### Key Parameters

- **Top-ups**: `amount` (credits), `payment_method_id` (Stripe), `auto_reload` (boolean)
- **Usage**: `start_date`, `end_date`, `service_type` (filter), `format` (json|csv)
- **Plans**: `new_plan_id`, `effective_date` (immediate|next_billing_cycle)

### Security

- **2FA**: Required for top-ups > $500
- **PCI Compliance**: Tokenize payment methods via Stripe
- **Anomaly Detection**: Flag unusual spending spikes (10x normal)
- **Rate Limiting**: 10 req/min

### Implementation

Uses `BillingCredits` class and `active_*` tables (active_platform_apps, active_kubernetes). Pricing helpers in [config/pricing.ts](config/pricing.ts). Enables self-service upgrades.

**Monetization**: Reduces support burden, enables automated plan upgrades = revenue growth.

## 9. Projects & Team Management API

**Purpose**: Multi-tenant organization management, member invitations, and role-based access control.

### Endpoints

```
POST   /v1/projects                              Create project
GET    /v1/projects                              List user's projects
GET    /v1/projects/{projectId}                  Get project details
PATCH  /v1/projects/{projectId}                  Update project settings
DELETE /v1/projects/{projectId}                  Delete project (requires force)
POST   /v1/projects/{projectId}/members          Invite member
GET    /v1/projects/{projectId}/members          List members
PATCH  /v1/projects/{projectId}/members/{userId} Update member role
DELETE /v1/projects/{projectId}/members/{userId} Remove member
GET    /v1/roles                                  List available roles
```

### Key Parameters

- `name`, `description`, `owner` (set automatically)
- **Invites**: `email`, `role` (owner|developer|viewer|billing), `expires_in` (days)
- **Permissions**: viewer (read), developer (deploy), owner (delete)

### Security

- **Owner-Only**: Only project owner can invite/remove members
- **Invitation Expiry**: Tokens expire after 7 days
- **Rate Limiting**: 20 invites per day
- **Audit Logging**: All permission changes via `AuditLogService`

### Implementation

Uses `Projects` query class. Add `project_members` table for many-to-many relationships. Critical for B2B/team adoption.

---

## 10. Audit Logs API

**Purpose**: Immutable audit trail for SOC 2, GDPR, and enterprise compliance requirements.

### Endpoints

```
GET    /v1/audit-logs                          List all accessible logs
GET    /v1/audit-logs/{logId}                  Get specific log entry
GET    /v1/projects/{projectId}/audit-logs     Project-scoped logs
GET    /v1/users/{userId}/audit-logs           User activity (admins only)
POST   /v1/audit-logs/export                   Generate CSV/JSON export
```

### Key Parameters

- Filters: `user_id`, `service_type` (app|database|spectrum|billing), `action`
- `start_date`, `end_date`, `page`, `limit` (max 100)
- `include_metadata` (boolean, verbose mode)

### Security

- **Strict RBAC**: Only project owners + platform admins can read
- **Immutable**: No DELETE/UPDATE endpoints (enforced by database trigger)
- **Retention**: 90 days standard, 1 year for enterprise
- **Rate Limiting**: 30 req/min

### Implementation

Exposes `audits.audit_logs` schema with partitioning and GIN indexes. `AuditLogService.create()` already logs all mutations. Read-only API for compliance teams.

---

## 11. AI Agents API

**Purpose**: Monetize AI Agents service via API access (similar to OpenAI's Assistants API).

### Endpoints

```
POST   /v1/ai-agents                             Create AI agent
GET    /v1/ai-agents                             List agents
GET    /v1/ai-agents/{agentId}                  Get agent config
PATCH  /v1/ai-agents/{agentId}                  Update agent
DELETE /v1/ai-agents/{agentId}                  Delete agent
POST   /v1/ai-agents/{agentId}/knowledge-bases  Attach knowledge base
POST   /v1/knowledge-bases/{kbId}/documents     Upload documents
POST   /v1/conversations/{convId}/messages      Send message (chat)
GET    /v1/conversations/{convId}/messages      Get chat history
POST   /v1/ai-agents/{agentId}/api-keys         Generate agent API key
```

### Key Parameters

- `name`, `description`, `model_key_id` (LLM provider), `system_prompt`
- `temperature`, `max_tokens`, `tools` (web search, code interpreter)
- Document upload: `file` (multipart), `chunk_size`, `embedding_model`

### Security

- **Agent API Keys**: Rate-limited separately (100 req/hour per key)
- **Token Metering**: Usage metered per token (billable via credits)
- **Knowledge Base Access**: Scoped to agent owner

### Implementation

Leverages `agents` schema with `ai_agents`, `knowledge_bases`, `conversations` tables. Unique differentiator vs. AWS/DigitalOcean.

**Monetization**: Pricing per 1M tokens, enterprise custom models.

---

## Cross-Cutting API Standards

### Authentication Methods

#### 1. Supabase JWT (Primary)
```http
Authorization: Bearer <supabase_access_token>
```
- Leverage existing `supabase.auth.getUser()` in API routes
- Token includes user ID and metadata (email, roles)
- Short-lived (1 hour), automatically refreshed by client SDKs
- **Use case**: End-user applications, web dashboards

#### 2. Personal Access Tokens (PAT)
```http
Authorization: Bearer sk_live_<token_value>
```
- Long-lived tokens (configurable: 30 days to 1 year)
- User-scoped, revocable via dashboard
- Stored in `api_keys` table (hashed with SHA-256)
- **Use case**: CLI tools, CI/CD pipelines, personal scripts

#### 3. Service Account Keys (Future)
```http
Authorization: Bearer svc_<token_value>
```
- Machine-to-machine authentication
- Project-scoped (not user-scoped)
- Supports fine-grained permissions (e.g., read-only apps)
- **Use case**: Third-party integrations, monitoring agents

### Authorization (RBAC)

**Project Membership Hierarchy:**
```
Owner      → Full access (create, read, update, delete all resources)
Developer  → Create, read, update, deploy apps/databases (no delete)
Billing    → Read-only + billing operations (payment, usage)
Viewer     → Read-only access to all resources
```

**Implementation:**
```typescript
// Extend middleware.ts to check project membership
async function requireProjectAccess(
  userId: string, 
  projectId: string, 
  minRole: 'viewer' | 'developer' | 'billing' | 'owner'
): Promise<boolean> {
  const membership = await supabase
    .from('project_members')
    .select('role')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .single();
  
  const roleHierarchy = { viewer: 1, billing: 2, developer: 3, owner: 4 };
  return roleHierarchy[membership.role] >= roleHierarchy[minRole];
}
```

### Rate Limiting

**Tiered Rate Limits by Plan:**

| Plan | Per-Minute | Per-Day | Burst |
|------|-----------|---------|-------|
| **Free** | 30 | 1,000 | 10 |
| **Pro** | 100 | 50,000 | 50 |
| **Enterprise** | 500 | Unlimited | 100 |

**Implementation:**
- Extend existing `middleware.ts` rate limiter
- Use Redis (Upstash) for multi-instance deployments
- Return headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

**Differentiation by Endpoint:**
- Auth routes: 10 req/min (strict, IP-based)
- Read operations: Plan limit
- Mutations: 50% of plan limit
- Billing operations: 10 req/min (fraud prevention)

### Versioning Strategy

**URL-Based Versioning:**
```
/v1/apps          → Current stable version
/v2/apps          → New version with breaking changes
```

**Deprecation Policy:**
- New version announced 3 months before release
- Old version supported for 6 months after new version launch
- Sunset warnings via response headers: `Sunset: Sat, 31 Dec 2026 23:59:59 GMT`

**Breaking vs. Non-Breaking:**
- **Breaking**: Removing fields, changing field types, changing response structure
- **Non-Breaking**: Adding optional fields, new endpoints, additional query params

### Error Handling

**Standard Error Envelope:**
```json
{
  "error": {
    "code": "INSUFFICIENT_CREDITS",
    "message": "Your account has 5 credits remaining. This operation requires 10 credits.",
    "details": {
      "balance": 5,
      "required": 10,
      "top_up_url": "https://app.example.com/billing"
    },
    "request_id": "req_abc123xyz",
    "docs_url": "https://docs.example.com/errors/INSUFFICIENT_CREDITS"
  }
}
```

**HTTP Status Codes:**
- `200 OK`: Successful request
- `201 Created`: Resource created successfully
- `202 Accepted`: Async operation started (return job ID)
- `400 Bad Request`: Invalid parameters
- `401 Unauthorized`: Missing or invalid authentication
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource doesn't exist
- `409 Conflict`: Resource already exists (idempotency check)
- `422 Unprocessable Entity`: Validation failed
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error (log request_id)
- `503 Service Unavailable`: Maintenance mode

**Error Codes Taxonomy:**
```
VALIDATION_*       → Input validation errors
AUTH_*             → Authentication/authorization errors
RESOURCE_*         → Resource state errors (not found, conflict)
BILLING_*          → Credit/payment errors
RATE_LIMIT_*       → Rate limiting
INTEGRATION_*      → Third-party service errors
INTERNAL_*         → Server errors
```

### Pagination

**Cursor-Based (Recommended for Large Datasets):**
```json
GET /v1/apps?limit=20&cursor=eyJpZCI6MTIzfQ==

Response:
{
  "data": [...],
  "pagination": {
    "next_cursor": "eyJpZCI6MTQzfQ==",
    "previous_cursor": "eyJpZCI6MTAzfQ==",
    "has_more": true
  }
}
```

**Page-Based (Simple Datasets):**
```json
GET /v1/projects?page=2&per_page=20

Response:
{
  "data": [...],
  "pagination": {
    "page": 2,
    "per_page": 20,
    "total": 145,
    "total_pages": 8
  }
}
```

**Default Limits:**
- Default `per_page`: 20
- Max `per_page`: 100
- Cursor validity: 24 hours

### Idempotency

**Header-Based Idempotency Keys:**
```http
POST /v1/apps
Idempotency-Key: key_abc123xyz
```

**Behavior:**
- Store key + response in Redis with 24-hour TTL
- If duplicate key: return cached 201 response (no side effects)
- If key expired: treat as new request
- Return header: `Idempotent-Replayed: true` for cached responses

**Applicable to**: `POST`, `PATCH`, `DELETE` operations

### Webhooks

**Event Types:**
```
app.created            → Application created
app.deployed           → Deployment succeeded
app.deployment_failed  → Deployment failed
app.deleted            → Application deleted
database.created       → Database cluster created
database.online        → Database ready for connections
integration.linked     → App-database link established
integration.failed     → Integration failed
credit.low_balance     → Credit balance < threshold
billing.payment_failed → Top-up payment failed
```

**Webhook Payload:**
```json
POST <user_webhook_url>
X-Webhook-Signature: sha256=abc123...
X-Webhook-Event: app.deployed
X-Webhook-Delivery: uuid_delivery_id

{
  "event": "app.deployed",
  "timestamp": "2026-02-25T10:30:00Z",
  "data": {
    "app_id": "app_xyz",
    "deployment_id": "dep_123",
    "status": "success",
    "url": "https://myapp.galaxyhvh.com"
  }
}
```

**Signature Verification:**
```typescript
// Reuse Git webhook HMAC-SHA256 logic
const signature = crypto
  .createHmac('sha256', webhookSecret)
  .update(JSON.stringify(payload))
  .digest('hex');

if (signature !== req.headers['x-webhook-signature'].split('=')[1]) {
  throw new Error('Invalid signature');
}
```

**Retry Policy:**
- Retry on 5xx errors or timeouts
- Backoff: 5s, 30s, 5m (3 retries total)
- Free tier: no retries, Pro+: 3 retries

### OpenAPI Documentation

**Generate OpenAPI 3.1 Spec:**
```yaml
openapi: 3.1.0
info:
  title: Cloud Platform API
  version: 1.0.0
  description: Programmatic access to application deployment, databases, and infrastructure.
servers:
  - url: https://api.galaxyhvh.com/v1
    description: Production
paths:
  /apps:
    post:
      summary: Create Application
      tags: [Applications]
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateAppRequest'
      responses:
        '201':
          description: Application created
```

**Developer Portal:**
- Interactive docs at `api.galaxyhvh.com` (like Stripe Docs)
- Code examples in cURL, TypeScript, Python
- Try-it-now sandbox with test credentials

---

## Implementation Roadmap

### Phase 1: MVP - Core Automation (8 weeks)
**Goal**: Enable basic programmatic app and database management

**Deliverables:**
1. **Application Lifecycle API** ✅
   - `POST /v1/apps` (create & deploy)
   - `GET /v1/apps` (list)
   - `GET /v1/apps/{id}` (details)
   - `DELETE /v1/apps/{id}` (delete)
   - Env var management endpoints

2. **Database Management API** ✅
   - `POST /v1/databases` (provision)
   - `GET /v1/databases` (list with filters)
   - `GET /v1/databases/{id}` (connection details)
   - `DELETE /v1/databases/{id}` (delete)

3. **Integration API** ✅
   - `POST /v1/apps/{id}/integrations` (link app to DB)
   - `GET /v1/apps/{id}/integrations` (list integrations)

4. **Authentication & RBAC**
   - Supabase JWT validation middleware
   - Project ownership checks
   - Rate limiting (in-memory, migrate to Redis in Phase 2)

5. **Documentation**
   - OpenAPI spec for Phase 1 endpoints
   - Basic docs site with examples

**Success Metrics:**
- 20 early adopter signups for private beta
- 100+ API calls per day
- <500ms p95 latency

### Phase 2: Networking & Observability (4 weeks)
**Goal**: Add premium features and enterprise-grade monitoring

**Deliverables:**
1. **DNS & Domains API**
   - Custom domain management
   - SSL certificate automation

2. **Spectrum Networking API**
   - Expose existing Spectrum functions as REST API

3. **Monitoring & Logs API**
   - Metrics queries (Prometheus integration)
   - Log streaming (SSE)
   - Alert configuration

4. **Infrastructure Hardening**
   - Migrate rate limiting to Redis (Upstash)
   - Add idempotency key support
   - Implement webhook retry logic

**Success Metrics:**
- 5 customers using Spectrum API
- 50 custom domains added via API
- Log streaming used by 10+ users

### Phase 3: Business & Compliance (4 weeks)
**Goal**: Enable self-service billing and meet enterprise compliance needs

**Deliverables:**
1. **Billing & Credits API**
   - Credit balance queries
   - Automated top-ups (Stripe)
   - Usage breakdowns
   - Plan upgrade/downgrade

2. **Projects & Team Management API**
   - Team member invitations
   - Role management (RBAC)
   - Project creation/deletion

3. **Audit Logs API**
   - Read-only access to audit trail
   - CSV/JSON exports for compliance

4. **Security Enhancements**
   - MFA confirmation for destructive operations
   - Personal Access Tokens (PAT)
   - API key management dashboard

**Success Metrics:**
- 30% of plan upgrades via API (vs. support tickets)
- 5 enterprise customers using audit logs
- Zero security incidents

### Phase 4 (Optional): Differentiation (4 weeks)
**Goal**: Unique features to differentiate from competitors

**Deliverables:**
1. **Object Storage API**
   - S3-compatible bucket management
   - Access key generation

2. **AI Agents API**
   - Agent creation and configuration
   - Chat API (conversations)
   - Knowledge base document upload

3. **Advanced Features**
   - Service accounts (machine-to-machine auth)
   - Terraform provider
   - GitHub Actions integration

**Success Metrics:**
- 10 customers using AI Agents API
- 5 Terraform users
- First case study published

---

## Monetization Strategy

### 1. Plan-Based Rate Limits

| Tier | Monthly Cost | API Rate Limit | Daily Requests |
|------|-------------|----------------|----------------|
| **Free** | $0 | 60 req/min | 1,000 |
| **Pro** | $29/mo | 300 req/min | 50,000 |
| **Enterprise** | Custom | Custom | Unlimited |

**Implementation:**
- Check user's plan in `user_profiles.subscription_tier`
- Enforce limits in rate limiting middleware
- Display upgrade prompt in 429 error response

### 2. Usage-Based Fees (Overage Pricing)

**Beyond Quota:**
- Free tier: Hard cap (no overage)
- Pro tier: $0.01 per 1,000 additional requests
- Enterprise: Negotiated overage rates

**Data Transfer:**
- Logs API: $0.01/GB downloaded
- Metrics API: $0.01/GB downloaded
- Webhooks: Included (no extra charge)

### 3. Feature Gating

**Free Tier Restrictions:**
- ❌ Team management (Projects API)
- ❌ Audit log exports
- ❌ Webhook retries
- ❌ Custom timeouts
- ✅ Basic CRUD operations

**Pro Tier Unlocks:**
- ✅ Team management (up to 5 members)
- ✅ Audit log exports (90-day retention)
- ✅ Webhook retries (3 attempts)
- ✅ Priority support

**Enterprise Tier Extras:**
- ✅ Unlimited team members
- ✅ 1-year audit log retention
- ✅ Service accounts
- ✅ SLA guarantees
- ✅ Dedicated support channel

### 4. API-Only Plans

**"Automation Tier" - $49/month:**
- For headless/API-only users (no web dashboard usage)
- 1,000 req/min rate limit
- 200,000 requests/day included
- $0.005 per 1,000 beyond quota
- Target: DevOps teams, CI/CD heavy users

### 5. Premium Add-Ons

**Pay-Per-Use Services:**
- Object Storage: $0.02/GB storage + $0.01/GB bandwidth
- Spectrum Apps: $5/app/month + $0.01/GB traffic
- AI Agents: $0.50 per 1M tokens (GPT-4)
- Database Backups: $0.10/GB/month

### 6. Enterprise Custom Pricing

**Volume Discounts:**
- 10M+ requests/month: 20% discount
- Multi-year contracts: 30% discount
- Early adopter pricing: 50% off Year 1

**White Label / OEM:**
- Custom subdomain (api.customer-brand.com)
- Co-branded documentation
- Dedicated infrastructure (VPC)

### Revenue Projections

**Year 1 Targets:**
- 100 Pro subscribers: $2,900/mo = $34,800/year
- 10 Enterprise customers: $500/mo avg = $60,000/year
- Overage + add-ons: $1,000/mo = $12,000/year
- **Total ARR**: ~$107,000

**Growth Drivers:**
1. API usage correlates with customer success → retention
2. Self-service upgrades reduce sales friction
3. Developer evangelism (docs, SDKs, tutorials)
4. Integration marketplace (Zapier, n8n, Make)

---

## Next Steps - Action Plan

### Week 1-2: Foundation
1. ✅ **Finalize API design** (this document)
2. **Set up API routing structure**
   - Create `/app/api/v1/` directory
   - Implement versioning middleware
3. **Build authentication middleware**
   - JWT validation helper
   - Project ownership checker
   - Rate limiter upgrade (Redis integration)

### Week 3-4: Phase 1 Development
4. **Implement Application Lifecycle API**
   - Reuse existing `Platform_Apps` query logic
   - Add OpenAPI annotations
5. **Implement Database Management API**
   - Reuse `Database_Clusters` query logic
6. **Write integration tests**
   - Test auth flows
   - Test rate limiting
   - Test error handling

### Week 5-6: Documentation & Testing
7. **Generate OpenAPI specification**
   - Use `swagger-jsdoc` or similar
8. **Build developer docs site**
   - Deploy to `api.galaxyhvh.com`
   - Add code examples (cURL, TypeScript, Python)
9. **Beta testing program**
   - Invite 10-20 early adopters
   - Collect feedback via Discord/Slack

### Week 7-8: Launch Preparation
10. **Create SDK libraries**
    - TypeScript/JavaScript SDK
    - Python SDK (optional)
11. **Write blog post & tutorials**
    - "Deploying Next.js with our API"
    - "Database provisioning in 5 minutes"
12. **Soft launch** 🚀
    - Announce to existing users
    - Submit to Product Hunt, Hacker News

---

## Additional Resources

### Similar API References
- [DigitalOcean API v2](https://docs.digitalocean.com/reference/api/)
- [Vercel REST API](https://vercel.com/docs/rest-api)
- [Heroku Platform API](https://devcenter.heroku.com/articles/platform-api-reference)
- [Render API](https://render.com/docs/api)
- [Railway API](https://docs.railway.app/reference/public-api)

### Tools & Libraries
- **OpenAPI Generation**: `@nestjs/swagger`, `swagger-jsdoc`
- **API Testing**: Postman, Insomnia, Bruno
- **SDK Generation**: OpenAPI Generator, Fern
- **Rate Limiting**: `upstash-redis`, `ioredis`
- **Documentation**: Docusaurus, Mintlify, ReadMe

### Internal Dependencies
- [lib/supabase/queries/](../lib/supabase/queries/) - Database query helpers
- [config/pricing.ts](../config/pricing.ts) - Pricing calculation functions
- [lib/audit/](../lib/audit/) - Audit logging service
- [middleware.ts](../middleware.ts) - Auth & rate limiting middleware
