/**
 * OpenAPI Registry for API v1
 * Registers all public API endpoints and schemas
 */
import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { z } from '@/lib/openapi/init';

// Initialize the registry
export const registry = new OpenAPIRegistry();

// Register security scheme for Bearer token authentication
registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'API Key',
  description: 'API key authentication. Format: `Bearer sk_live_xxx` or `Bearer sk_test_xxx`',
});

// Common response schemas
export const ErrorResponseSchema = z.object({
  error: z.string().openapi({ 
    example: 'VALIDATION_ERROR',
    description: 'Error code identifier'
  }),
  message: z.string().openapi({ 
    example: 'Invalid request body',
    description: 'Human-readable error message'
  }),
  details: z.record(z.unknown()).optional().openapi({
    example: { field: 'name', issue: 'Must be at least 3 characters' },
    description: 'Additional error details'
  }),
}).openapi('ErrorResponse');

// Validation error response schema
export const ValidationErrorResponseSchema = z.object({
  error: z.string().openapi({ example: 'VALIDATION_ERROR' }),
  message: z.string().openapi({ example: 'Invalid request body' }),
  validation_errors: z.array(z.object({
    path: z.string().openapi({ example: 'name' }),
    message: z.string().openapi({ example: 'Must be at least 3 characters' }),
  })).openapi({ 
    example: [
      { path: 'name', message: 'Must be at least 3 characters' },
      { path: 'branch', message: 'Required field' }
    ]
  }),
}).openapi('ValidationErrorResponse');

export const PaginationMetaSchema = z.object({
  total: z.number().openapi({ example: 42 }),
  page: z.number().optional().openapi({ example: 1 }),
  per_page: z.number().optional().openapi({ example: 20 }),
}).openapi('PaginationMeta');

// App schema (used in responses)
export const AppSchema = z.object({
  id: z.string().uuid().openapi({ example: '8bdf284c-d3df-40f0-9565-b6e26f588c83' }),
  name: z.string().openapi({ example: 'my-awesome-app' }),
  slug: z.string().openapi({ example: 'my-awesome-app' }),
  framework: z.string().openapi({ example: 'Next.js' }),
  repository_name: z.string().openapi({ example: 'user/repo' }),
  repository_url: z.string().url().optional().openapi({ example: 'https://github.com/user/repo' }),
  branch: z.string().openapi({ example: 'main' }),
  status: z.enum(['pending', 'deploying', 'running', 'failed', 'stopped']).openapi({ example: 'running' }),
  deployment_url: z.string().url().optional().openapi({ example: 'https://my-awesome-app.example.com' }),
  port: z.number().optional().openapi({ example: 3000 }),
  ip: z.string().optional().openapi({ example: '192.168.1.1' }),
  size: z.string().optional().openapi({ example: 'small' }),
  auto_deploy: z.boolean().openapi({ example: true }),
  git_provider: z.enum(['github', 'gitlab', 'bitbucket']).openapi({ example: 'github' }),
  build_command: z.string().optional().openapi({ example: 'npm run build' }),
  output_directory: z.string().optional().openapi({ example: 'dist' }),
  created_at: z.string().datetime().openapi({ example: '2026-02-27T10:00:00Z' }),
  updated_at: z.string().datetime().openapi({ example: '2026-02-27T12:00:00Z' }),
}).openapi('App');

// Update app request schema
export const UpdateAppRequestSchema = z.object({
  name: z.string().min(3).max(40).optional().openapi({ 
    example: 'my-updated-app',
    description: 'App name (DNS-compatible, lowercase, 3-40 chars)'
  }),
  auto_deploy: z.boolean().optional().openapi({ 
    example: true,
    description: 'Enable automatic deployments on git push'
  }),
}).openapi('UpdateAppRequest');

// Success response wrappers
export const AppListResponseSchema = z.object({
  data: z.array(AppSchema),
  meta: PaginationMetaSchema,
}).openapi('AppListResponse');

export const AppResponseSchema = z.object({
  data: AppSchema,
}).openapi('AppResponse');

