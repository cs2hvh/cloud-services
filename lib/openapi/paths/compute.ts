import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from '@/lib/openapi/init';

import { ErrorResponseSchema, ValidationErrorResponseSchema } from '@/lib/openapi/schemas/common';
import {
  ComputeActionRequestSchema,
  ComputeActionResponseSchema,
  ComputeBackupsActionRequestSchema,
  ComputeBackupsActionResponseSchema,
  ComputeBackupsResponseSchema,
  ComputeImageListResponseSchema,
  ComputeInstanceDeleteResponseSchema,
  ComputeInstanceListResponseSchema,
  ComputeInstanceResponseSchema,
  ComputeRebuildAcceptedResponseSchema,
  ComputeRegionListResponseSchema,
  ComputeResizeAcceptedResponseSchema,
  ComputeResizeOptionsResponseSchema,
  ComputeTypeListResponseSchema,
  CreateComputeInstanceRequestSchema,
  CreateComputeInstanceResponseSchema,
  RebuildComputeInstanceRequestSchema,
  ResizeComputeInstanceRequestSchema,
  UpdateComputeInstanceRequestSchema,
} from '@/lib/openapi/schemas/compute';

/** Path param for the numeric instance id (servers.id). */
const instanceIdParam = z.object({
  instanceId: z.string().regex(/^\d+$/).openapi({
    example: '1042',
    description: 'Compute instance ID',
  }),
});

// Standard response blocks shared by every compute path.
const unauthorizedResponse = {
  description: 'Unauthorized - missing or invalid API key',
  content: {
    'application/json': {
      schema: ErrorResponseSchema,
      example: { error: 'UNAUTHORIZED', message: 'Missing or invalid API key' },
    },
  },
};

const rateLimitResponse = {
  description: 'Too many requests - rate limit exceeded',
  content: {
    'application/json': {
      schema: ErrorResponseSchema,
      example: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.', details: { retry_after: 58 } },
    },
  },
};

const internalErrorResponse = (message: string) => ({
  description: 'Internal server error',
  content: {
    'application/json': {
      schema: ErrorResponseSchema,
      example: { error: 'INTERNAL_ERROR', message },
    },
  },
});

const invalidIdResponse = {
  description: 'Bad request - invalid instance ID format',
  content: {
    'application/json': {
      schema: ErrorResponseSchema,
      example: { error: 'INVALID_ID', message: 'Invalid instanceId format', details: { field: 'instanceId' } },
    },
  },
};

const forbiddenResponse = (action: 'access' | 'modify' | 'delete') => ({
  description: 'Forbidden',
  content: {
    'application/json': {
      schema: ErrorResponseSchema,
      example: { error: 'FORBIDDEN', message: `You do not have permission to ${action} this instance` },
    },
  },
});

const notFoundResponse = {
  description: 'Instance not found',
  content: {
    'application/json': {
      schema: ErrorResponseSchema,
      example: { error: 'NOT_FOUND', message: 'Instance not found' },
    },
  },
};

export function registerComputePaths(registry: OpenAPIRegistry) {

// GET /api/v1/compute/instances — List instances
registry.registerPath({
  method: 'get',
  path: '/api/v1/compute/instances',
  tags: ['Compute'],
  summary: 'List compute instances',
  description: 'Returns all compute instances owned by the authenticated user.',
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'List of compute instances',
      content: {
        'application/json': {
          schema: ComputeInstanceListResponseSchema,
        },
      },
    },
    401: unauthorizedResponse,
    429: rateLimitResponse,
    500: internalErrorResponse('Failed to fetch compute instances'),
  },
});

