import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from '@/lib/openapi/init';

import { ErrorResponseSchema } from '@/lib/openapi/schemas/common';
import {
  BucketDeleteResponseSchema,
  BucketListResponseSchema,
  BucketResponseSchema,
} from '@/lib/openapi/schemas/storage';

export function registerStoragePaths(registry: OpenAPIRegistry) {
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

}
