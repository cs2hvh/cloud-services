import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from '@/lib/openapi/init';

import { ErrorResponseSchema, ValidationErrorResponseSchema } from '@/lib/openapi/schemas/common';
import {
  CreateKubernetesClusterRequestSchema,
  KubernetesClusterDeleteResponseSchema,
  KubernetesClusterListResponseSchema,
  KubernetesClusterResponseSchema,
  UpdateKubernetesClusterRequestSchema,
} from '@/lib/openapi/schemas/kubernetes';

export function registerKubernetesPaths(registry: OpenAPIRegistry) {

// GET /api/v1/kubernetes — List all Kubernetes clusters
registry.registerPath({
  method: 'get',
  path: '/api/v1/kubernetes',
  tags: ['Kubernetes'],
  summary: 'List Kubernetes clusters',
  description: 'Returns all Kubernetes clusters owned by the authenticated user.',
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'List of Kubernetes clusters',
      content: {
        'application/json': {
          schema: KubernetesClusterListResponseSchema,
        },
      },
    },
    401: {
      description: 'Unauthorized - missing or invalid API key',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'UNAUTHORIZED', message: 'Missing or invalid API key' },
        },
      },
    },
    429: {
      description: 'Too many requests - rate limit exceeded',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.', details: { retry_after: 58 } },
        },
      },
    },
    500: {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'INTERNAL_ERROR', message: 'Failed to fetch Kubernetes clusters' },
        },
      },
    },
  },
});

// POST /api/v1/kubernetes — Create a Kubernetes cluster
registry.registerPath({
  method: 'post',
  path: '/api/v1/kubernetes',
  tags: ['Kubernetes'],
  summary: 'Create Kubernetes cluster',
  description: 'Creates a new Kubernetes cluster. Requires sufficient credits in account.',
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      description: 'Kubernetes cluster configuration',
      content: {
        'application/json': {
          schema: CreateKubernetesClusterRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Kubernetes cluster created with status `creating`. Poll GET /api/v1/kubernetes/{id} to track provisioning progress.',
      content: {
        'application/json': {
          schema: KubernetesClusterResponseSchema,
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
            validation_errors: [{ path: 'name', message: 'Cluster name must be at least 3 characters' }],
          },
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'UNAUTHORIZED', message: 'Missing or invalid API key' },
        },
      },
    },
    402: {
      description: 'Insufficient credits',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'INSUFFICIENT_BALANCE', message: 'Insufficient credits' },
        },
      },
    },
    403: {
      description: 'Forbidden - no permission on the target project',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'FORBIDDEN', message: 'You do not have permission to access this project' },
        },
      },
    },
    404: {
      description: 'Project not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'NOT_FOUND', message: 'Project not found' },
        },
      },
    },
    429: {
      description: 'Too many requests',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.', details: { retry_after: 58 } },
        },
      },
    },
    500: {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'CREATE_FAILED', message: 'Failed to create Kubernetes cluster' },
        },
      },
    },
  },
});

// GET /api/v1/kubernetes/{id} — Get cluster by ID
registry.registerPath({
  method: 'get',
  path: '/api/v1/kubernetes/{id}',
  tags: ['Kubernetes'],
  summary: 'Get Kubernetes cluster by ID',
  description: 'Returns detailed information about a specific Kubernetes cluster.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({
        example: '23549dc5-53ee-4ff2-904d-a59250065545',
        description: 'Kubernetes cluster ID',
      }),
    }),
  },
  responses: {
    200: {
      description: 'Kubernetes cluster details',
      content: {
        'application/json': {
          schema: KubernetesClusterResponseSchema,
        },
      },
    },
    400: {
      description: 'Bad request - invalid cluster ID format',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'INVALID_ID', message: 'Invalid id format', details: { field: 'id' } },
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'UNAUTHORIZED', message: 'Missing or invalid API key' },
        },
      },
    },
    403: {
      description: 'Forbidden',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'FORBIDDEN', message: 'You do not have permission to access this cluster' },
        },
      },
    },
    404: {
      description: 'Cluster not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'NOT_FOUND', message: 'Cluster not found' },
        },
      },
    },
    429: {
      description: 'Too many requests',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.', details: { retry_after: 58 } },
        },
      },
    },
    500: {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'INTERNAL_ERROR', message: 'Failed to fetch Kubernetes cluster' },
        },
      },
    },
  },
});

