import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from '@/lib/openapi/init';

import {
  AppDeleteResponseSchema,
  AppListResponseSchema,
  AppResponseSchema,
  AppUpdateResponseSchema,
  UpdateAppRequestSchema,
  DeploymentListResponseSchema,
  RedeployResponseSchema,
} from '@/lib/openapi/schemas/apps';
import {
  EnvVarDeleteResponseSchema,
  EnvVarGetResponseSchema,
  EnvVarsListResponseSchema,
  EnvVarsReplaceRequestSchema,
  EnvVarsReplaceResponseSchema,
} from '@/lib/openapi/schemas/env-vars';
import { ErrorResponseSchema, ValidationErrorResponseSchema } from '@/lib/openapi/schemas/common';

export function registerAppPaths(registry: OpenAPIRegistry) {
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
    500: {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: {
            error: 'INTERNAL_ERROR',
            message: 'Failed to fetch apps'
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
          schema: z.union([ValidationErrorResponseSchema, ErrorResponseSchema]),
          examples: {
            validation: {
              error: 'VALIDATION_ERROR',
              message: 'Invalid request body',
              validation_errors: [
                { path: 'name', message: 'Must be at least 3 characters' }
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

// ── Environment Variables ────────────────────────────────────

// GET /api/v1/apps/{id}/env-vars - List env vars
registry.registerPath({
  method: 'get',
  path: '/api/v1/apps/{id}/env-vars',
  tags: ['Platform Apps'],
  summary: 'List environment variables',
  description: 'Returns all environment variables for the specified app.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ example: '8bdf284c-d3df-40f0-9565-b6e26f588c83', description: 'App UUID' }),
    }),
  },
  responses: {
    200: {
      description: 'Environment variables list',
      content: { 'application/json': { schema: EnvVarsListResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'UNAUTHORIZED', message: 'Missing or invalid API key' } } },
    },
    403: {
      description: 'Forbidden - not the app owner',
      content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'FORBIDDEN', message: 'You do not have permission to modify this app' } } },
    },
    404: {
      description: 'App not found',
      content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'NOT_FOUND', message: 'App not found' } } },
    },
    429: {
      description: 'Too many requests',
      content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.', details: { retry_after: 58 } } } },
    },
    500: {
      description: 'Internal server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// PUT /api/v1/apps/{id}/env-vars - Replace all env vars
registry.registerPath({
  method: 'put',
  path: '/api/v1/apps/{id}/env-vars',
  tags: ['Platform Apps'],
  summary: 'Replace environment variables',
  description: 'Replaces all environment variables for the app. If the app is running, changes are applied live via Kubernetes secret update and optional pod restart.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ example: '8bdf284c-d3df-40f0-9565-b6e26f588c83', description: 'App UUID' }),
    }),
    body: {
      description: 'Full set of environment variables',
      content: { 'application/json': { schema: EnvVarsReplaceRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Environment variables replaced',
      content: { 'application/json': { schema: EnvVarsReplaceResponseSchema } },
    },
    400: {
      description: 'Validation error',
      content: { 'application/json': { schema: ValidationErrorResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'UNAUTHORIZED', message: 'Missing or invalid API key' } } },
    },
    403: {
      description: 'Forbidden',
      content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'FORBIDDEN', message: 'You do not have permission to modify this app' } } },
    },
    404: {
      description: 'App not found',
      content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'NOT_FOUND', message: 'App not found' } } },
    },
    429: {
      description: 'Too many requests',
      content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.', details: { retry_after: 58 } } } },
    },
    500: {
      description: 'Failed to update environment variables',
      content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'UPDATE_FAILED', message: 'Failed to update environment variables' } } },
    },
  },
});

// DELETE /api/v1/apps/{id}/env-vars/{key} - Delete single env var
registry.registerPath({
  method: 'delete',
  path: '/api/v1/apps/{id}/env-vars/{key}',
  tags: ['Platform Apps'],
  summary: 'Delete environment variable',
  description: 'Deletes a single environment variable by key. If the app is running, changes are applied live.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ example: '8bdf284c-d3df-40f0-9565-b6e26f588c83', description: 'App UUID' }),
      key: z.string().openapi({ example: 'OLD_SECRET', description: 'Environment variable key to delete' }),
    }),
  },
  responses: {
    200: {
      description: 'Environment variable deleted',
      content: { 'application/json': { schema: EnvVarDeleteResponseSchema } },
    },
    400: {
      description: 'Invalid key format',
      content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'INVALID_KEY', message: 'Invalid environment variable key format', details: { field: 'key' } } } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'UNAUTHORIZED', message: 'Missing or invalid API key' } } },
    },
    403: {
      description: 'Forbidden',
      content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'FORBIDDEN', message: 'You do not have permission to modify this app' } } },
    },
    404: {
      description: 'App or env var key not found',
      content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'NOT_FOUND', message: 'Environment variable key not found' } } },
    },
    429: {
      description: 'Too many requests',
      content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.', details: { retry_after: 58 } } } },
    },
    500: {
      description: 'Failed to delete environment variable',
      content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'DELETE_FAILED', message: 'Failed to delete environment variable' } } },
    },
  },
});

