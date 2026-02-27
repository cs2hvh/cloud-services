# API v1 Documentation

**Status:** ✅ Production Ready  
**Version:** 1.0.0  
**Last Updated:** 2026-02-27

This document describes the implemented API v1 infrastructure.

---

## What's Implemented

### Authentication
- ✅ Personal Access Tokens (PAT) - `sk_live_...` format
- ✅ JWT Session Tokens
- ✅ Dual auth support in all v1 endpoints

### Security
- ✅ SHA-256 hashing (one-way, no encryption)
- ✅ Constant-time comparison (timing attack prevention)
- ✅ 192-bit entropy (cryptographic random generation)
- ✅ Show-once policy (full key only on creation)

### Rate Limiting
- ✅ Per-user, per-operation
- ✅ Plan-based: Free (30/min), Pro (100/min), Enterprise (500/min)
- ✅ Standard headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`

### Response Format
- ✅ Success: `{ data: T, meta?: {...} }`
- ✅ Error: `{ error: string, message?: string }`
- ✅ HTTP status codes: 200, 201, 400, 401, 403, 404, 409, 429, 500

### API Endpoints
- ✅ GET /api/v1/apps - List all user's apps
- ✅ GET /api/v1/apps/{id} - Get app by ID
- ✅ PATCH /api/v1/apps/{id} - Update app metadata (does NOT redeploy)
- ✅ DELETE /api/v1/apps/{id} - Delete app and all infrastructure
- ❌ POST /api/v1/apps - **Not supported** (deployment requires OAuth session, billing integration, Jenkins pipeline)

---

## Architecture

```
Request
  ↓
withV1Auth(operation, handler)
  ↓
authenticateApiRequest() → JWT or PAT validation
  ↓
Rate Limiting (Redis) → per-user per-operation
  ↓
Handler (your code)
  ↓
v1Ok() or v1Error()
  ↓
Response
```

---

## Files Structure

```
lib/
├── api-auth.ts                      # Dual auth (JWT + PAT)
├── api/v1-middleware.ts             # withV1Auth, v1Ok, v1Error
├── supabase/queries/api_keys.ts     # PAT CRUD operations
└── idempotency.ts                   # Future use

app/api/
├── auth/api-keys/                   # Internal PAT management
│   ├── route.ts                     # POST (create), GET (list)
│   └── [id]/route.ts                # DELETE
└── v1/                              # Public API (read-only)
    └── apps/, PATCH (update), DELETE (delete)
        ├── route.ts                 # GET (list)
        └── [id]/route.ts            # GET (by id)

app/dashboard/settings/
└── api-keys/page.tsx                # UI for API key management

supabase/migrations/
└── 20260226_api_keys.sql            # Database schema
```

---

## API Endpoints

### Internal (Dashboard)

#### Create API Key
```http
POST /api/auth/api-keys
Authorization: Bearer <session_jwt>
Content-Type: application/json