// POST /api/v1/compute/instances — Create instance
registry.registerPath({
  method: 'post',
  path: '/api/v1/compute/instances',
  tags: ['Compute'],
  summary: 'Create compute instance',
  description: 'Creates a new compute instance. The first hour is charged upfront from your credit balance; the instance then bills hourly at the returned rate. Poll GET /api/v1/compute/instances/{instanceId} to track provisioning.',
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      description: 'Instance configuration',
      content: {
        'application/json': {
          schema: CreateComputeInstanceRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Instance creation started (status `provisioning`)',
      content: {
        'application/json': {
          schema: CreateComputeInstanceResponseSchema,
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
            validation_errors: [{ path: 'root_pass', message: 'Root password must be at least 11 characters' }],
          },
        },
      },
    },
    401: unauthorizedResponse,
    402: {
      description: 'Insufficient credits',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.boolean().openapi({ example: false }),
            error: z.string().openapi({ example: 'Insufficient balance. You need at least $0.04 to create this server.' }),
          }),
        },
      },
    },
    404: {
      description: 'Region unavailable',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.boolean().openapi({ example: false }),
            error: z.string().openapi({ example: 'This region is currently unavailable. Please select a different region.' }),
          }),
        },
      },
    },
    409: {
      description: 'Plan out of stock in the selected region',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.boolean().openapi({ example: false }),
            error: z.string().openapi({ example: 'This plan is out of stock in the selected region. Please pick a different region or plan.' }),
          }),
        },
      },
    },
    429: rateLimitResponse,
    503: {
      description: 'Deployments temporarily disabled or provider unavailable',
      content: {
        'application/json': {
          schema: z.object({
            ok: z.boolean().openapi({ example: false }),
            error: z.string().openapi({ example: 'New server deployments are temporarily disabled. Please try again later.' }),
          }),
        },
      },
    },
  },
});

// GET /api/v1/compute/instances/{instanceId} — Get instance
registry.registerPath({
  method: 'get',
  path: '/api/v1/compute/instances/{instanceId}',
  tags: ['Compute'],
  summary: 'Get compute instance by ID',
  description: 'Returns detailed information about a specific compute instance.',
  security: [{ bearerAuth: [] }],
  request: {
    params: instanceIdParam,
  },
  responses: {
    200: {
      description: 'Compute instance details',
      content: {
        'application/json': {
          schema: ComputeInstanceResponseSchema,
        },
      },
    },
    400: invalidIdResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse('access'),
    404: notFoundResponse,
    429: rateLimitResponse,
    500: internalErrorResponse('Failed to load instance'),
  },
});

// PATCH /api/v1/compute/instances/{instanceId} — Update instance
registry.registerPath({
  method: 'patch',
  path: '/api/v1/compute/instances/{instanceId}',
  tags: ['Compute'],
  summary: 'Update compute instance',
  description: 'Updates the instance label. For Linode-backed instances the label is also pushed upstream (best-effort).',
  security: [{ bearerAuth: [] }],
  request: {
    params: instanceIdParam,
    body: {
      description: 'Instance update payload',
      content: {
        'application/json': {
          schema: UpdateComputeInstanceRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Compute instance updated',
      content: {
        'application/json': {
          schema: ComputeInstanceResponseSchema,
        },
      },
    },
    400: {
      description: 'Bad request - validation error or invalid instance ID',
      content: {
        'application/json': {
          schema: z.union([ValidationErrorResponseSchema, ErrorResponseSchema]),
          examples: {
            validation: {
              summary: 'Body validation error',
              value: {
                error: 'VALIDATION_ERROR',
                message: 'Invalid request body',
                validation_errors: [{ path: 'label', message: 'Label must be at least 3 characters' }],
              },
            },
            invalid_id: {
              summary: 'Invalid instance ID format',
              value: { error: 'INVALID_ID', message: 'Invalid instanceId format', details: { field: 'instanceId' } },
            },
          },
        },
      },
    },
    401: unauthorizedResponse,
    403: forbiddenResponse('modify'),
    404: notFoundResponse,
    429: rateLimitResponse,
    500: internalErrorResponse('Failed to update instance'),
  },
});

// DELETE /api/v1/compute/instances/{instanceId} — Delete instance
registry.registerPath({
  method: 'delete',
  path: '/api/v1/compute/instances/{instanceId}',
  tags: ['Compute'],
  summary: 'Delete compute instance',
  description: 'Destroys the instance, settles billing (prorated final hour), and removes it from your account. This action is irreversible.',
  security: [{ bearerAuth: [] }],
  request: {
    params: instanceIdParam,
  },
  responses: {
    200: {
      description: 'Compute instance deleted',
      content: {
        'application/json': {
          schema: ComputeInstanceDeleteResponseSchema,
        },
      },
    },
    400: invalidIdResponse,
    401: unauthorizedResponse,
    403: forbiddenResponse('delete'),
    404: notFoundResponse,
    429: rateLimitResponse,
    500: internalErrorResponse('Failed to delete instance'),
  },
});

// POST /api/v1/compute/instances/{instanceId}/actions — Power actions
registry.registerPath({
  method: 'post',
  path: '/api/v1/compute/instances/{instanceId}/actions',
  tags: ['Compute'],
  summary: 'Perform power action',
  description: 'Boots, reboots, or shuts down the instance. Shut-down instances continue to bill (delete the instance to stop billing).',
  security: [{ bearerAuth: [] }],
  request: {
    params: instanceIdParam,
    body: {
      description: 'Power action',
      content: {
        'application/json': {
          schema: ComputeActionRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Power action accepted',
      content: {
        'application/json': {
          schema: ComputeActionResponseSchema,
        },
      },
    },
    400: {
      description: 'Bad request - validation error, invalid ID, or unsupported server',
      content: {
        'application/json': {
          schema: z.union([ValidationErrorResponseSchema, ErrorResponseSchema]),
          examples: {
            validation: {
              summary: 'Invalid action',
              value: {
                error: 'VALIDATION_ERROR',
                message: 'Invalid request body',
                validation_errors: [{ path: 'action', message: 'action must be one of: boot, reboot, shutdown' }],
              },
            },
            not_supported: {
              summary: 'Unsupported server',
              value: { error: 'NOT_SUPPORTED', message: 'Power actions are not supported for this server' },
            },
          },
        },
      },
    },
    401: unauthorizedResponse,
    403: forbiddenResponse('modify'),
    404: notFoundResponse,
    422: {
      description: 'Instance is still provisioning',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'INVALID_STATE', message: 'Instance is still provisioning' },
        },
      },
    },
    429: rateLimitResponse,
    502: {
      description: 'Provider error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'PROVIDER_ERROR', message: 'Unable to reboot the instance. Please try again later.' },
        },
      },
    },
  },
});