export const AppUpdateResponseSchema = z.object({
  data: z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    branch: z.string(),
    updated_at: z.string().datetime(),
  }),
}).openapi('AppUpdateResponse');

export const AppDeleteResponseSchema = z.object({
  data: z.object({
    id: z.string().uuid(),
    name: z.string(),
    deleted: z.boolean().openapi({ example: true }),
  }),
}).openapi('AppDeleteResponse');

// Object Storage schemas
export const BucketSchema = z.object({
  id: z.string().uuid().openapi({ example: '7c8f9a2b-4e3d-4c5a-9b8c-1a2b3c4d5e6f' }),
  name: z.string().openapi({ example: 'my-storage-bucket' }),
  region: z.string().openapi({ example: 'nyc3' }),
  acl: z.enum(['private', 'public-read']).openapi({ example: 'private' }),
  cors_enabled: z.boolean().openapi({ example: false }),
  versioning_enabled: z.boolean().openapi({ example: false }),
  project_id: z.string().uuid().nullable().openapi({ example: '9d7e8f3a-2b1c-4d5e-8f9a-3b4c5d6e7f8a' }),
  status: z.string().openapi({ example: 'active' }),
  created_at: z.string().datetime().openapi({ example: '2026-02-27T10:00:00Z' }),
  updated_at: z.string().datetime().openapi({ example: '2026-02-27T12:00:00Z' }),
}).openapi('Bucket');

export const BucketListResponseSchema = z.object({
  data: z.array(BucketSchema),
  meta: PaginationMetaSchema,
}).openapi('BucketListResponse');

export const BucketResponseSchema = z.object({
  data: BucketSchema,
}).openapi('BucketResponse');

export const BucketDeleteResponseSchema = z.object({
  data: z.object({
    id: z.string().uuid(),
    name: z.string(),
    deleted: z.boolean().openapi({ example: true }),
    deleted_at: z.string().datetime().openapi({ example: '2026-02-27T14:30:00Z' }),
  }),
}).openapi('BucketDeleteResponse');

// Spectrum App schema
export const SpectrumAppSchema = z.object({
  id: z.string().uuid().openapi({ example: '8bdf284c-d3df-40f0-9565-b6e26f588c83' }),
  dns_name: z.string().nullable().openapi({ example: 'api.example.com', description: 'DNS name for the Spectrum app' }),
  protocol: z.string().openapi({ example: 'tcp/443', description: 'Protocol and port (e.g., tcp/443, udp/27015)' }),
  origin_direct: z.array(z.string()).openapi({ example: ['203.0.113.1:443'], description: 'Origin servers' }),
  tls: z.enum(['off', 'full', 'strict', 'flexible']).openapi({ example: 'full', description: 'TLS mode' }),
  ip_firewall: z.boolean().openapi({ example: false, description: 'IP firewall enabled' }),
  traffic_type: z.string().openapi({ example: 'direct', description: 'Traffic type' }),
  proxy_protocol: z.string().openapi({ example: 'off', description: 'PROXY protocol mode' }),
  status: z.string().openapi({ example: 'created', description: 'App status' }),
  cloudflare_status: z.string().optional().openapi({ example: 'active', description: 'Cloudflare sync status' }),
  created_at: z.string().datetime().openapi({ example: '2026-02-27T10:00:00Z' }),
  updated_at: z.string().datetime().optional().openapi({ example: '2026-02-27T12:00:00Z' }),
}).openapi('SpectrumApp');

// Create Spectrum app request schema
export const CreateSpectrumAppRequestSchema = z.object({
  project_id: z.string().uuid().openapi({ example: '8bdf284c-d3df-40f0-9565-b6e26f588c83', description: 'Project UUID' }),
  dns: z.object({
    name: z.string().openapi({ example: 'api', description: 'DNS subdomain' }),
    type: z.enum(['A', 'CNAME']).openapi({ example: 'CNAME', description: 'DNS record type' }),
  }).openapi({ description: 'DNS configuration' }),
  protocol: z.string().openapi({ example: 'tcp/443', description: 'Protocol and port' }),
  origin_direct: z.array(z.string()).openapi({ example: ['203.0.113.1:443'], description: 'Origin servers' }),
  tls: z.enum(['off', 'full']).optional().openapi({ example: 'full', description: 'TLS mode' }),
  edge_ips: z.object({
    type: z.string().optional().openapi({ example: 'dynamic' }),
    connectivity: z.string().optional().openapi({ example: 'all' }),
  }).optional().openapi({ description: 'Edge IPs configuration' }),
  ip_firewall: z.boolean().optional().openapi({ example: false }),
  traffic_type: z.string().optional().openapi({ example: 'direct' }),
  proxy_protocol: z.string().optional().openapi({ example: 'off' }),
}).openapi('CreateSpectrumAppRequest');

