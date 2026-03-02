# API v1 Architecture Analysis & Improvement Plan

## Executive Summary

After analyzing all OpenAPI-related code, middleware, utilities, and route handlers, this document outlines:
1. **Current State Assessment** - What's working well and what needs improvement
2. **Common Patterns** - Functions that can be shared across all APIs
3. **Flexible Components** - Parts that should remain resource-specific
4. **Improved Architecture** - A clean, consistent flow for building new APIs
5. **Implementation Roadmap** - Step-by-step guide for fast, bug-free development

---

## Current State Assessment

### ✅ **Strengths**

1. **Consistent Middleware Pattern**
   - `withV1Auth()` wraps all routes uniformly
   - Authentication → Rate Limiting → Handler → Response
   - Rate limiting is per-user, per-operation (excellent granularity)

2. **Standardized Error Responses**
   - `v1Error()` - consistent error format with codes, messages, details
   - `v1ValidationError()` - structured validation errors
   - Clear HTTP status code mapping

3. **OpenAPI Auto-Generation**
   - Zod schemas generate OpenAPI spec automatically
   - Single source of truth (code = docs)
   - Build-time generation ensures freshness

4. **Type Safety**
   - Zod validation provides compile-time safety
   - TypeScript inference across the stack
   - No manual type duplication

5. **Clean Separation of Concerns**
   - Middleware handles cross-cutting concerns
   - Validation isolated in `/lib/validation`
   - Data access in `/lib/supabase/queries`
   - Business logic in route handlers

### ⚠️ **Areas for Improvement**

1. **Code Duplication**
   ```typescript
   // ❌ Same helper duplicated in every resource route
   async function getValidatedAppId(context) { ... }
   async function getValidatedDatabaseId(context) { ... }
   async function getValidatedClusterId(context) { ... }
   ```

2. **Repetitive Patterns**
   ```typescript
   // ❌ Ownership check repeated everywhere
   if (app.user_id !== auth.userId) {
     return v1Error("FORBIDDEN", 403, "You do not have permission...");
   }
   ```

3. **Inconsistent Error Messages**
   ```typescript
   // ❌ Similar errors with different messages
   "Access denied"
   "You do not have permission to access this app"
   "You do not have permission to modify this app"
   "You do not have permission to delete this app"
   ```

4. **Manual OpenAPI Registration**
   ```typescript
   // ❌ Verbose, repetitive registration code
   registry.registerPath({
     method: 'get',
     path: '/api/v1/apps/{id}',
     tags: ['Platform Apps'],
     // ... 50 lines of boilerplate
   });
   ```

5. **No Centralized Error Code Registry**
   ```typescript
   // ❌ Error codes scattered across files
   v1Error("NOT_FOUND", 404, "App not found")
   v1Error("NOT_FOUND", 404, "Database not found")
   v1Error("NOT_FOUND", 404, "Cluster not found")
   ```