{
  "name": "Production API Key",
  "plan": "free"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "abc123",
    "name": "Production API Key",
    "key_prefix": "sk_live_abc1234...",
    "plan": "free",
    "full_key": "sk_live_WXfeHQ5VuD3xqlZP1h5yVy0LSXDrPA2d",
    "created_at": "2026-02-27T00:00:00Z"
  }
}
```

⚠️ **`full_key` is shown only once** - copy it now!

#### List API Keys
```http
GET /api/auth/api-keys
Authorization: Bearer <session_jwt>
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "abc123",
      "name": "Production API Key",
      "key_prefix": "sk_live_abc1234...",
      "plan": "free",
      "last_used_at": null,
      "created_at": "2026-02-27T00:00:00Z"
    }
  ]
}
```

#### Delete API Key
```http
DELETE /api/auth/api-keys/{id}
Authorization: Bearer <session_jwt>
```

**Response (200):**
```json
{
  "success": true,
  "message": "API key deleted successfully"
}
```

---

### Public API v1

#### List Applications
```http
GET /api/v1/apps
Authorization: Bearer sk_live_WXfeHQ5VuD3xqlZP1h5yVy0LSXDrPA2d
```

**Response (200):**
```json
{
  "data": [
    {
      "id": "abc123",
      "name": "my-app",
      "slug": "my-app-xyz",
      "framework": "Next.js",
      "repository_name": "user/repo",
      "branch": "main",
      "status": "running",
      "port": 3000,
      "ip": "139.59.1.6",
      "size": "small",
      "auto_deploy": true,
      "created_at": "2026-02-27T00:00:00Z",
      "updated_at": "2026-02-27T00:00:00Z"
    }
  ],
  "meta": {
    "total": 5
  }
}
```

#### Get Application by ID
```http
GET /api/v1/apps/{id}
Authorization: Bearer sk_live_WXfeHQ5VuD3xqlZP1h5yVy0LSXDrPA2d
```

**Response (200):**
```json
{
  "data": {
    "id": "abc123",
    "name": "my-app",
    "slug": "my-app-xyz",
    "framework": "Next.js",
    "repository_name": "user/repo",
    "repository_url": "https://github.com/user/repo",
    "branch": "main",
    "status": "running",
    "deployment_url": "https://my-app-xyz.galaxyhvh.com",
    "port": 3000,
    "ip": "139.59.1.6",
    "size": "small",
    "auto_deploy": true,
    "git_provider": "github",
    "build_command": "npm run build",
    "output_directory": ".next",
    "created_at": "2026-02-27T00:00:00Z",
    "updated_at": "2026-02-27T00:00:00Z"
  }
}
```

**Invalid ID Format (400):**
```json
{
  "error": "Validation failed",
  "details": {
    "code": "INVALID_ID",
    "field": "id"
  },
  "message": "Invalid app ID format"
}
```

**Not Found (404):**
```json
{
  "error": "Validation failed",
  "details": {
    "code": "NOT_FOUND"
  },
  "message": "App not found"
}
```

**Access Denied (403):**
```json
{
  "error": "Validation failed",
  "details": {
    "code": "FORBIDDEN"
  },
  "message": "Access denied"
}
```

---

#### Update Application Metadata
```http
PATCH /api/v1/apps/{id}
Authorization: Bearer sk_live_WXfeHQ5VuD3xqlZP1h5yVy0LSXDrPA2d
Content-Type: application/json

{
  "name": "my-app-renamed",
  "branch": "production",
  "build_command": "npm run build:prod"
}
```

**⚠️ Important:** This endpoint updates **metadata only** and does **NOT trigger redeployment**. To apply changes, manually redeploy via dashboard.

**Updatable Fields:**
- `name` - App name (does NOT update DNS/Jenkins)
- `branch` - Git branch (does NOT pull new code)
- `framework` - Framework type
- `build_command` - Build command
- `output_directory` - Output directory
- `container_port` - Container port
- `status` - Status (pending/building/running/failed/stopped)
- `deployment_url` - Deployment URL

**Response (200):**
```json
{
  "data": {
    "id": "abc123",
    "name": "my-app-renamed",
    "slug": "my-app-xyz",
    "framework": "Next.js",
    "repository_name": "user/repo",
    "branch": "production",
    "status": "running",
    "deployment_url": "https://my-app-xyz.galaxyhvh.com",
    "updated_at": "2026-02-27T12:00:00Z"
  }
}
```

**Validation Errors (400):**
```json
{
  "error": "Validation failed",
  "details": {
    "validation_errors": [
      { "path": "name", "message": "App name must be at least 3 characters" }
    ]
  },
  "message": "Invalid request body"
}
```

**Not Found (404):**
```json
{
  "error": "Validation failed",
  "details": { "code": "NOT_FOUND" },
  "message": "App not found"
}
```

**Access Denied (403):**
```json
{
  "error": "Validation failed",
  "details": { "code": "FORBIDDEN" },
  "message": "Access denied"
}
```

---

#### Delete Application
```http
DELETE /api/v1/apps/{id}
Authorization: Bearer sk_live_WXfeHQ5VuD3xqlZP1h5yVy0LSXDrPA2d
```

**⚠️ Warning:** This is a **destructive operation** that:
- Deletes Jenkins job
- Deletes Kubernetes resources (Deployment, Service, Ingress)
- Deletes DNS records (Cloudflare)
- Deletes all custom domains
- Stops billing (prorated final charge)
- **Cannot be undone**

**Response (200):**
```json
{
  "data": {
    "id": "abc123",
    "name": "my-app",
    "deleted": true
  }
}
```

**Not Found (404):**
```json
{
  "error": "Validation failed",
  "details": { "code": "NOT_FOUND" },
  "message": "App not found"
}
```

**Access Denied (403):**
```json
{
  "error": "Validation failed",
  "details": { "code": "FORBIDDEN" },
  "message": "Access denied"
}
```

**Deletion Failed (500):**
```json
{
  "error": "Validation failed",
  "details": {
    "code": "DELETE_FAILED",
    "details": "Jenkins job deletion failed"
  },
  "message": "Failed to delete app. Infrastructure cleanup may be incomplete."
}
```

---
```http
GET /api/v1/apps/{id}
Authorization: Bearer sk_live_WXfeHQ5VuD3xqlZP1h5yVy0LSXDrPA2d
```

**Response (200):**
```json
{
  "data": {
    "id": "abc123",
    "name": "my-app",
    "slug": "my-app-xyz",
    "framework": "Next.js",
    "repository_name": "user/repo",
    "repository_url": "https://github.com/user/repo",
    "branch": "main",
    "status": "running",
    "deployment_url": "https://my-app-xyz.galaxyhvh.com",
    "port": 3000,
    "ip": "139.59.1.6",
    "size": "small",
    "auto_deploy": true,
    "git_provider": "github",
    "build_command": "npm run build",
    "output_directory": ".next",
    "created_at": "2026-02-27T00:00:00Z",
    "updated_at": "2026-02-27T00:00:00Z"
  }
}
```

**Invalid ID Format (400):**
```json
{
  "error": "Validation failed",
  "details": {
    "code": "INVALID_ID",
    "field": "id"
  },
  "message": "Invalid app ID format"
}
```

**Not Found (404):**
```json
{
  "error": "Validation failed",
  "details": {
    "code": "NOT_FOUND"
  },
  "message": "App not found"
}
```

**Access Denied (403):**
```json
{
  "error": "Validation failed",
  "details": {
    "code": "FORBIDDEN"
  },
  "message": "Access denied"
}
```

---

## Error Responses

### 401 Unauthorized
```json
{
  "error": "Missing Authorization header"
}
```

### 400 Bad Request
```json
{
  "error": "Validation failed",
  "message": "name: Required"
}
```

### 404 Not Found
```json
{
  "error": "Resource not found",
  "message": "App with id 'abc123' does not exist"
}
```

### 429 Too Many Requests
```json
{
  "error": "Too Many Requests",
  "retry_after": 42
}
```

**Headers:**
```
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 0
Retry-After: 42
```

---

## Usage Examples

### Create an Endpoint

```typescript
// app/api/v1/resource/route.ts
import { withV1Auth, v1Ok, v1Error } from "@/lib/api/v1-middleware";