// GET /api/v1/compute/instances/{instanceId}/resize — Resize options
registry.registerPath({
  method: 'get',
  path: '/api/v1/compute/instances/{instanceId}/resize',
  tags: ['Compute'],
  summary: 'List resize options',
  description: 'Returns the current plan and every plan the instance could resize to, annotated with availability and the price you would be billed after the resize.',
  security: [{ bearerAuth: [] }],
  request: {
    params: instanceIdParam,
  },
  responses: {
    200: {
      description: 'Resize options',
      content: {
        'application/json': {
          schema: ComputeResizeOptionsResponseSchema,
        },
      },
    },
    400: {
      description: 'Bad request - invalid ID or unsupported server',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'NOT_SUPPORTED', message: 'Resize is not supported for this server' },
        },
      },
    },
    401: unauthorizedResponse,
    403: forbiddenResponse('access'),
    404: notFoundResponse,
    422: {
      description: 'Instance is not fully provisioned',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'INVALID_STATE', message: 'Instance is not fully provisioned' },
        },
      },
    },
    429: rateLimitResponse,
    500: internalErrorResponse('Unable to load resize options'),
  },
});

// POST /api/v1/compute/instances/{instanceId}/resize — Start resize
registry.registerPath({
  method: 'post',
  path: '/api/v1/compute/instances/{instanceId}/resize',
  tags: ['Compute'],
  summary: 'Resize compute instance',
  description: 'Starts a resize to the target type. The instance is migrated in the background (it powers off, migrates, and boots back if it was running); billing is re-rated to the new plan price once the resize settles. Disk can only grow.',
  security: [{ bearerAuth: [] }],
  request: {
    params: instanceIdParam,
    body: {
      description: 'Resize target',
      content: {
        'application/json': {
          schema: ResizeComputeInstanceRequestSchema,
        },
      },
    },
  },
  responses: {
    202: {
      description: 'Resize started — poll GET /api/v1/compute/instances/{instanceId} for completion',
      content: {
        'application/json': {
          schema: ComputeResizeAcceptedResponseSchema,
        },
      },
    },
    400: {
      description: 'Bad request - validation error, unknown plan, or unsupported server',
      content: {
        'application/json': {
          schema: z.union([ValidationErrorResponseSchema, ErrorResponseSchema]),
          examples: {
            validation: {
              summary: 'Missing type',
              value: {
                error: 'VALIDATION_ERROR',
                message: 'Invalid request body',
                validation_errors: [{ path: 'type', message: 'type is required' }],
              },
            },
            unknown_plan: {
              summary: 'Unknown plan',
              value: { error: 'VALIDATION_ERROR', message: 'That plan is no longer available.' },
            },
          },
        },
      },
    },
    401: unauthorizedResponse,
    402: {
      description: 'Insufficient credits for the new plan rate',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'INSUFFICIENT_BALANCE', message: 'Insufficient balance. You need at least $0.07 to resize.' },
        },
      },
    },
    403: forbiddenResponse('modify'),
    404: notFoundResponse,
    409: {
      description: 'Conflict - wrong state or plan unavailable',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'CONFLICT', message: 'Server must be running or stopped to resize.' },
        },
      },
    },
    422: {
      description: 'Instance configuration is incomplete',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'INVALID_STATE', message: 'Server configuration is incomplete.' },
        },
      },
    },
    429: rateLimitResponse,
    502: {
      description: 'Provider error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'PROVIDER_ERROR', message: 'Unable to start the resize. Please try again.' },
        },
      },
    },
  },
});