6. **Computed Fields Handled Inconsistently**
   ```typescript
   // ❌ Some fields computed inline, some in queries
   deployment_url: `https://${app.slug}.apps.hostguardian.net`
   ```

7. **No Standard CRUD Response Format**
   ```typescript
   // ❌ Different endpoints return different fields
   // GET returns full object
   // PATCH returns partial object
   // DELETE returns minimal object
   ```

---

## Architecture Principles

### 1. **DRY (Don't Repeat Yourself)**
- Common patterns extracted to reusable utilities
- Error codes centralized
- Validation helpers shared

### 2. **Convention Over Configuration**
- Standard patterns for CRUD operations
- Predictable file structure
- Consistent naming

### 3. **Type Safety First**
- Zod as single source of truth
- TypeScript inference everywhere
- No `any` types

### 4. **Fail Fast, Fail Clear**
- Validate early
- Descriptive error messages
- Structured error responses

### 5. **Documentation as Code**
- OpenAPI generated from code
- Examples in Zod schemas
- Self-documenting helpers

---

## Improved Architecture

### **Component Hierarchy**

```
┌─────────────────────────────────────────────────────────────────┐
│                         API v1 STACK                             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Layer 1: Route Handlers (app/api/v1/*)                         │
│  - Thin controllers                                              │
│  - Business logic only                                           │
│  - Use helpers for common patterns                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Layer 2: V1 Utilities (lib/api/v1-*)                          │
│  - v1-middleware.ts → Auth, rate limiting, error handling       │
│  - v1-helpers.ts → Common patterns (NEW)                        │
│  - v1-errors.ts → Error codes & helpers (NEW)                   │
│  - v1-openapi.ts → OpenAPI helpers (NEW)                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Layer 3: Validation (lib/validation/*)                         │
│  - Zod schemas for request/response                              │
│  - Business rules                                                │
│  - Sanitization & transformation                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Layer 4: Data Access (lib/supabase/queries/*)                 │
│  - Database operations                                           │
│  - Type-safe queries                                             │
│  - Result wrappers                                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Layer 5: External Services (lib/services/*)                    │
│  - Jenkins, Kubernetes, AWS, etc.                                │
│  - Infrastructure operations                                     │
│  - Error handling                                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Common Components (What to Share)

### 1. **UUID Validation Helper** ✨ NEW

**File:** `lib/api/v1-helpers.ts`

```typescript
/**
 * Extract and validate UUID from route params
 * Usage: const { id, error } = await v1ExtractId(context, 'id');
 */
export async function v1ExtractId(
  context: RouteContext | undefined,
  paramName: string = 'id'
): Promise<{ id: string; error: null } | { id: null; error: NextResponse }> {
  if (!context?.params) {
    return { 
      id: null, 
      error: v1Error("INTERNAL_ERROR", 500, "Missing route context") 
    };
  }

  const rawParams = await context.params;
  const value = Array.isArray(rawParams[paramName]) 
    ? rawParams[paramName][0] 
    : rawParams[paramName];

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  if (!value || !uuidRegex.test(value)) {
    return { 
      id: null, 
      error: v1Error("INVALID_ID", 400, `Invalid ${paramName} format`, { field: paramName }) 
    };
  }

  return { id: value, error: null };
}
```

### 2. **Resource Ownership Verification** ✨ NEW

```typescript
/**
 * Verify resource ownership
 * Usage: const error = v1VerifyOwnership(resource.user_id, auth.userId, 'app');
 */
export function v1VerifyOwnership(
  resourceOwnerId: string,
  currentUserId: string,
  resourceType: string
): NextResponse | null {
  if (resourceOwnerId !== currentUserId) {
    return v1Error(
      "FORBIDDEN",
      403,
      `You do not have permission to access this ${resourceType}`
    );
  }
  return null;
}
```

### 3. **Resource Not Found Helper** ✨ NEW

```typescript
/**
 * Standard resource not found error
 * Usage: if (!result.success) return v1NotFound('app');
 */
export function v1NotFound(resourceType: string): NextResponse {
  return v1Error(
    "NOT_FOUND",
    404,
    `${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)} not found`
  );
}
```

### 4. **Validation Error Transformer** ✨ NEW

```typescript
/**
 * Transform Zod errors to v1 format
 * Usage: return v1TransformValidationError(validation.error);
 */
export function v1TransformValidationError(zodError: z.ZodError): NextResponse {
  const errors = zodError.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
  return v1ValidationError(errors);
}
```

### 5. **Centralized Error Codes** ✨ NEW

**File:** `lib/api/v1-errors.ts`

```typescript
/**
 * Centralized error code registry
 * All V1 API error codes in one place
 */
export const V1_ERROR_CODES = {
  // Authentication (401)
  UNAUTHORIZED: {
    code: "UNAUTHORIZED",
    status: 401,
    message: "Missing or invalid API key",
  },
  
  // Authorization (403)
  FORBIDDEN: {
    code: "FORBIDDEN",
    status: 403,
    message: "You do not have permission to access this resource",
  },
  
  // Not Found (404)
  NOT_FOUND: {
    code: "NOT_FOUND",
    status: 404,
    message: "Resource not found",
  },
  
  // Validation (400)
  VALIDATION_ERROR: {
    code: "VALIDATION_ERROR",
    status: 400,
    message: "Invalid request body",
  },
  
  INVALID_ID: {
    code: "INVALID_ID",
    status: 400,
    message: "Invalid ID format",
  },
  
  // Rate Limiting (429)
  RATE_LIMIT_EXCEEDED: {
    code: "RATE_LIMIT_EXCEEDED",
    status: 429,
    message: "Too many requests. Please try again later.",
  },
  
  // Server Errors (500+)
  INTERNAL_ERROR: {
    code: "INTERNAL_ERROR",
    status: 500,
    message: "Internal server error",
  },
  
  UPDATE_FAILED: {
    code: "UPDATE_FAILED",
    status: 500,
    message: "Failed to update resource",
  },
  
  DELETE_FAILED: {
    code: "DELETE_FAILED",
    status: 500,
    message: "Failed to delete resource",
  },
  
  CREATE_FAILED: {
    code: "CREATE_FAILED",
    status: 500,
    message: "Failed to create resource",
  },
} as const;

/**
 * Helper to get error by code
 */
export function v1GetError(
  code: keyof typeof V1_ERROR_CODES,
  customMessage?: string,
  details?: Record<string, unknown>
): NextResponse {
  const errorDef = V1_ERROR_CODES[code];
  return v1Error(
    errorDef.code,
    errorDef.status,
    customMessage || errorDef.message,
    details
  );
}
```

### 6. **OpenAPI Response Templates** ✨ NEW

**File:** `lib/api/v1-openapi.ts`

```typescript
/**
 * Standard error response templates for OpenAPI
 * Reduces boilerplate when registering endpoints
 */
export const OPENAPI_ERROR_RESPONSES = {
  401: {
    description: 'Unauthorized - missing or invalid API key',
    content: {
      'application/json': {
        schema: ErrorResponseSchema,
        example: {
          error: 'UNAUTHORIZED',
          message: 'Missing or invalid API key'
        }
      },
    },
  },
  
  403: {
    description: 'Forbidden - insufficient permissions',
    content: {
      'application/json': {
        schema: ErrorResponseSchema,
        example: {
          error: 'FORBIDDEN',
          message: 'You do not have permission to access this resource'
        }
      },
    },
  },
  
  404: {
    description: 'Resource not found',
    content: {
      'application/json': {
        schema: ErrorResponseSchema,
        example: {
          error: 'NOT_FOUND',
          message: 'Resource not found'
        }
      },
    },
  },
  
  400: {
    description: 'Validation error - invalid request body',
    content: {
      'application/json': {
        schema: ValidationErrorResponseSchema,
        example: {
          error: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          validation_errors: [
            { path: 'name', message: 'Must be at least 3 characters' }
          ]
        }
      },
    },
  },
  
  429: {
    description: 'Too many requests - rate limit exceeded',
    content: {
      'application/json': {
        schema: ErrorResponseSchema,
        example: {
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.'
        }
      },
    },
  },
  
  500: {
    description: 'Internal server error',
    content: {
      'application/json': {
        schema: ErrorResponseSchema,
        example: {
          error: 'INTERNAL_ERROR',
          message: 'Internal server error'
        }
      },
    },
  },
};

/**
 * Helper to build standard CRUD responses
 */
export function buildCRUDResponses(
  operations: ('list' | 'get' | 'create' | 'update' | 'delete')[],
  successSchemas: {
    list?: any;
    get?: any;
    create?: any;
    update?: any;
    delete?: any;
  }
) {
  const responses: Record<string, any> = {};
  
  // All operations get 401
  responses['401'] = OPENAPI_ERROR_RESPONSES[401];
  
  if (operations.includes('list')) {
    responses['list'] = {
      200: { description: 'List of resources', schema: successSchemas.list },
      ...pick(OPENAPI_ERROR_RESPONSES, [401, 429]),
    };
  }
  
  if (operations.includes('get') || operations.includes('update') || operations.includes('delete')) {
    const commonErrors = pick(OPENAPI_ERROR_RESPONSES, [401, 403, 404]);
    
    if (operations.includes('get')) {
      responses['get'] = {
        200: { description: 'Resource details', schema: successSchemas.get },
        ...commonErrors,
      };
    }
    
    if (operations.includes('update')) {
      responses['update'] = {
        200: { description: 'Resource updated', schema: successSchemas.update },
        400: OPENAPI_ERROR_RESPONSES[400],
        ...commonErrors,
      };
    }
    
    if (operations.includes('delete')) {
      responses['delete'] = {
        200: { description: 'Resource deleted', schema: successSchemas.delete },
        ...commonErrors,
        500: OPENAPI_ERROR_RESPONSES[500],
      };
    }
  }
  
  if (operations.includes('create')) {
    responses['create'] = {
      201: { description: 'Resource created', schema: successSchemas.create },
      400: OPENAPI_ERROR_RESPONSES[400],
      401: OPENAPI_ERROR_RESPONSES[401],
    };
  }
  
  return responses;
}
```

### 7. **Standard CRUD Handler Pattern** ✨ NEW

```typescript
/**
 * Standard patterns for CRUD operations
 */

// GET /:id pattern
export async function v1GetResourceById<T>(
  context: RouteContext,
  auth: AuthContext,
  resourceName: string,
  getFunc: (id: string) => Promise<Result<T>>,
  transformFunc: (data: T) => any
): Promise<NextResponse> {
  // Extract & validate ID
  const { id, error: idError } = await v1ExtractId(context);
  if (idError) return idError;
  
  // Fetch resource
  const result = await getFunc(id);
  if (!result.success) return v1NotFound(resourceName);
  
  // Verify ownership
  const ownershipError = v1VerifyOwnership(
    (result.data as any).user_id,
    auth.userId,
    resourceName
  );
  if (ownershipError) return ownershipError;
  
  // Transform & return
  return v1Ok({ data: transformFunc(result.data) });
}

// PATCH /:id pattern
export async function v1UpdateResource<T>(
  context: RouteContext,
  auth: AuthContext,
  req: NextRequest,
  resourceName: string,
  validationSchema: z.ZodSchema,
  getFunc: (id: string) => Promise<Result<T>>,
  updateFunc: (id: string, data: any) => Promise<Result<T>>,
  transformFunc: (data: T) => any
): Promise<NextResponse> {
  // Extract & validate ID
  const { id, error: idError } = await v1ExtractId(context);
  if (idError) return idError;
  
  // Parse & validate body
  const body = await req.json();
  const validation = validationSchema.safeParse({ id, ...body });
  if (!validation.success) return v1TransformValidationError(validation.error);
  
  // Check existence & ownership
  const existing = await getFunc(id);
  if (!existing.success) return v1NotFound(resourceName);
  
  const ownershipError = v1VerifyOwnership(
    (existing.data as any).user_id,
    auth.userId,
    resourceName
  );
  if (ownershipError) return ownershipError;
  
  // Update
  const result = await updateFunc(id, validation.data);
  if (!result.success) {
    return v1GetError("UPDATE_FAILED", `Failed to update ${resourceName}`, {
      details: result.error
    });
  }
  
  // Transform & return
  return v1Ok({ data: transformFunc(result.data) });
}

// DELETE /:id pattern
export async function v1DeleteResource<T>(
  context: RouteContext,
  auth: AuthContext,
  resourceName: string,
  getFunc: (id: string) => Promise<Result<T>>,
  deleteFunc: (id: string, userId: string) => Promise<void>
): Promise<NextResponse> {
  // Extract & validate ID
  const { id, error: idError } = await v1ExtractId(context);
  if (idError) return idError;
  
  // Check existence & ownership
  const existing = await getFunc(id);
  if (!existing.success) return v1NotFound(resourceName);
  
  const ownershipError = v1VerifyOwnership(
    (existing.data as any).user_id,
    auth.userId,
    resourceName
  );
  if (ownershipError) return ownershipError;
  
  // Delete
  try {
    await deleteFunc(id, auth.userId);
    return v1Ok({
      data: {
        id,
        deleted: true,
      },
    });
  } catch (error) {
    console.error(`[DELETE ${resourceName}/${id}]`, error);
    return v1GetError("DELETE_FAILED", `Failed to delete ${resourceName}`, {
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
```

---

## Flexible Components (What to Keep Separate)

### 1. **Resource-Specific Validation Rules**
- Each resource has unique business rules
- Stay in `/lib/validation/{resource}.ts`
- Example: App name validation vs database name validation

### 2. **Business Logic**
- Resource creation workflows
- State transitions
- External service integrations
- Keep in route handlers

### 3. **Response Transformations**
- Computed fields per resource
- Field filtering/projection
- Resource-specific enrichment

### 4. **Service Integration Logic**
- Jenkins operations for apps
- Kubernetes operations for clusters
- AWS S3 operations for storage
- Keep in `/lib/services/*`

---

## Improved Flow for New APIs

### **Step 1: Define Validation Schema**

`lib/validation/databases.ts`
```typescript
import { z } from '@/lib/openapi/init';

export const createDatabaseSchema = z.object({
  name: z.string().min(3).max(63)
    .openapi({ example: 'my-database', description: 'Database name' }),
  type: z.enum(['postgresql', 'mysql'])
    .openapi({ example: 'postgresql' }),
  size: z.enum(['small', 'medium', 'large'])
    .openapi({ example: 'small' }),
}).openapi('CreateDatabaseRequest');

export const updateDatabaseSchema = z.object({
  name: z.string().min(3).max(63).optional(),
  size: z.enum(['small', 'medium', 'large']).optional(),
}).openapi('UpdateDatabaseRequest');
```

### **Step 2: Define Response Schemas**

`lib/openapi/schemas/databases.ts`
```typescript
import { z } from '@/lib/openapi/init';

export const DatabaseSchema = z.object({
  id: z.string().uuid().openapi({ example: 'uuid-here' }),
  name: z.string().openapi({ example: 'my-database' }),
  type: z.enum(['postgresql', 'mysql']).openapi({ example: 'postgresql' }),
  size: z.string().openapi({ example: 'small' }),
  status: z.enum(['creating', 'active', 'failed']).openapi({ example: 'active' }),
  connection_string: z.string().openapi({ example: 'postgresql://...' }),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
}).openapi('Database');

export const DatabaseResponseSchema = z.object({
  data: DatabaseSchema,
}).openapi('DatabaseResponse');

export const DatabaseListResponseSchema = z.object({
  data: z.array(DatabaseSchema),
  meta: PaginationMetaSchema,
}).openapi('DatabaseListResponse');
```

### **Step 3: Register OpenAPI Endpoints**

`lib/openapi/resources/databases.ts`
```typescript
import { registry } from '@/lib/openapi/registry';
import { buildCRUDResponses } from '@/lib/api/v1-openapi';

export function registerDatabaseEndpoints() {
  const responses = buildCRUDResponses(
    ['list', 'get', 'create', 'update', 'delete'],
    {
      list: DatabaseListResponseSchema,
      get: DatabaseResponseSchema,
      create: DatabaseResponseSchema,
      update: DatabaseResponseSchema,
      delete: z.object({ data: z.object({ id: z.string(), deleted: z.boolean() }) }),
    }
  );

  // GET /api/v1/databases
  registry.registerPath({
    method: 'get',
    path: '/api/v1/databases',
    tags: ['Databases'],
    summary: 'List all databases',
    security: [{ bearerAuth: [] }],
    responses: responses.list,
  });

  // GET /api/v1/databases/{id}
  registry.registerPath({
    method: 'get',
    path: '/api/v1/databases/{id}',
    tags: ['Databases'],
    summary: 'Get database by ID',
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({
        id: z.string().uuid().openapi({ description: 'Database UUID' }),
      }),
    },
    responses: responses.get,
  });

  // ... similar for POST, PATCH, DELETE
}
```

### **Step 4: Implement Route Handler**

`app/api/v1/databases/[id]/route.ts`
```typescript
import { withV1Auth, v1Ok } from '@/lib/api/v1-middleware';
import { 
  v1GetResourceById, 
  v1UpdateResource, 
  v1DeleteResource 
} from '@/lib/api/v1-helpers';
import { Databases } from '@/lib/supabase/queries';
import { updateDatabaseSchema } from '@/lib/validation/databases';

// GET /api/v1/databases/:id
export const GET = withV1Auth("databases:get", async (_req, auth, context) => {
  return v1GetResourceById(
    context,
    auth,
    'database',
    Databases.get,
    (db) => ({
      id: db.id,
      name: db.name,
      type: db.type,
      size: db.size,
      status: db.status,
      connection_string: db.connection_string,
      created_at: db.created_at,
      updated_at: db.updated_at,
    })
  );
});

// PATCH /api/v1/databases/:id
export const PATCH = withV1Auth("databases:update", async (req, auth, context) => {
  return v1UpdateResource(
    context,
    auth,
    req,
    'database',
    updateDatabaseSchema,
    Databases.get,
    Databases.update,
    (db) => ({
      id: db.id,
      name: db.name,
      size: db.size,
      updated_at: db.updated_at,
    })
  );
});

// DELETE /api/v1/databases/:id
export const DELETE = withV1Auth("databases:delete", async (_req, auth, context) => {
  return v1DeleteResource(
    context,
    auth,
    'database',
    Databases.get,
    Databases.delete
  );
});
```

**Result:** 
- ✅ 80% less boilerplate
- ✅ Consistent error handling
- ✅ Standard response formats
- ✅ Type-safe throughout
- ✅ OpenAPI auto-documented

---

## Implementation Roadmap

### **Phase 1: Create New Utility Files** (1-2 hours)

1. Create `lib/api/v1-helpers.ts`
   - UUID extraction
   - Ownership verification
   - Standard CRUD patterns
   - Validation transformers

2. Create `lib/api/v1-errors.ts`
   - Centralized error code registry
   - Error helpers

3. Create `lib/api/v1-openapi.ts`
   - Response templates
   - CRUD response builder
   - Common patterns

### **Phase 2: Refactor Existing Routes** (2-3 hours)

1. Refactor `app/api/v1/apps/*`
   - Use new helpers
   - Remove duplication
   - Verify behavior unchanged

2. Update tests to match new structure

### **Phase 3: Document Patterns** (1 hour)

1. Create developer guide
2. Add code examples
3. Document conventions

### **Phase 4: Scale to New Resources** (Fast!)

With new utilities in place, adding new resources becomes:
- Define schemas (10 min)
- Register OpenAPI (5 min)
- Implement handler with helpers (15 min)
- Test (10 min)

**Total per resource: 40 minutes** (vs 2-3 hours before)

---

## Benefits Summary

### Before vs After

| Aspect | Before | After |
|--------|--------|-------|
| **Lines for CRUD endpoint** | ~180 lines | ~40 lines |
| **Error handling** | Manual, inconsistent | Automatic, standard |
| **OpenAPI registration** | 50+ lines per endpoint | 10 lines with templates |
| **Ownership checks** | Repeated 3x per resource | 1 helper call |
| **Validation errors** | Manual transformation | Automatic |
| **Time to add resource** | 2-3 hours | 40 minutes |
| **Bug surface area** | High (duplication) | Low (single implementation) |
| **Code review time** | 30 min | 10 min |

### Quality Improvements

1. **Consistency**
   - All endpoints follow same pattern
   - Error messages standardized
   - Response formats uniform

2. **Maintainability**
   - Fix once, fixes everywhere
   - Clear separation of concerns
   - Easy to understand

3. **Developer Experience**
   - Fast to implement
   - Hard to make mistakes
   - Self-documenting

4. **Type Safety**
   - Compiler catches errors
   - IntelliSense everywhere
   - Refactoring confidence

---

## File Structure

```
lib/
├── api/
│   ├── v1-middleware.ts       (✅ Exists - Auth, rate limit)
│   ├── v1-helpers.ts          (✨ NEW - CRUD patterns)
│   ├── v1-errors.ts           (✨ NEW - Error registry)
│   └── v1-openapi.ts          (✨ NEW - OpenAPI helpers)
│
├── openapi/
│   ├── init.ts                (✅ Exists - Zod extension)
│   ├── registry.ts            (✅ Exists - Main registry)
│   ├── schemas/               (✨ NEW - Organized by resource)
│   │   ├── common.ts
│   │   ├── apps.ts
│   │   ├── databases.ts
│   │   └── clusters.ts
│   └── resources/             (✨ NEW - Registration by resource)
│       ├── apps.ts
│       ├── databases.ts
│       └── clusters.ts
│
├── validation/                (✅ Exists - Zod schemas)
│   ├── platform-apps.ts
│   ├── databases.ts
│   └── kubernetes.ts
│
└── supabase/queries/          (✅ Exists - Data access)
    ├── platform_apps.ts
    ├── databases.ts
    └── clusters.ts

app/api/v1/
├── apps/
│   ├── route.ts               (GET /apps)
│   └── [id]/
│       └── route.ts           (GET/PATCH/DELETE /apps/:id)
├── databases/
│   ├── route.ts               (✨ NEW - GET, POST)
│   └── [id]/
│       └── route.ts           (✨ NEW - GET, PATCH, DELETE)
└── clusters/
    ├── route.ts               (✨ NEW)
    └── [id]/
        └── route.ts           (✨ NEW)
```

---

## Next Steps

1. **Review this architecture** with the team
2. **Create the new utility files** (Phase 1)
3. **Refactor one existing resource** as proof of concept
4. **Document the pattern** for team
5. **Scale to all resources** using new pattern

---

## Conclusion

This architecture provides:
- ✅ **Consistency** - Every API follows the same pattern
- ✅ **Speed** - 4x faster to implement new endpoints
- ✅ **Quality** - Less bugs, more type safety
- ✅ **Maintainability** - Single source of truth for patterns
- ✅ **Documentation** - OpenAPI auto-generated, always accurate
- ✅ **Developer Experience** - Clear conventions, less cognitive load

The system is designed to be **fast, error-free, and bug-free** by:
1. Eliminating duplication through shared utilities
2. Standardizing error handling and messages
3. Providing type-safe patterns
4. Auto-generating documentation from code
5. Making common patterns impossible to implement incorrectly

**Ready to implement? Let's build the utility files!**
