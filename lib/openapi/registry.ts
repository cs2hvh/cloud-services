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
  error: z.string().openapi({ example: 'Validation failed' }),
  message: z.string().optional().openapi({ example: 'Invalid request body' }),
  details: z.record(z.unknown()).optional(),
}).openapi('ErrorResponse');

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
  branch: z.string().optional().openapi({ 
    example: 'main',
    description: 'Git branch to deploy from'
  }),
  description: z.string().optional().openapi({ 
    example: 'My production application',
    description: 'App description'
  }),
  framework: z.string().optional().openapi({ 
    example: 'Next.js',
    description: 'Framework type'
  }),
  auto_deploy: z.boolean().optional().openapi({ 
    example: true,
    description: 'Enable automatic deployments on git push'
  }),
  build_command: z.string().optional().openapi({ 
    example: 'npm run build',
    description: 'Custom build command'
  }),
  output_directory: z.string().optional().openapi({ 
    example: 'dist',
    description: 'Build output directory'
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
        },
      },
    },
    429: {
      description: 'Too many requests - rate limit exceeded',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
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
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    403: {
      description: 'Forbidden - not the app owner',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: 'App not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
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
  description: 'Updates app metadata. **Note:** This does NOT trigger a redeployment. Only metadata is updated.',
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
      description: 'Validation error - invalid request body',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    403: {
      description: 'Forbidden - not the app owner',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: 'App not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
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
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    403: {
      description: 'Forbidden - not the app owner',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: 'App not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: 'Internal server error - deletion failed',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
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
    ],
  });
}