// GET /api/v1/compute/instances/{instanceId}/backups — Backup state + list
registry.registerPath({
  method: 'get',
  path: '/api/v1/compute/instances/{instanceId}/backups',
  tags: ['Compute'],
  summary: 'List backups',
  description: 'Returns the backup add-on state, existing automatic backups and snapshot (when enabled), and the add-on price quote.',
  security: [{ bearerAuth: [] }],
  request: {
    params: instanceIdParam,
  },
  responses: {
    200: {
      description: 'Backup overview',
      content: {
        'application/json': {
          schema: ComputeBackupsResponseSchema,
        },
      },
    },
    400: {
      description: 'Bad request - invalid ID or unsupported server',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'NOT_SUPPORTED', message: 'Backups are not supported for this server' },
        },
      },
    },
    401: unauthorizedResponse,
    403: forbiddenResponse('access'),
    404: notFoundResponse,
    422: {
      description: 'Instance is still provisioning',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'INVALID_STATE', message: 'Instance is still provisioning' },
        },
      },
    },
    429: rateLimitResponse,
    502: {
      description: 'Provider error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'PROVIDER_ERROR', message: 'Failed to load backups' },
        },
      },
    },
  },
});

// POST /api/v1/compute/instances/{instanceId}/backups — Backup actions
registry.registerPath({
  method: 'post',
  path: '/api/v1/compute/instances/{instanceId}/backups',
  tags: ['Compute'],
  summary: 'Manage backups',
  description: 'Enables or cancels the backups add-on (re-rates the hourly billing meter), takes a manual snapshot, or restores a backup in place. Restore returns 202 and proceeds in the background.',
  security: [{ bearerAuth: [] }],
  request: {
    params: instanceIdParam,
    body: {
      description: 'Backup action',
      content: {
        'application/json': {
          schema: ComputeBackupsActionRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Backup action completed',
      content: {
        'application/json': {
          schema: ComputeBackupsActionResponseSchema,
        },
      },
    },
    202: {
      description: 'Restore started',
      content: {
        'application/json': {
          schema: ComputeBackupsActionResponseSchema,
        },
      },
    },
    400: {
      description: 'Bad request - validation error or invalid state',
      content: {
        'application/json': {
          schema: z.union([ValidationErrorResponseSchema, ErrorResponseSchema]),
          examples: {
            validation: {
              summary: 'Invalid action',
              value: {
                error: 'VALIDATION_ERROR',
                message: 'Invalid request body',
                validation_errors: [{ path: 'action', message: 'action must be one of: enable, cancel, snapshot, restore' }],
              },
            },
            already_enabled: {
              summary: 'Backups already enabled',
              value: { error: 'VALIDATION_ERROR', message: 'Backups are already enabled.' },
            },
          },
        },
      },
    },
    401: unauthorizedResponse,
    403: forbiddenResponse('modify'),
    404: notFoundResponse,
    422: {
      description: 'Instance is still provisioning',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'INVALID_STATE', message: 'Instance is still provisioning' },
        },
      },
    },
    429: rateLimitResponse,
    502: {
      description: 'Provider error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'PROVIDER_ERROR', message: 'Backup operation failed' },
        },
      },
    },
  },
});

