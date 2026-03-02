# OpenAPI Auto-Generation Setup

## Overview

This project uses `@asteasolutions/zod-to-openapi` to automatically generate OpenAPI documentation from Zod schemas. This ensures your API documentation is always in sync with your code.

## How It Works

```
Zod Schemas (with .openapi()) → Registry → Generate Script → public/openapi.json → Scalar UI
```

**Single source of truth:** Code drives documentation.

## Files

- `lib/openapi/init.ts` - Extends Zod with OpenAPI functionality
- `lib/openapi/registry.ts` - Registers all API endpoints and schemas
- `scripts/generate-openapi.ts` - Generation script
- `public/openapi.json` - Generated OpenAPI spec (auto-generated, do not edit manually!)

## Usage

### Generate OpenAPI Spec

```bash
npm run generate:openapi
```

This generates `public/openapi.json` from the registry.

### View Documentation

```bash
npm run dev
```

Then visit: http://localhost:3000/api-docs

### Build Process

The OpenAPI spec is automatically generated during build:

```bash
npm run build  # Runs generate:openapi first
```

## Adding New Endpoints

### Step 1: Define Schemas in Registry

Edit `lib/openapi/registry.ts`:

```typescript
import { z } from '@/lib/openapi/init';

// Define request/response schemas
export const CreateDatabaseRequestSchema = z.object({
  name: z.string().min(3).openapi({ example: 'my-database' }),
  type: z.enum(['postgresql', 'mysql']).openapi({ example: 'postgresql' }),
  size: z.string().openapi({ example: 'small' }),
}).openapi('CreateDatabaseRequest');

// Register endpoint
registry.registerPath({
  method: 'post',
  path: '/api/v1/databases',
  tags: ['Databases'],
  summary: 'Create a new database',
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateDatabaseRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Database created',
      content: {
        'application/json': {
          schema: DatabaseResponseSchema,
        },
      },
    },
    // Add other responses...
  },
});
```

### Step 2: Generate Spec

```bash
npm run generate:openapi
```

### Step 3: Verify

Visit http://localhost:3000/api-docs to see your new endpoint.

## Tips

### Use Existing Validation Schemas

If you already have Zod schemas for validation, you can use them directly:

```typescript
// lib/validation/databases.ts
import { z } from '@/lib/openapi/init';  // Import from init, not 'zod'

export const createDatabaseSchema = z.object({
  name: z.string().min(3).openapi({ example: 'my-db' }),
  type: z.enum(['postgresql', 'mysql']),
  // ... other fields
}).openapi('CreateDatabaseRequest');
```

Then use it in both validation AND the registry:

```typescript
// In your route handler
const validation = createDatabaseSchema.safeParse(body);

// In registry.ts
registry.registerPath({
  // ...
  request: {
    body: {
      content: {
        'application/json': {
          schema: createDatabaseSchema,
        },
      },
    },
  },
});
```

### Organize by Service

For larger APIs, split the registry by service:

```
lib/openapi/
  ├── init.ts
  ├── registry.ts (main)
  ├── services/
  │   ├── platform-apps.ts
  │   ├── databases.ts
  │   ├── kubernetes.ts
  │   └── object-storage.ts
```

Then import and use in main registry:

```typescript
// lib/openapi/registry.ts
import { registerPlatformAppsEndpoints } from './services/platform-apps';
import { registerDatabaseEndpoints } from './services/databases';

export const registry = new OpenAPIRegistry();

registerPlatformAppsEndpoints(registry);
registerDatabaseEndpoints(registry);
// ...
```

### Add Examples

Use `.openapi()` to add examples, descriptions, and metadata:

```typescript
z.string().openapi({ 
  example: 'my-app',
  description: 'App name (DNS-compatible)',
  minLength: 3,
  maxLength: 40,
})
```

### Common Response Schemas

Define reusable schemas for consistency:

```typescript
// Error response (already defined in registry.ts)
export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  details: z.record(z.unknown()).optional(),
}).openapi('ErrorResponse');

// Use in multiple endpoints
responses: {
  400: {
    description: 'Validation error',
    content: {
      'application/json': {
        schema: ErrorResponseSchema,
      },
    },
  },
}
```

## Current Status

**Implemented:**
- ✅ Platform Apps API (4 operations)
  - GET /api/v1/apps
  - GET /api/v1/apps/{id}
  - PATCH /api/v1/apps/{id}
  - DELETE /api/v1/apps/{id}

**Next to Add:**
- ⏳ Database API
- ⏳ Kubernetes API
- ⏳ Object Storage API
- ⏳ Compute API

## Troubleshooting

### "Command tsx not found"

Install tsx:

```bash
npm install tsx --save-dev
```

### Generation fails

Check that:
1. All schemas use `z` from `@/lib/openapi/init` (not directly from 'zod')
2. You called `extendZodWithOpenApi(z)` in init.ts
3. All schemas are properly registered in the registry

### Docs not updating

Regenerate the spec:

```bash
npm run generate:openapi
```

Then refresh your browser (hard refresh: Cmd+Shift+R).

## Resources

- [zod-to-openapi docs](https://github.com/asteasolutions/zod-to-openapi)
- [OpenAPI 3.0 spec](https://swagger.io/specification/)
- [Scalar docs](https://github.com/scalar/scalar)