// Update Spectrum app request schema
export const UpdateSpectrumAppRequestSchema = z.object({
  dns: z.object({
    name: z.string(),
    type: z.enum(['A', 'CNAME']),
  }).optional().openapi({ description: 'DNS configuration' }),
  protocol: z.string().optional().openapi({ example: 'tcp/443', description: 'Protocol and port' }),
  origin_direct: z.array(z.string()).optional().openapi({ example: ['203.0.113.1:443'] }),
  tls: z.enum(['off', 'full', 'strict', 'flexible']).optional().openapi({ example: 'full', description: 'TLS mode' }),
  edge_ips: z.object({
    type: z.string().optional(),
    connectivity: z.string().optional(),
  }).optional().openapi({ description: 'Edge IPs configuration' }),
  ip_firewall: z.boolean().optional(),
  traffic_type: z.string().optional(),
  proxy_protocol: z.string().optional(),
  argo_smart_routing: z.boolean().optional().openapi({ description: 'Enable Argo Smart Routing' }),
}).openapi('UpdateSpectrumAppRequest');

// Spectrum response wrappers
export const SpectrumAppResponseSchema = z.object({
  data: SpectrumAppSchema,
}).openapi('SpectrumAppResponse');

export const SpectrumAppListResponseSchema = z.object({
  data: z.array(SpectrumAppSchema),
  meta: PaginationMetaSchema,
}).openapi('SpectrumAppListResponse');

export const SpectrumAppDeleteResponseSchema = z.object({
  data: z.object({
    id: z.string().uuid(),
    message: z.string().openapi({ example: 'Spectrum app deleted successfully' }),
  }),
}).openapi('SpectrumAppDeleteResponse');

// Register endpoints

// GET /api/v1/apps - List all apps
registry.registerPath({
  method: 'get',
  path: '/api/v1/apps',
  tags: ['Platform Apps'],
  summary: 'List all apps',
  description: 'Returns a list of all apps owned by the authenticated user.',
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'List of apps',
      content: {
        'application/json': {
          schema: AppListResponseSchema,
        },
      },
    },
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
    429: {
      description: 'Too many requests - rate limit exceeded',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            error: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please try again later.',
            details: { retry_after: 58 }
          }
        },
      },
    },
  },
});

// GET /api/v1/apps/{id} - Get app by ID
registry.registerPath({
  method: 'get',
  path: '/api/v1/apps/{id}',
  tags: ['Platform Apps'],
  summary: 'Get app by ID',
  description: 'Returns detailed information about a specific app.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ 
        example: '8bdf284c-d3df-40f0-9565-b6e26f588c83',
        description: 'App UUID'
      }),
    }),
  },
  responses: {
    200: {
      description: 'App details',
      content: {
        'application/json': {
          schema: AppResponseSchema,
        },
      },
    },
    400: {
      description: 'Bad request - invalid app ID format',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            error: 'INVALID_ID',
            message: 'Invalid app ID format',
            details: { field: 'id' }
          }
        },
      },
    },
    401: {
      description: 'Unauthorized',
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
      description: 'Forbidden - not the app owner',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            error: 'FORBIDDEN',
            message: 'You do not have permission to access this app'
          }
        },
      },
    },
    404: {
      description: 'App not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            error: 'NOT_FOUND',
            message: 'App not found'
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
            message: 'Too many requests. Please try again later.',
            details: { retry_after: 58 }
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
  },
});