// POST /api/v1/compute/instances/{instanceId}/rebuild — Rebuild instance
registry.registerPath({
  method: 'post',
  path: '/api/v1/compute/instances/{instanceId}/rebuild',
  tags: ['Compute'],
  summary: 'Rebuild compute instance',
  description: 'Wipes all disks and redeploys the chosen image with a new root password (+ optional SSH keys). All data on the instance is destroyed. Proceeds in the background.',
  security: [{ bearerAuth: [] }],
  request: {
    params: instanceIdParam,
    body: {
      description: 'Rebuild configuration',
      content: {
        'application/json': {
          schema: RebuildComputeInstanceRequestSchema,
        },
      },
    },
  },
  responses: {
    202: {
      description: 'Rebuild started — poll GET /api/v1/compute/instances/{instanceId} for completion',
      content: {
        'application/json': {
          schema: ComputeRebuildAcceptedResponseSchema,
        },
      },
    },
    400: {
      description: 'Bad request - validation error, unknown image, or unsupported server',
      content: {
        'application/json': {
          schema: z.union([ValidationErrorResponseSchema, ErrorResponseSchema]),
          examples: {
            validation: {
              summary: 'Weak root password',
              value: {
                error: 'VALIDATION_ERROR',
                message: 'Invalid request body',
                validation_errors: [{ path: 'root_pass', message: 'Root password must be at least 11 characters' }],
              },
            },
            not_supported: {
              summary: 'Unsupported server',
              value: { error: 'VALIDATION_ERROR', message: 'Rebuild is not available for this server.' },
            },
          },
        },
      },
    },
    401: unauthorizedResponse,
    403: forbiddenResponse('modify'),
    404: notFoundResponse,
    409: {
      description: 'Instance must be running or stopped',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'CONFLICT', message: 'Server must be running or stopped to rebuild.' },
        },
      },
    },
    422: {
      description: 'Instance is still provisioning',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'INVALID_STATE', message: 'Server is still provisioning' },
        },
      },
    },
    429: rateLimitResponse,
    502: {
      description: 'Provider error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'PROVIDER_ERROR', message: 'Unable to start the rebuild. Please try again.' },
        },
      },
    },
  },
});

// GET /api/v1/compute/regions — Region catalog
registry.registerPath({
  method: 'get',
  path: '/api/v1/compute/regions',
  tags: ['Compute'],
  summary: 'List compute regions',
  description: 'Returns the regions where compute instances can be deployed.',
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'List of regions',
      content: {
        'application/json': {
          schema: ComputeRegionListResponseSchema,
        },
      },
    },
    401: unauthorizedResponse,
    429: rateLimitResponse,
    500: internalErrorResponse('Failed to fetch compute regions'),
  },
});

// GET /api/v1/compute/types — Type catalog
registry.registerPath({
  method: 'get',
  path: '/api/v1/compute/types',
  tags: ['Compute'],
  summary: 'List compute types',
  description: 'Returns the available instance types with customer pricing (base price plus per-region overrides where applicable).',
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'List of instance types',
      content: {
        'application/json': {
          schema: ComputeTypeListResponseSchema,
        },
      },
    },
    401: unauthorizedResponse,
    429: rateLimitResponse,
    500: internalErrorResponse('Failed to fetch compute types'),
  },
});

// GET /api/v1/compute/images — Image catalog
registry.registerPath({
  method: 'get',
  path: '/api/v1/compute/images',
  tags: ['Compute'],
  summary: 'List compute images',
  description: 'Returns the OS images available for creating or rebuilding compute instances.',
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'List of images',
      content: {
        'application/json': {
          schema: ComputeImageListResponseSchema,
        },
      },
    },
    401: unauthorizedResponse,
    429: rateLimitResponse,
    500: internalErrorResponse('Failed to fetch compute images'),
  },
});

} // end registerComputePaths
