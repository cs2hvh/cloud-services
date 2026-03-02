# OpenAPI Workflow Analysis

## Current Setup (Manual Approach)

### What You Have Now
```
✅ public/openapi.json - Static, hand-written OpenAPI spec
✅ app/api-docs/route.ts - Scalar UI rendering via CDN
✅ Zod schemas in lib/validation/* - Used for validation
❌ Manual sync required - Zod schemas ≠ OpenAPI spec
```

### Files Staged
```bash
A  app/api-docs/route.ts           # Scalar UI route
A  app/api/v1/apps/[id]/route.ts   # API endpoints (GET/PATCH/DELETE)
M  lib/api/v1-middleware.ts        # Auth + rate limiting
A  public/openapi.json             # MANUAL OpenAPI spec
```

### Current Problem
**Every time you add/modify an API endpoint, you must update TWO places:**
1. **Code** - Zod schemas in `lib/validation/*` + route handlers
2. **Docs** - `public/openapi.json` (manual JSON editing)

This creates:
- ❌ Drift between code and docs
- ❌ Extra maintenance burden
- ❌ Human error risk
- ❌ Inconsistency over time

---

## Recommended Approach (Auto-Generation)

### Use `@asteasolutions/zod-to-openapi`

This library **generates OpenAPI specs directly from your Zod schemas** — single source of truth.

### Benefits
✅ **One source of truth** - Zod schemas drive both validation AND docs
✅ **Always in sync** - Docs auto-generated from code
✅ **Type-safe** - TypeScript ensures correctness
✅ **Less work** - No manual JSON editing
✅ **Build-time generation** - Can be part of CI/CD

---

## Implementation Pattern

### 1. Install Package
```bash
npm install @asteasolutions/zod-to-openapi
```

### 2. Extend Zod Schemas with OpenAPI Metadata

**Before (current):**
```typescript
// lib/validation/platform-apps.ts
export const updatePlatformAppSchema = z.object({
  app_id: z.string().uuid(),
  name: z.string().min(3).max(40).optional(),
  branch: z.string().optional(),
  description: z.string().optional(),
});
```

**After (with OpenAPI metadata):**
```typescript
// lib/validation/platform-apps.ts
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z); // Call once in your app

export const updatePlatformAppSchema = z.object({
  app_id: z.string().uuid().openapi({ example: '8bdf284c-d3df-40f0-9565-b6e26f588c83' }),
  name: z.string().min(3).max(40).optional().openapi({ 
    example: 'my-awesome-app',
    description: 'App name (DNS-compatible, lowercase)'
  }),
  branch: z.string().optional().openapi({ example: 'main' }),
  description: z.string().optional().openapi({ example: 'My production app' }),
  framework: z.enum(['Next.js', 'React', 'Vue.js']).optional().openapi({ example: 'Next.js' }),
  auto_deploy: z.boolean().optional().openapi({ example: true }),
}).openapi('UpdatePlatformAppRequest'); // Register as component schema
```

### 3. Register Routes in OpenAPI Registry

**Create `lib/openapi/registry.ts`:**
```typescript
import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { updatePlatformAppSchema } from '@/lib/validation/platform-apps';

export const registry = new OpenAPIRegistry();

// Register the PATCH /api/v1/apps/{id} endpoint
registry.registerPath({
  method: 'patch',
  path: '/api/v1/apps/{id}',
  tags: ['Platform Apps'],
  summary: 'Update app metadata',
  description: 'Updates app metadata (does NOT trigger redeployment). Only the app owner can update.',
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ example: '8bdf284c-d3df-40f0-9565-b6e26f588c83' })
    }),
    body: {
      description: 'App update request',
      content: {
        'application/json': {
          schema: updatePlatformAppSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'App updated successfully',
      content: {
        'application/json': {
          schema: z.object({
            data: z.object({
              id: z.string().uuid(),
              name: z.string(),
              branch: z.string(),
              updated_at: z.string(),
            }),
          }),
        },
      },
    },
    400: { description: 'Validation error' },
    403: { description: 'Forbidden - not the app owner' },
    404: { description: 'App not found' },
  },
});

// Add DELETE, GET, etc. the same way...

export function generateOpenAPI() {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  
  return generator.generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'Cloud Services - API v1',
      version: '1.0.0',
      description: 'REST API for managing platform apps, databases, and services.',
    },
    servers: [{ url: 'https://galaxyhvh.com' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'API Key',
          description: 'API key authentication (use format: `Bearer sk_live_xxx`)',
        },
      },
    },
    security: [{ bearerAuth: [] }],
  });
}
```

### 4. Generate OpenAPI Spec (Script)

**Create `scripts/generate-openapi.ts`:**
```typescript
import fs from 'fs';
import path from 'path';
import { generateOpenAPI } from '@/lib/openapi/registry';

const spec = generateOpenAPI();
const outputPath = path.join(process.cwd(), 'public', 'openapi.json');

fs.writeFileSync(outputPath, JSON.stringify(spec, null, 2), 'utf-8');
console.log(`✅ OpenAPI spec generated at: ${outputPath}`);
```

**Add to `package.json`:**
```json
{
  "scripts": {
    "generate:openapi": "tsx scripts/generate-openapi.ts",
    "build": "npm run generate:openapi && next build"
  }
}
```

### 5. Use the Generated Spec

Now `/api-docs` will automatically use the auto-generated `/openapi.json` file.