// PATCH /api/v1/apps/{id} - Update app metadata
registry.registerPath({
  method: 'patch',
  path: '/api/v1/apps/{id}',
  tags: ['Platform Apps'],
  summary: 'Update app metadata',
  description: 'Updates safe metadata fields only (name, auto_deploy). **Build configuration changes (branch, framework, build command) are NOT allowed** - use the redeploy endpoint to change build settings and trigger a new deployment.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ 
        example: '8bdf284c-d3df-40f0-9565-b6e26f588c83',
        description: 'App UUID'
      }),
    }),
    body: {
      description: 'App metadata to update',
      content: {
        'application/json': {
          schema: UpdateAppRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'App updated successfully',
      content: {
        'application/json': {
          schema: AppUpdateResponseSchema,
        },
      },
    },
    400: {
      description: 'Bad request - validation error or invalid app ID',
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
    401: {
      description: 'Unauthorized',
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
      description: 'Forbidden - not the app owner',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            error: 'FORBIDDEN',
            message: 'You do not have permission to modify this app'
          }
        },
      },
    },
    404: {
      description: 'App not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            error: 'NOT_FOUND',
            message: 'App not found'
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
            message: 'Too many requests. Please try again later.',
            details: { retry_after: 58 }
          }
        },
      },
    },
    500: {
      description: 'Internal server error - update failed',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            error: 'UPDATE_FAILED',
            message: 'Failed to update app',
            details: { details: 'Database update failed' }
          }
        },
      },
    },
  },
});

// DELETE /api/v1/apps/{id} - Delete app
registry.registerPath({
  method: 'delete',
  path: '/api/v1/apps/{id}',
  tags: ['Platform Apps'],
  summary: 'Delete app',
  description: '**DESTRUCTIVE OPERATION:** Permanently deletes the app and all associated infrastructure (Jenkins job, Kubernetes resources, DNS records). This action cannot be undone.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ 
        example: '8bdf284c-d3df-40f0-9565-b6e26f588c83',
        description: 'App UUID'
      }),
    }),
  },
  responses: {
    200: {
      description: 'App deleted successfully',
      content: {
        'application/json': {
          schema: AppDeleteResponseSchema,
        },
      },
    },
    400: {
      description: 'Bad request - invalid app ID format',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            error: 'INVALID_ID',
            message: 'Invalid app ID format',
            details: { field: 'id' }
          }
        },
      },
    },
    401: {
      description: 'Unauthorized',
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
      description: 'Forbidden - not the app owner',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            error: 'FORBIDDEN',
            message: 'You do not have permission to delete this app'
          }
        },
      },
    },
    404: {
      description: 'App not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            error: 'NOT_FOUND',
            message: 'App not found'
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
            message: 'Too many requests. Please try again later.',
            details: { retry_after: 58 }
          }
        },
      },
    },
    500: {
      description: 'Internal server error - deletion failed',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            error: 'DELETE_FAILED',
            message: 'Failed to delete app. Infrastructure cleanup may be incomplete.',
            details: { details: 'Kubernetes deletion timeout' }
          }
        },
      },
    },
  },
});

// Object Storage Endpoints

// GET /api/v1/storage/buckets - List all buckets
registry.registerPath({
  method: 'get',
  path: '/api/v1/storage/buckets',
  tags: ['Object Storage'],
  summary: 'List all buckets',
  description: 'Returns a list of all object storage buckets owned by the authenticated user.',
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'List of buckets',
      content: {
        'application/json': {
          schema: BucketListResponseSchema,
        },
      },
    },
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
    429: {
      description: 'Too many requests - rate limit exceeded',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            error: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please try again later.',
            details: { retry_after: 58 }
          }
        },
      },
    },
  },
});