export const GET = withV1Auth("resource:list", async (req, auth) => {
  const items = await getItems(auth.userId);
  
  return v1Ok({
    data: items,
    meta: { total: items.length }
  });
});

export const POST = withV1Auth("resource:create", async (req, auth) => {
  const body = await req.json();
  
  if (!body.name) {
    return v1Error("Validation failed", 400, "name: Required");
  }
  
  const item = await createItem({ ...body, userId: auth.userId });
  return v1Ok({ data: item }, 201);
});
```

### Test with curl

```bash
# Create API key (in dashboard first, copy the full key)

# Use API key
curl http://localhost:3000/api/v1/apps \
  -H "Authorization: Bearer sk_live_..."

# Or use JWT session token
curl http://localhost:3000/api/v1/apps \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## Security Implementation

### Token Format
```
sk_live_<24_random_bytes_base64url>
Example: sk_live_WXfeHQ5VuD3xqlZP1h5yVy0LSXDrPA2d
```

### Generation
```typescript
// lib/supabase/queries/api_keys.ts
import { randomBytes, createHash } from "crypto";

const randomPart = randomBytes(24).toString("base64url"); // 192 bits
const fullKey = `sk_live_${randomPart}`;
const hash = createHash("sha256").update(fullKey).digest("hex");
```

### Validation
```typescript
// lib/supabase/queries/api_keys.ts
import { timingSafeEqual } from "crypto";

const storedHashBuffer = Buffer.from(storedHash, "hex");
const inputHashBuffer = Buffer.from(inputHash, "hex");

if (timingSafeEqual(storedHashBuffer, inputHashBuffer)) {
  // Valid
}
```

### Database Storage
```sql
-- Stored in database
key_hash: "a3f5e821c9d4..." (SHA-256, 64 hex chars)
key_prefix: "sk_live_abc1234..." (first 15 chars + "...")

-- Never stored
full_key: "sk_live_WXfeHQ5VuD3xqlZP1h5yVy0LSXDrPA2d"
```

---

## Rate Limiting