// PATCH /api/v1/kubernetes/{id} — Update cluster
registry.registerPath({
  method: 'patch',
  path: '/api/v1/kubernetes/{id}',
  tags: ['Kubernetes'],
  summary: 'Update Kubernetes cluster',
  description: 'Updates an existing Kubernetes cluster configuration.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({
        example: '23549dc5-53ee-4ff2-904d-a59250065545',
        description: 'Kubernetes cluster ID',
      }),
    }),
    body: {
      description: 'Cluster update payload',
      content: {
        'application/json': {
          schema: UpdateKubernetesClusterRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Kubernetes cluster updated',
      content: {
        'application/json': {
          schema: KubernetesClusterResponseSchema,
        },
      },
    },
    400: {
      description: 'Bad request - validation error or invalid cluster ID',
      content: {
        'application/json': {
          schema: z.union([ValidationErrorResponseSchema, ErrorResponseSchema]),
          examples: {
            validation: {
              summary: 'Body validation error',
              value: {
                error: 'VALIDATION_ERROR',
                message: 'Invalid request body',
                validation_errors: [{ path: 'node_pool.count', message: 'Number must be greater than or equal to 1' }],
              },
            },
            invalid_id: {
              summary: 'Invalid cluster ID format',
              value: { error: 'INVALID_ID', message: 'Invalid id format', details: { field: 'id' } },
            },
          },
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'UNAUTHORIZED', message: 'Missing or invalid API key' },
        },
      },
    },
    403: {
      description: 'Forbidden',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'FORBIDDEN', message: 'You do not have permission to modify this cluster' },
        },
      },
    },
    404: {
      description: 'Cluster not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'NOT_FOUND', message: 'Cluster not found' },
        },
      },
    },
    429: {
      description: 'Too many requests',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.', details: { retry_after: 58 } },
        },
      },
    },
    500: {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'UPDATE_FAILED', message: 'Failed to update Kubernetes cluster' },
        },
      },
    },
  },
});

// DELETE /api/v1/kubernetes/{id} — Delete cluster
registry.registerPath({
  method: 'delete',
  path: '/api/v1/kubernetes/{id}',
  tags: ['Kubernetes'],
  summary: 'Delete Kubernetes cluster',
  description: 'Deletes a Kubernetes cluster and all associated resources.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({
        example: '23549dc5-53ee-4ff2-904d-a59250065545',
        description: 'Kubernetes cluster ID',
      }),
    }),
  },
  responses: {
    200: {
      description: 'Kubernetes cluster deleted',
      content: {
        'application/json': {
          schema: KubernetesClusterDeleteResponseSchema,
        },
      },
    },
    400: {
      description: 'Bad request - invalid cluster ID format',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'INVALID_ID', message: 'Invalid id format', details: { field: 'id' } },
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'UNAUTHORIZED', message: 'Missing or invalid API key' },
        },
      },
    },
    403: {
      description: 'Forbidden',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'FORBIDDEN', message: 'You do not have permission to delete this cluster' },
        },
      },
    },
    404: {
      description: 'Cluster not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'NOT_FOUND', message: 'Cluster not found' },
        },
      },
    },
    429: {
      description: 'Too many requests',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.', details: { retry_after: 58 } },
        },
      },
    },
    500: {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'DELETE_FAILED', message: 'Failed to delete Kubernetes cluster' },
        },
      },
    },
  },
});

} // end registerKubernetesPaths