// GET /api/v1/storage/buckets/{id} - Get bucket by ID
registry.registerPath({
  method: 'get',
  path: '/api/v1/storage/buckets/{id}',
  tags: ['Object Storage'],
  summary: 'Get bucket by ID',
  description: 'Returns detailed information about a specific object storage bucket.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ 
        example: '7c8f9a2b-4e3d-4c5a-9b8c-1a2b3c4d5e6f',
        description: 'Bucket UUID'
      }),
    }),
  },
  responses: {
    200: {
      description: 'Bucket details',
      content: {
        'application/json': {
          schema: BucketResponseSchema,
        },
      },
    },
    400: {
      description: 'Bad request - invalid bucket ID format',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            error: 'INVALID_ID',
            message: 'Invalid bucket ID format',
            details: { field: 'id' }
          }
        },
      },
    },
    401: {
      description: 'Unauthorized',
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
      description: 'Forbidden - not the bucket owner',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            error: 'FORBIDDEN',
            message: 'You do not have permission to access this bucket'
          }
        },
      },
    },
    404: {
      description: 'Bucket not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            error: 'NOT_FOUND',
            message: 'Bucket not found'
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
            message: 'Too many requests. Please try again later.',
            details: { retry_after: 58 }
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
  },
});

// DELETE /api/v1/storage/buckets/{id} - Delete bucket
registry.registerPath({
  method: 'delete',
  path: '/api/v1/storage/buckets/{id}',
  tags: ['Object Storage'],
  summary: 'Delete bucket',
  description: '**DESTRUCTIVE OPERATION:** Permanently deletes the bucket and all stored objects. Closes any active billing cycles with prorated refunds. This action cannot be undone.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ 
        example: '7c8f9a2b-4e3d-4c5a-9b8c-1a2b3c4d5e6f',
        description: 'Bucket UUID'
      }),
    }),
  },
  responses: {
    200: {
      description: 'Bucket deleted successfully',
      content: {
        'application/json': {
          schema: BucketDeleteResponseSchema,
        },
      },
    },
    400: {
      description: 'Bad request - invalid bucket ID format',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            error: 'INVALID_ID',
            message: 'Invalid bucket ID format',
            details: { field: 'id' }
          }
        },
      },
    },
    401: {
      description: 'Unauthorized',
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
      description: 'Forbidden - not the bucket owner',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            error: 'FORBIDDEN',
            message: 'You do not have permission to delete this bucket'
          }
        },
      },
    },
    404: {
      description: 'Bucket not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            error: 'NOT_FOUND',
            message: 'Bucket not found'
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
            message: 'Too many requests. Please try again later.',
            details: { retry_after: 58 }
          }
        },
      },
    },
    500: {
      description: 'Internal server error - deletion failed',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            error: 'DELETE_FAILED',
            message: 'Failed to delete bucket. Infrastructure cleanup may be incomplete.',
            details: { details: 'S3 deletion timeout' }
          }
        },
      },
    },
  },
});

// GET /api/v1/network/spectrum - List Spectrum apps
registry.registerPath({
  method: 'get',
  path: '/api/v1/network/spectrum',
  tags: ['Network DDoS (Spectrum)'],
  summary: 'List Spectrum apps',
  description: 'Returns a list of all Spectrum DDoS protection apps owned by the authenticated user.',
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'List of Spectrum apps',
      content: {
        'application/json': {
          schema: SpectrumAppListResponseSchema,
        },
      },
    },
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
    429: {
      description: 'Too many requests - rate limit exceeded',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            error: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please try again later.',
            details: { retry_after: 58 }
          }
        },
      },
    },
  },
});

// POST /api/v1/network/spectrum - Create Spectrum app
registry.registerPath({
  method: 'post',
  path: '/api/v1/network/spectrum',
  tags: ['Network DDoS (Spectrum)'],
  summary: 'Create Spectrum app',
  description: 'Creates a new Spectrum DDoS protection app. Requires sufficient credits in account.',
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      description: 'Spectrum app configuration',
      content: {
        'application/json': {
          schema: CreateSpectrumAppRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Spectrum app created successfully',
      content: {
        'application/json': {
          schema: SpectrumAppResponseSchema,
        },
      },
    },
    400: {
      description: 'Bad request - validation error',
      content: {
        'application/json': {
          schema: ValidationErrorResponseSchema,
          example: {
            error: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            validation_errors: [
              { path: 'protocol', message: 'Protocol must be tcp|udp with a port' }
            ]
          }
        },
      },
    },
    401: {
      description: 'Unauthorized',
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
    402: {
      description: 'Insufficient credits',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            error: 'INSUFFICIENT_CREDITS',
            message: 'Insufficient credits',
            details: { balance: 5.0, required: 10.0 }
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
            message: 'Too many requests. Please try again later.',
            details: { retry_after: 58 }
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
            message: 'Failed to create spectrum app'
          }
        },
      },
    },
  },
});