### Redis Key Structure
```
api:v1:<operation>:<userId>

Examples:
- api:v1:apps:list:550e8400-e29b-41d4-a716-446655440000
- api:v1:apps:create:550e8400-e29b-41d4-a716-446655440000
```

### Plan Limits

| Plan | Limit | Window |
|------|-------|--------|
| Free | 30 requests | 60 seconds |
| Pro | 100 requests | 60 seconds |
| Enterprise | 500 requests | 60 seconds |

### Per-User, Not Per-Token
- User with 10 tokens = still 30/100/500 req/min total
- Read operations (apps:list) don't block write operations (apps:create)

---

## Middleware API

### `withV1Auth(operation, handler)`
Wraps a route with authentication and rate limiting.

**Parameters:**
- `operation` - Rate limit key (e.g., "apps:list", "databases:create")
- `handler` - Your route handler `(req, auth) => Promise<NextResponse>`

**Auto-handles:**
- 401 - Missing/invalid auth
- 429 - Rate limit exceeded
- 500 - Unhandled exceptions

**Returns:** Next.js route handler

### `v1Ok(body, status?)`
Standard success response.

**Parameters:**
- `body` - `{ data: T, meta?: {...} }`
- `status` - HTTP status (default: 200)

**Returns:** JSON response with security headers

### `v1Error(error, status?, message?)`
Standard error response.

**Parameters:**
- `error` - Short error identifier
- `status` - HTTP status (default: 400)
- `message` - Optional detailed message

**Returns:** JSON response

---

## Database Schema

```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  key_prefix VARCHAR(20) NOT NULL,
  key_hash VARCHAR(64) NOT NULL,
  plan VARCHAR(20) NOT NULL DEFAULT 'free',
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_user ON api_keys(user_id);
```

---

## Testing

### Manual Tests
```bash
# 200 OK
curl -i http://localhost:3000/api/v1/apps \
  -H "Authorization: Bearer sk_live_..."

# 401 Unauthorized (missing auth)
curl -i http://localhost:3000/api/v1/apps

# 401 Unauthorized (invalid token)
curl -i http://localhost:3000/api/v1/apps \
  -H "Authorization: Bearer invalid_token"

# 429 Rate Limit (35 requests for free plan)
for i in {1..35}; do
  curl -i http://localhost:3000/api/v1/apps \
    -H "Authorization: Bearer sk_live_..."
done
```

### Expected Results
- ✅ 200 with `{ data: [...], meta: { total: N } }`
- ✅ 401 with `{ error: "Missing Authorization header" }`
- ✅ 401 with `{ error: "Invalid or expired token" }`
- ✅ 429 with `{ error: "Too Many Requests", retry_after: 42 }`
- ✅ Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`

---

## What's NOT Implemented

These are documented but not yet coded:

- ❌ Pagination (`limit`, `offset` query params)
- ❌ Error tracking codes (`err_1234_abcd`)
- ❌ Query validation (Zod schemas)
- ❌ Idempotency middleware
- ❌ POST/PATCH/DELETE endpoints for apps
- ❌ Other API resources (databases, deployments, etc.)

See [API_EXPOSURE_BLUEPRINT.md](API_EXPOSURE_BLUEPRINT.md) for the full roadmap.

---

## Quick Reference

### Status Codes
- **200** OK - Successful GET/PATCH/DELETE
- **201** Created - Successful POST
- **400** Bad Request - Validation failed
- **401** Unauthorized - Missing/invalid auth
- **403** Forbidden - Not authorized
- **404** Not Found - Resource doesn't exist
- **429** Too Many Requests - Rate limited
- **500** Internal Server Error - Unhandled exception

### Response Structure
```typescript
// Success
{ data: T, meta?: Record<string, unknown> }

// Error
{ error: string, message?: string }
```

### Common Patterns
```typescript
// 404 - Not found
if (!item) return v1Error("Resource not found", 404);

// 403 - Not authorized
if (item.user_id !== auth.userId) return v1Error("Access denied", 403);

// 400 - Validation
if (!body.name) return v1Error("Validation failed", 400, "name: Required");

// 201 - Created
return v1Ok({ data: item }, 201);
```

---

## Links

- **Strategic Roadmap:** [API_EXPOSURE_BLUEPRINT.md](API_EXPOSURE_BLUEPRINT.md) - Future APIs plan
- **Detailed Implementation Guide:** [API_V1_IMPLEMENTATION.md](API_V1_IMPLEMENTATION.md) - Deep dive
- **Sync Status:** [CHECKLIST.md](CHECKLIST.md) - Verification checklist
