import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from '@/lib/openapi/init';

import { ErrorResponseSchema, ValidationErrorResponseSchema } from '@/lib/openapi/schemas/common';
import {
  CreateSpectrumAppRequestSchema,
  SpectrumAppDeleteResponseSchema,
  SpectrumAppListResponseSchema,
  SpectrumAppResponseSchema,
  UpdateSpectrumAppRequestSchema,
} from '@/lib/openapi/schemas/network';

export function registerNetworkPaths(registry: OpenAPIRegistry) {
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

}