// GET /api/v1/network/spectrum/{id} - Get Spectrum app by ID
registry.registerPath({
  method: 'get',
  path: '/api/v1/network/spectrum/{id}',
  tags: ['Network DDoS (Spectrum)'],
  summary: 'Get Spectrum app by ID',
  description: 'Returns detailed information about a specific Spectrum app.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ 
        example: '8bdf284c-d3df-40f0-9565-b6e26f588c83',
        description: 'Spectrum app UUID'
      }),
    }),
  },
  responses: {
    200: {
      description: 'Spectrum app details',
      content: {
        'application/json': {
          schema: SpectrumAppResponseSchema,
        },
      },
    },
    400: {
      description: 'Bad request - invalid app ID format',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            error: 'INVALID_ID',
            message: 'Invalid app ID format',
            details: { field: 'id' }
          }
        },
      },
    },
    401: {
      description: 'Unauthorized',
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
      description: 'Forbidden - not the app owner',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            error: 'FORBIDDEN',
            message: 'Access denied'
          }
        },
      },
    },
    404: {
      description: 'Spectrum app not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            error: 'NOT_FOUND',
            message: 'Spectrum app not found'
          }
        },
      },
    },
    429: {
      description: 'Too many requests',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            error: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please try again later.',
            details: { retry_after: 58 }
          }
        },
      },
    },
    500: {
      description: 'Internal server error - returned on Cloudflare API errors or database failures',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            error: 'INTERNAL_ERROR',
            message: 'Failed to fetch spectrum app'
          }
        },
      },
    },
  },
});

// PATCH /api/v1/network/spectrum/{id} - Update Spectrum app
registry.registerPath({
  method: 'patch',
  path: '/api/v1/network/spectrum/{id}',
  tags: ['Network DDoS (Spectrum)'],
  summary: 'Update Spectrum app',
  description: 'Partial update of Spectrum app configuration. Only submitted fields are updated.',  
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ 
        example: '8bdf284c-d3df-40f0-9565-b6e26f588c83',
        description: 'Spectrum app UUID'
      }),
    }),
    body: {
      description: 'Spectrum app configuration to update',
      content: {
        'application/json': {
          schema: UpdateSpectrumAppRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Spectrum app updated successfully',
      content: {
        'application/json': {
          schema: SpectrumAppResponseSchema,
        },
      },
    },
    400: {
      description: 'Bad request - validation error or invalid app ID format',
      content: {
        'application/json': {
          schema: z.union([ValidationErrorResponseSchema, ErrorResponseSchema]),
          examples: {
            validation: {
              error: 'VALIDATION_ERROR',
              message: 'Invalid request body',
              validation_errors: [
                { path: 'protocol', message: 'Protocol must be tcp|udp with a port' }
              ]
            },
            invalid_id: {
              error: 'INVALID_ID',
              message: 'Invalid app ID format',
              details: { field: 'id' }
            }
          }
        },
      },
    },
    401: {
      description: 'Unauthorized',
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
      description: 'Forbidden - not the app owner',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            error: 'FORBIDDEN',
            message: 'Access denied'
          }
        },
      },
    },
    404: {
      description: 'Spectrum app not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            error: 'NOT_FOUND',
            message: 'Spectrum app not found'
          }
        },
      },
    },
    429: {
      description: 'Too many requests',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            error: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please try again later.',
            details: { retry_after: 58 }
          }
        },
      },
    },
    500: {
      description: 'Internal server error - returned on Cloudflare API errors or database failures',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            error: 'INTERNAL_ERROR',
            message: 'Failed to update spectrum app'
          }
        },
      },
    },
  },
});

