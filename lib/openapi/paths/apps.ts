import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from '@/lib/openapi/init';

import {
  AppDeleteResponseSchema,
  AppListResponseSchema,
  AppResponseSchema,
  AppUpdateResponseSchema,
  UpdateAppRequestSchema,
} from '@/lib/openapi/schemas/apps';
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

}