// GET /api/v1/apps/{id}/env-vars/{key} - Get a single env var by key
registry.registerPath({
  method: 'get',
  path: '/api/v1/apps/{id}/env-vars/{key}',
  tags: ['Platform Apps'],
  summary: 'Get environment variable by key',
  description: 'Returns the value of a single environment variable. The full plaintext value is returned — use with care.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ example: '8bdf284c-d3df-40f0-9565-b6e26f588c83', description: 'App UUID' }),
      key: z.string().openapi({ example: 'DATABASE_URL', description: 'Environment variable key' }),
    }),
  },
  responses: {
    200: {
      description: 'Environment variable value',
      content: { 'application/json': { schema: EnvVarGetResponseSchema } },
    },
    400: {
      description: 'Invalid key format',
      content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'INVALID_KEY', message: 'Invalid environment variable key format', details: { field: 'key' } } } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'UNAUTHORIZED', message: 'Missing or invalid API key' } } },
    },
    403: {
      description: 'Forbidden',
      content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'FORBIDDEN', message: 'You do not have permission to access this app' } } },
    },
    404: {
      description: 'App or key not found',
      content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'NOT_FOUND', message: 'Environment variable key not found' } } },
    },
    429: {
      description: 'Too many requests',
      content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.', details: { retry_after: 58 } } } },
    },
    500: {
      description: 'Internal server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// GET /api/v1/apps/{id}/deployments - Deployment history
registry.registerPath({
  method: 'get',
  path: '/api/v1/apps/{id}/deployments',
  tags: ['Platform Apps'],
  summary: 'List deployment history',
  description: 'Returns up to 10 recent deployments for an app, merging Jenkins build data with DB records. Includes releases, operations (resize), and rollbacks.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ example: '8bdf284c-d3df-40f0-9565-b6e26f588c83', description: 'App UUID' }),
    }),
  },
  responses: {
    200: {
      description: 'Deployment history',
      content: { 'application/json': { schema: DeploymentListResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'UNAUTHORIZED', message: 'Missing or invalid API key' } } },
    },
    403: {
      description: 'Forbidden',
      content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'FORBIDDEN', message: 'Access denied' } } },
    },
    404: {
      description: 'App not found',
      content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'NOT_FOUND', message: 'App not found' } } },
    },
    429: {
      description: 'Too many requests',
      content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.', details: { retry_after: 58 } } } },
    },
    500: {
      description: 'Internal server error',
      content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'INTERNAL_ERROR', message: 'Failed to fetch deployments' } } },
    },
  },
});

// POST /api/v1/apps/{id}/redeploy - Trigger a new deployment
registry.registerPath({
  method: 'post',
  path: '/api/v1/apps/{id}/redeploy',
  tags: ['Platform Apps'],
  summary: 'Trigger redeploy',
  description: 'Triggers a new deployment for the app using the current git branch and configuration. Rebuilds the container and rolls out via Kubernetes. Returns 202 if a build is already in progress.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ example: '8bdf284c-d3df-40f0-9565-b6e26f588c83', description: 'App UUID' }),
    }),
  },
  responses: {
    200: {
      description: 'Redeploy triggered successfully',
      content: { 'application/json': { schema: RedeployResponseSchema } },
    },
    202: {
      description: 'Accepted — a build is already in progress; the existing operation was reused',
      content: {
        'application/json': {
          schema: RedeployResponseSchema,
          example: {
            data: {
              app_id: '8bdf284c-d3df-40f0-9565-b6e26f588c83',
              app_name: 'my-awesome-app',
              status: 'pending',
              operation_id: 'a1cd4c8d-e891-48ba-8655-5c3d04a59501',
              reused: true,
              message: 'Redeploy already running',
            },
          },
        },
      },
    },
    403: {
      description: 'Forbidden — not the app owner, or git provider token missing',
      content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'GIT_TOKEN_MISSING', message: 'Your github account is not connected or the access token has expired.' } } },
    },
    404: {
      description: 'App not found',
      content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'NOT_FOUND', message: 'App not found' } } },
    },
    409: {
      description: 'Conflict — operation lock held or terminal build state',
      content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'CONFLICT', message: 'Another operation is already in progress for this app' } } },
    },
    422: {
      description: 'Unprocessable — repository URL not configured',
      content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'CONFIGURATION_ERROR', message: 'Repository URL not configured for this app' } } },
    },
    429: {
      description: 'Too many requests',
      content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.', details: { retry_after: 58 } } } },
    },
    500: {
      description: 'Internal server error',
      content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'INTERNAL_ERROR', message: 'Failed to trigger redeploy' } } },
    },
  },
});

}