// DELETE /api/v1/network/spectrum/{id} - Delete Spectrum app
registry.registerPath({
  method: 'delete',
  path: '/api/v1/network/spectrum/{id}',
  tags: ['Network DDoS (Spectrum)'],
  summary: 'Delete Spectrum app',
  description: '**DESTRUCTIVE OPERATION:** Permanently deletes the Spectrum app, removes Cloudflare configuration, and stops DDoS protection. This action cannot be undone.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ 
        example: '8bdf284c-d3df-40f0-9565-b6e26f588c83',
        description: 'Spectrum app UUID'
      }),
    }),
  },
  responses: {
    200: {
      description: 'Spectrum app deleted successfully',
      content: {
        'application/json': {
          schema: SpectrumAppDeleteResponseSchema,
        },
      },
    },
    400: {
      description: 'Bad request - invalid app ID format',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            error: 'INVALID_ID',
            message: 'Invalid app ID format',
            details: { field: 'id' }
          }
        },
      },
    },
    401: {
      description: 'Unauthorized',
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
      description: 'Forbidden - not the app owner',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            error: 'FORBIDDEN',
            message: 'Access denied'
          }
        },
      },
    },
    404: {
      description: 'Spectrum app not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            error: 'NOT_FOUND',
            message: 'Spectrum app not found'
          }
        },
      },
    },
    429: {
      description: 'Too many requests',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            error: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please try again later.',
            details: { retry_after: 58 }
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
            message: 'Failed to delete spectrum app'
          }
        },
      },
    },
  },
});

/**
 * Generate the complete OpenAPI document
 */
export function generateOpenAPIDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'Cloud Services - API v1',
      version: '1.0.0',
      description: `
# Cloud Services REST API

A comprehensive REST API for managing cloud infrastructure, including platform apps, databases, Kubernetes clusters, and object storage.

## Authentication

All API requests require authentication using an API key. Include your API key in the \`Authorization\` header:

\`\`\`
Authorization: Bearer sk_live_YOUR_API_KEY
\`\`\`

You can generate API keys from your [dashboard settings](https://galaxyhvh.com/dashboard/settings/api-keys).

## Rate Limits

- **Free Plan:** 30 requests per minute per operation
- **Paid Plans:** Higher limits available

Rate limit headers are included in all responses:
- \`X-RateLimit-Limit\`: Maximum requests per window
- \`X-RateLimit-Remaining\`: Remaining requests in current window
- \`Retry-After\`: Seconds until rate limit resets (on 429 responses)

## Errors

The API uses standard HTTP status codes:

- \`200\`: Success
- \`400\`: Bad Request (validation error)
- \`401\`: Unauthorized (missing or invalid API key)
- \`403\`: Forbidden (insufficient permissions)
- \`404\`: Not Found
- \`429\`: Too Many Requests (rate limit exceeded)
- \`500\`: Internal Server Error

Error responses include details:

\`\`\`json
{
  "error": "Validation failed",
  "message": "Invalid request body",
  "details": {
    "field": "name",
    "issue": "Must be at least 3 characters"
  }
}
\`\`\`

## Getting Started

1. [Generate an API key](https://galaxyhvh.com/dashboard/settings/api-keys)
2. Make your first request:

\`\`\`bash
curl -H "Authorization: Bearer sk_live_xxx" \\
  https://galaxyhvh.com/api/v1/apps
\`\`\`

For more examples, see the API reference below.
      `.trim(),
      contact: {
        name: 'Cloud Services Support',
        email: 'support@galaxyhvh.com',
        url: 'https://galaxyhvh.com/support',
      },
      license: {
        name: 'Proprietary',
        url: 'https://galaxyhvh.com/terms',
      },
    },
    servers: [
      { 
        url: 'http://localhost:3000',
        description: 'Development server',
      },
      { 
        url: 'https://galaxyhvh.com',
        description: 'Production server',
      },
    ],
    tags: [
      {
        name: 'Platform Apps',
        description: 'Manage application deployments, containers, and infrastructure.',
      },
      {
        name: 'Object Storage',
        description: 'Manage S3-compatible object storage buckets for file storage and CDN.',
      },
      {
        name: 'Network DDoS (Spectrum)',
        description: 'Configure Cloudflare Spectrum for DDoS protection on Layer 4 protocols (TCP/UDP).',
      },
    ],
  });
}