---

## Workflow Comparison

### Manual (Current)
```
1. Update Zod schema in lib/validation/*
2. Update route handler in app/api/v1/*
3. Manually edit public/openapi.json (easy to forget!)
4. Test API
5. Test docs UI
```

### Automated (Recommended)
```
1. Update Zod schema with .openapi() metadata
2. Update route handler
3. Run: npm run generate:openapi (or auto in build)
4. Test API + docs (always in sync!)
```

---

## Migration Plan

### Phase 1: Proof of Concept (1 endpoint)
- ✅ Install `@asteasolutions/zod-to-openapi`
- ✅ Create `lib/openapi/registry.ts`
- ✅ Convert **one endpoint** (e.g., PATCH /api/v1/apps/{id})
- ✅ Generate spec and verify in Scalar UI

### Phase 2: Expand Coverage
- ✅ Add remaining v1 endpoints (GET list, GET by ID, DELETE)
- ✅ Add security schemes (Bearer token)
- ✅ Add error response schemas
- ✅ Add request/response examples

### Phase 3: Automation
- ✅ Add `generate:openapi` to build script
- ✅ Add pre-commit hook to regenerate spec
- ✅ Add CI check to ensure spec is up-to-date

### Phase 4: Extend to Other APIs
- Apply same pattern to:
  - Database APIs
  - Kubernetes APIs
  - Object Storage APIs
  - Admin APIs

---

## Scalar Integration (No Changes Needed)

Your current Scalar setup **already works** with auto-generated specs:

```typescript
// app/api-docs/route.ts
export const GET = async () => {
  const html = `
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
    <script>
      Scalar.createApiReference('#app', {
        url: '/openapi.json', // ✅ Auto-generated file
      });
    </script>
  `;
  return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
};
```

The `/openapi.json` file is now **generated from code** instead of manually written.

---

## Decision Matrix

| Aspect | Manual OpenAPI | Auto-Generated (zod-to-openapi) |
|--------|----------------|----------------------------------|
| **Initial Setup** | ✅ Easy (just write JSON) | ⚠️ Medium (install + config) |
| **Maintenance** | ❌ High (dual maintenance) | ✅ Low (single source of truth) |
| **Sync Risk** | ❌ High (easy to drift) | ✅ None (generated from code) |
| **Type Safety** | ❌ None | ✅ Full TypeScript support |
| **Scalability** | ❌ Poor (manual overhead grows) | ✅ Excellent (scales with code) |
| **CI/CD Integration** | ⚠️ Manual check needed | ✅ Auto-generated in build |
| **Learning Curve** | ✅ Low | ⚠️ Medium |

---

## Recommendation

### For Your Project: **Use Auto-Generation**

**Why?**
1. You already use Zod extensively for validation
2. You're building a full API platform (will have many endpoints)
3. You want production-grade documentation
4. You want to avoid maintenance burden

### Next Steps
1. ✅ **Keep current manual setup for now** (it works!)
2. ✅ **Install `@asteasolutions/zod-to-openapi`**
3. ✅ **Create PoC with 1-2 endpoints**
4. ✅ **Evaluate and expand if satisfied**
5. ✅ **Integrate into build process**

---

## Example: Full PATCH Endpoint with Auto-Generation

```typescript
// lib/validation/platform-apps.ts
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export const updatePlatformAppSchema = z.object({
  app_id: z.string().uuid(),
  name: z.string().min(3).max(40).optional().openapi({ example: 'my-app' }),
  branch: z.string().optional().openapi({ example: 'main' }),
  description: z.string().optional().openapi({ example: 'Production app' }),
  framework: z.enum(['Next.js', 'React', 'Vue.js']).optional(),
  auto_deploy: z.boolean().optional(),
}).openapi('UpdatePlatformAppRequest');

// lib/openapi/registry.ts
import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { updatePlatformAppSchema } from '@/lib/validation/platform-apps';

export const registry = new OpenAPIRegistry();

registry.registerPath({
  method: 'patch',
  path: '/api/v1/apps/{id}',
  tags: ['Apps'],
  summary: 'Update app metadata',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: {
        'application/json': { schema: updatePlatformAppSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'App updated',
      content: {
        'application/json': {
          schema: z.object({
            data: z.object({
              id: z.string().uuid(),
              name: z.string(),
              updated_at: z.string(),
            }),
          }),
        },
      },
    },
  },
});

// scripts/generate-openapi.ts
import fs from 'fs';
import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { registry } from '@/lib/openapi/registry';

const generator = new OpenApiGeneratorV3(registry.definitions);
const spec = generator.generateDocument({
  openapi: '3.0.3',
  info: { title: 'Cloud Services API', version: '1.0.0' },
  servers: [{ url: '/' }],
});

fs.writeFileSync('public/openapi.json', JSON.stringify(spec, null, 2));
console.log('✅ OpenAPI generated!');
```

**Run:**
```bash
npm install @asteasolutions/zod-to-openapi
npm run generate:openapi
```

**Result:** `public/openapi.json` is auto-generated from your Zod schemas!

---

## Conclusion

✅ **Keep your current manual setup for quick iteration**  
✅ **Plan to migrate to auto-generation for long-term maintainability**  
✅ **Start with a small PoC to validate the approach**  
✅ **The pattern you follow should be: Code → Auto-generate → Docs**

This way, your **code is the source of truth**, and docs are always up-to-date.
