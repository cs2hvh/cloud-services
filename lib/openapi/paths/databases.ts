import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from '@/lib/openapi/init';

import { ErrorResponseSchema, ValidationErrorResponseSchema } from '@/lib/openapi/schemas/common';
import {
  ClusterDatabaseListResponseSchema,
  ClusterDatabaseResponseSchema,
  CreateClusterDatabaseRequestSchema,
  CreateDatabaseClusterRequestSchema,
  CreateDatabaseClusterResponseSchema,
  CreateDatabaseUserRequestSchema,
  AddDatabaseFirewallRuleRequestSchema,
  DatabaseFirewallRuleDeleteResponseSchema,
  DatabaseFirewallRuleListResponseSchema,
  DatabaseFirewallRuleUpdateResponseSchema,
  DatabaseMaintenanceWindowResponseSchema,
  DatabaseMaintenanceWindowUpdateResponseSchema,
  DatabaseRegionMigrationResponseSchema,
  DatabaseStorageUpdateResponseSchema,
  DatabaseStorageUpsizeResponseSchema,
  DatabaseClusterListResponseSchema,
  DatabaseClusterResponseSchema,
  DatabaseDeleteResponseSchema,
  DatabaseSubResourceDeleteResponseSchema,
  DatabaseUserListResponseSchema,
  DatabaseUserResponseSchema,
  MigrateDatabaseRegionRequestSchema,
  UpdateDatabaseMaintenanceWindowRequestSchema,
  UpdateDatabaseStorageRequestSchema,
  UpsizeDatabaseStorageRequestSchema,
} from '@/lib/openapi/schemas/databases';

export function registerDatabasePaths(registry: OpenAPIRegistry) {
registry.registerPath({
  method: 'get',
  path: '/api/v1/databases',
  tags: ['Databases'],
  summary: 'List database clusters',
  description: 'Returns all database clusters owned by the authenticated user.',
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'List of database clusters',
      content: {
        'application/json': {
          schema: DatabaseClusterListResponseSchema,
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
      description: 'Fetch failed',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'INTERNAL_ERROR', message: 'Failed to fetch database clusters' },
        },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/databases',
  tags: ['Databases'],
  summary: 'Create database cluster',
  description: 'Creates a new managed database cluster and starts billing if provisioning succeeds.',
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateDatabaseClusterRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Database cluster creation accepted',
      content: {
        'application/json': {
          schema: CreateDatabaseClusterResponseSchema,
        },
      },
    },
    400: {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: z.union([ValidationErrorResponseSchema, ErrorResponseSchema]),
          example: { error: 'VALIDATION_ERROR', message: 'Invalid request body', validation_errors: [{ path: 'name', message: 'Cluster name must be at least 3 characters' }] },
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
          example: { error: 'INSUFFICIENT_CREDITS', message: 'Insufficient credits' },
        },
      },
    },
    403: {
      description: 'Forbidden',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'FORBIDDEN', message: 'You do not have permission to create a database cluster in this project' },
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
    409: {
      description: 'Already exists',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'ALREADY_EXISTS', message: 'Resource already exists' },
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
    503: {
      description: 'Provider busy',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'SERVICE_UNAVAILABLE', message: 'Server busy. Please try again later.' },
        },
      },
    },
    500: {
      description: 'Create failed',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'CREATE_FAILED', message: 'Failed to create database cluster' },
        },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/databases/{id}',
  tags: ['Databases'],
  summary: 'Get database cluster',
  description: 'Returns one database cluster. Optional `check_status=true` triggers provider sync before response.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ example: '4a8e82f0-5f60-44ec-a2ed-5f41e2d0229f' }),
    }),
    query: z.object({
      check_status: z.boolean().optional().openapi({ example: true }),
    }),
  },
  responses: {
    200: {
      description: 'Database cluster details',
      content: {
        'application/json': {
          schema: DatabaseClusterResponseSchema,
        },
      },
    },
    400: {
      description: 'Invalid ID or query parameter',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          examples: {
            invalid_id: {
              summary: 'Invalid cluster ID',
              value: { error: 'INVALID_ID', message: 'Invalid id format', details: { field: 'id' } },
            },
            invalid_check_status: {
              summary: 'Invalid check_status value',
              value: { error: 'INVALID_PARAMETER', message: 'Invalid check_status value. Use true or false.', details: { field: 'check_status' } },
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
          example: { error: 'FORBIDDEN', message: 'You do not have permission to access this database cluster' },
        },
      },
    },
    404: {
      description: 'Cluster not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'NOT_FOUND', message: 'Database cluster not found' },
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
      description: 'Fetch failed',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'INTERNAL_ERROR', message: 'Failed to fetch database cluster' },
        },
      },
    },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/databases/{id}',
  tags: ['Databases'],
  summary: 'Delete database cluster',
  description: 'Deletes a database cluster and closes active billing. Use `force=true` to auto-unlink integrated apps first.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ example: '4a8e82f0-5f60-44ec-a2ed-5f41e2d0229f' }),
    }),
    query: z.object({
      force: z.boolean().optional().openapi({ example: true }),
    }),
    body: {
      description: 'Optional JSON body for compatibility. If both query and body include `force`, runtime uses the body value.',
      content: {
        'application/json': {
          schema: z.object({
            force: z.boolean().optional().openapi({ example: true }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Cluster deleted',
      content: {
        'application/json': {
          schema: DatabaseDeleteResponseSchema,
        },
      },
    },
    400: {
      description: 'Invalid ID',
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
          example: { error: 'FORBIDDEN', message: 'You do not have permission to delete this database cluster' },
        },
      },
    },
    404: {
      description: 'Cluster not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'NOT_FOUND', message: 'Database cluster not found' },
        },
      },
    },
    409: {
      description: 'Cluster has active integrations',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'DATABASE_HAS_ACTIVE_LINKS', message: 'Database cluster has active app integrations', details: { linked_apps_count: 2, linked_app_names: ['api-gateway', 'worker-service'] } },
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
      description: 'Delete failed',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
          example: { error: 'DELETE_FAILED', message: 'Failed to delete database cluster' },
        },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/databases/{id}/dbs',
  tags: ['Databases'],
  summary: 'List databases in cluster',
  description: 'Returns all logical databases in a cluster.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ example: '4a8e82f0-5f60-44ec-a2ed-5f41e2d0229f' }),
    }),
  },
  responses: {
    200: {
      description: 'Databases in cluster',
      content: {
        'application/json': {
          schema: ClusterDatabaseListResponseSchema,
        },
      },
    },
    400: { description: 'Invalid ID', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'INVALID_ID', message: 'Invalid id format', details: { field: 'id' } } } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'UNAUTHORIZED', message: 'Missing or invalid API key' } } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'FORBIDDEN', message: 'You do not have permission to access this database cluster' } } } },
    404: { description: 'Cluster not found', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'NOT_FOUND', message: 'Database cluster not found' } } } },
    429: { description: 'Too many requests', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.', details: { retry_after: 58 } } } } },
    500: { description: 'Fetch failed', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'INTERNAL_ERROR', message: 'Failed to fetch databases' } } } },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/databases/{id}/dbs',
  tags: ['Databases'],
  summary: 'Create database in cluster',
  description: 'Creates a new logical database in the specified cluster.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ example: '4a8e82f0-5f60-44ec-a2ed-5f41e2d0229f' }),
    }),
    body: {
      content: {
        'application/json': {
          schema: CreateClusterDatabaseRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Database created',
      content: {
        'application/json': {
          schema: ClusterDatabaseResponseSchema,
        },
      },
    },
    400: { description: 'Validation error', content: { 'application/json': { schema: z.union([ValidationErrorResponseSchema, ErrorResponseSchema]), example: { error: 'VALIDATION_ERROR', message: 'Invalid request body', validation_errors: [{ path: 'name', message: 'Cluster name must be at least 3 characters' }] } } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'UNAUTHORIZED', message: 'Missing or invalid API key' } } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'FORBIDDEN', message: 'You do not have permission to modify this database cluster' } } } },
    404: { description: 'Cluster not found', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'NOT_FOUND', message: 'Database cluster not found' } } } },
    409: { description: 'Already exists', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'ALREADY_EXISTS', message: 'Resource already exists' } } } },
    429: { description: 'Too many requests', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.', details: { retry_after: 58 } } } } },
    500: { description: 'Create failed', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'CREATE_FAILED', message: 'Failed to create database' } } } },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/databases/{id}/dbs/{name}',
  tags: ['Databases'],
  summary: 'Get database in cluster',
  description: 'Returns one logical database from the cluster.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ example: '4a8e82f0-5f60-44ec-a2ed-5f41e2d0229f' }),
      name: z.string().openapi({ example: 'appdb' }),
    }),
  },
  responses: {
    200: {
      description: 'Database details',
      content: {
        'application/json': {
          schema: ClusterDatabaseResponseSchema,
        },
      },
    },
    400: { description: 'Invalid ID', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'INVALID_ID', message: 'Invalid id format', details: { field: 'id' } } } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'UNAUTHORIZED', message: 'Missing or invalid API key' } } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'FORBIDDEN', message: 'You do not have permission to access this database cluster' } } } },
    404: { description: 'Not found', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'NOT_FOUND', message: 'Database cluster not found' } } } },
    429: { description: 'Too many requests', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.', details: { retry_after: 58 } } } } },
    500: { description: 'Fetch failed', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'INTERNAL_ERROR', message: 'Failed to fetch database' } } } },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/databases/{id}/dbs/{name}',
  tags: ['Databases'],
  summary: 'Delete database in cluster',
  description: 'Deletes one logical database from the cluster.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ example: '4a8e82f0-5f60-44ec-a2ed-5f41e2d0229f' }),
      name: z.string().openapi({ example: 'appdb' }),
    }),
  },
  responses: {
    200: {
      description: 'Database deleted',
      content: {
        'application/json': {
          schema: DatabaseSubResourceDeleteResponseSchema,
        },
      },
    },
    400: { description: 'Invalid ID', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'INVALID_ID', message: 'Invalid id format', details: { field: 'id' } } } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'UNAUTHORIZED', message: 'Missing or invalid API key' } } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'FORBIDDEN', message: 'You do not have permission to modify this database cluster' } } } },
    404: { description: 'Not found', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'NOT_FOUND', message: 'Database cluster not found' } } } },
    429: { description: 'Too many requests', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.', details: { retry_after: 58 } } } } },
    500: { description: 'Delete failed', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'DELETE_FAILED', message: 'Failed to delete database' } } } },
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/databases/{id}/storage',
  tags: ['Databases'],
  summary: 'Resize database cluster tier',
  description: 'Updates the cluster compute/storage tier size slug.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ example: '4a8e82f0-5f60-44ec-a2ed-5f41e2d0229f' }),
    }),
    body: {
      content: {
        'application/json': {
          schema: UpdateDatabaseStorageRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Storage tier update initiated',
      content: {
        'application/json': {
          schema: DatabaseStorageUpdateResponseSchema,
        },
      },
    },
    400: {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: z.union([ValidationErrorResponseSchema, ErrorResponseSchema]),
          example: {
            error: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            validation_errors: [{ path: 'size', message: 'Size must be a valid DigitalOcean database size' }],
          },
        },
      },
    },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'UNAUTHORIZED', message: 'Missing or invalid API key' } } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'FORBIDDEN', message: 'You do not have permission to modify this database cluster' } } } },
    404: { description: 'Cluster not found', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'NOT_FOUND', message: 'Database cluster not found' } } } },
    429: { description: 'Too many requests', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.', details: { retry_after: 58 } } } } },
    500: { description: 'Update failed', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'UPDATE_FAILED', message: 'Failed to update database storage tier' } } } },
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/databases/{id}/storage/upsize',
  tags: ['Databases'],
  summary: 'Upsize database disk storage',
  description: 'Increases disk storage for the cluster while preserving the current tier size.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ example: '4a8e82f0-5f60-44ec-a2ed-5f41e2d0229f' }),
    }),
    body: {
      content: {
        'application/json': {
          schema: UpsizeDatabaseStorageRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Storage upsize initiated',
      content: {
        'application/json': {
          schema: DatabaseStorageUpsizeResponseSchema,
        },
      },
    },
    400: {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: z.union([ValidationErrorResponseSchema, ErrorResponseSchema]),
          example: {
            error: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            validation_errors: [{ path: 'storage_size_mib', message: 'Storage size must be at least 10 GiB (10240 MiB)' }],
          },
        },
      },
    },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'UNAUTHORIZED', message: 'Missing or invalid API key' } } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'FORBIDDEN', message: 'You do not have permission to modify this database cluster' } } } },
    404: { description: 'Cluster not found', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'NOT_FOUND', message: 'Database cluster not found' } } } },
    429: { description: 'Too many requests', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.', details: { retry_after: 58 } } } } },
    500: { description: 'Update failed', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'UPDATE_FAILED', message: 'Failed to upsize database storage' } } } },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/databases/{id}/network/firewall',
  tags: ['Databases'],
  summary: 'List database firewall rules',
  description: 'Returns all network firewall rules configured for a database cluster.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ example: '4a8e82f0-5f60-44ec-a2ed-5f41e2d0229f' }),
    }),
  },
  responses: {
    200: {
      description: 'Firewall rules',
      content: {
        'application/json': {
          schema: DatabaseFirewallRuleListResponseSchema,
        },
      },
    },
    400: { description: 'Invalid ID', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'INVALID_ID', message: 'Invalid id format', details: { field: 'id' } } } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'UNAUTHORIZED', message: 'Missing or invalid API key' } } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'FORBIDDEN', message: 'You do not have permission to access this database cluster' } } } },
    404: { description: 'Cluster not found', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'NOT_FOUND', message: 'Database cluster not found' } } } },
    429: { description: 'Too many requests', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.', details: { retry_after: 58 } } } } },
    500: { description: 'Fetch failed', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'INTERNAL_ERROR', message: 'Failed to fetch firewall rules' } } } },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/databases/{id}/network/firewall',
  tags: ['Databases'],
  summary: 'Add database firewall rule',
  description: 'Adds a new IP/CIDR firewall rule to the database cluster.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ example: '4a8e82f0-5f60-44ec-a2ed-5f41e2d0229f' }),
    }),
    body: {
      content: {
        'application/json': {
          schema: AddDatabaseFirewallRuleRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Firewall rule added',
      content: {
        'application/json': {
          schema: DatabaseFirewallRuleUpdateResponseSchema,
        },
      },
    },
    400: { description: 'Validation error', content: { 'application/json': { schema: z.union([ValidationErrorResponseSchema, ErrorResponseSchema]), example: { error: 'VALIDATION_ERROR', message: 'Invalid request body', validation_errors: [{ path: 'ip_address', message: 'Must be a valid IPv4, IPv6, or CIDR notation' }] } } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'UNAUTHORIZED', message: 'Missing or invalid API key' } } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'FORBIDDEN', message: 'You do not have permission to modify this database cluster' } } } },
    404: { description: 'Cluster not found', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'NOT_FOUND', message: 'Database cluster not found' } } } },
    409: { description: 'Already exists', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'ALREADY_EXISTS', message: 'This IP address already exists in the firewall rules' } } } },
    429: { description: 'Too many requests', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.', details: { retry_after: 58 } } } } },
    500: { description: 'Update failed', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'UPDATE_FAILED', message: 'Failed to add firewall rule' } } } },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/databases/{id}/network/firewall/{ruleUuid}',
  tags: ['Databases'],
  summary: 'Delete database firewall rule',
  description: 'Deletes a firewall rule from the database cluster.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ example: '4a8e82f0-5f60-44ec-a2ed-5f41e2d0229f' }),
      ruleUuid: z.string().uuid().openapi({ example: '90f543fc-cf87-4f77-ab47-acddf8ebde7f' }),
    }),
  },
  responses: {
    200: {
      description: 'Firewall rule deleted',
      content: {
        'application/json': {
          schema: DatabaseFirewallRuleDeleteResponseSchema,
        },
      },
    },
    400: { description: 'Invalid ID', content: { 'application/json': { schema: z.union([ValidationErrorResponseSchema, ErrorResponseSchema]), example: { error: 'VALIDATION_ERROR', message: 'Invalid request', validation_errors: [{ path: 'rule_uuid', message: 'Rule UUID must be a valid UUID' }] } } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'UNAUTHORIZED', message: 'Missing or invalid API key' } } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'FORBIDDEN', message: 'You do not have permission to modify this database cluster' } } } },
    404: { description: 'Not found', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'NOT_FOUND', message: 'Database cluster not found' } } } },
    429: { description: 'Too many requests', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.', details: { retry_after: 58 } } } } },
    500: { description: 'Delete failed', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'DELETE_FAILED', message: 'Failed to delete firewall rule' } } } },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/databases/{id}/maintenance',
  tags: ['Databases'],
  summary: 'Get database maintenance window',
  description: 'Returns the configured maintenance window for the database cluster.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ example: '4a8e82f0-5f60-44ec-a2ed-5f41e2d0229f' }),
    }),
  },
  responses: {
    200: {
      description: 'Maintenance window',
      content: {
        'application/json': {
          schema: DatabaseMaintenanceWindowResponseSchema,
        },
      },
    },
    400: { description: 'Invalid ID', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'INVALID_ID', message: 'Invalid id format', details: { field: 'id' } } } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'UNAUTHORIZED', message: 'Missing or invalid API key' } } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'FORBIDDEN', message: 'You do not have permission to access this database cluster' } } } },
    404: { description: 'Cluster not found', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'NOT_FOUND', message: 'Database cluster not found' } } } },
    429: { description: 'Too many requests', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.', details: { retry_after: 58 } } } } },
    500: { description: 'Fetch failed', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'INTERNAL_ERROR', message: 'Failed to fetch maintenance window' } } } },
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/databases/{id}/maintenance',
  tags: ['Databases'],
  summary: 'Update database maintenance window',
  description: 'Updates the maintenance window for the database cluster.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ example: '4a8e82f0-5f60-44ec-a2ed-5f41e2d0229f' }),
    }),
    body: {
      content: {
        'application/json': {
          schema: UpdateDatabaseMaintenanceWindowRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Maintenance window updated',
      content: {
        'application/json': {
          schema: DatabaseMaintenanceWindowUpdateResponseSchema,
        },
      },
    },
    400: { description: 'Validation error', content: { 'application/json': { schema: z.union([ValidationErrorResponseSchema, ErrorResponseSchema]), example: { error: 'VALIDATION_ERROR', message: 'Invalid request body', validation_errors: [{ path: 'hour', message: 'Hour must be in HH:MM format (24-hour)' }] } } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'UNAUTHORIZED', message: 'Missing or invalid API key' } } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'FORBIDDEN', message: 'You do not have permission to modify this database cluster' } } } },
    404: { description: 'Cluster not found', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'NOT_FOUND', message: 'Database cluster not found' } } } },
    429: { description: 'Too many requests', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.', details: { retry_after: 58 } } } } },
    500: { description: 'Update failed', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'UPDATE_FAILED', message: 'Failed to update maintenance window' } } } },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/databases/{id}/region',
  tags: ['Databases'],
  summary: 'List available migration regions',
  description: 'Returns all allowed destination regions for database migration.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ example: '4a8e82f0-5f60-44ec-a2ed-5f41e2d0229f' }),
    }),
  },
  responses: {
    200: {
      description: 'Available migration regions',
      content: {
        'application/json': {
          schema: z.object({
            data: z.object({
              cluster_id: z.string().uuid().openapi({ example: '4a8e82f0-5f60-44ec-a2ed-5f41e2d0229f' }),
              available_regions: z.array(z.string()).openapi({
                example: ['nyc1', 'nyc3', 'sfo1', 'sfo2', 'sfo3', 'ams2', 'ams3', 'sgp1', 'lon1', 'fra1', 'tor1', 'blr1', 'syd1'],
              }),
            }),
          }),
        },
      },
    },
    400: { description: 'Invalid ID', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'INVALID_ID', message: 'Invalid id format', details: { field: 'id' } } } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'UNAUTHORIZED', message: 'Missing or invalid API key' } } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'FORBIDDEN', message: 'You do not have permission to access this database cluster' } } } },
    404: { description: 'Cluster not found', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'NOT_FOUND', message: 'Database cluster not found' } } } },
    429: { description: 'Too many requests', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.', details: { retry_after: 58 } } } } },
    500: { description: 'Fetch failed', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'INTERNAL_ERROR', message: 'Failed to fetch migration regions' } } } },
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/databases/{id}/region',
  tags: ['Databases'],
  summary: 'Migrate database cluster region',
  description: 'Starts an asynchronous region migration for the database cluster.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ example: '4a8e82f0-5f60-44ec-a2ed-5f41e2d0229f' }),
    }),
    body: {
      content: {
        'application/json': {
          schema: MigrateDatabaseRegionRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Migration started',
      content: {
        'application/json': {
          schema: DatabaseRegionMigrationResponseSchema,
        },
      },
    },
    400: { description: 'Validation error', content: { 'application/json': { schema: z.union([ValidationErrorResponseSchema, ErrorResponseSchema]), example: { error: 'VALIDATION_ERROR', message: 'Invalid region. Use one of the available regions.', details: { field: 'region', available_regions: ['nyc1', 'nyc3', 'sfo1', 'sfo2', 'sfo3', 'ams2', 'ams3', 'sgp1', 'lon1', 'fra1', 'tor1', 'blr1', 'syd1'] } } } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'UNAUTHORIZED', message: 'Missing or invalid API key' } } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'FORBIDDEN', message: 'You do not have permission to modify this database cluster' } } } },
    404: { description: 'Cluster not found', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'NOT_FOUND', message: 'Database cluster not found' } } } },
    422: { description: 'Unsupported operation', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'UNSUPPORTED_OPERATION', message: 'Region migration is not supported for MongoDB clusters' } } } },
    429: { description: 'Too many requests', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.', details: { retry_after: 58 } } } } },
    500: { description: 'Migration failed', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'UPDATE_FAILED', message: 'Failed to start region migration' } } } },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/databases/{id}/users',
  tags: ['Databases'],
  summary: 'List database users',
  description: 'Returns users configured for a cluster.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ example: '4a8e82f0-5f60-44ec-a2ed-5f41e2d0229f' }),
    }),
  },
  responses: {
    200: {
      description: 'Cluster users',
      content: {
        'application/json': {
          schema: DatabaseUserListResponseSchema,
        },
      },
    },
    400: { description: 'Invalid ID', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'INVALID_ID', message: 'Invalid id format', details: { field: 'id' } } } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'UNAUTHORIZED', message: 'Missing or invalid API key' } } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'FORBIDDEN', message: 'You do not have permission to access this database cluster' } } } },
    404: { description: 'Cluster not found', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'NOT_FOUND', message: 'Database cluster not found' } } } },
    429: { description: 'Too many requests', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.', details: { retry_after: 58 } } } } },
    500: { description: 'Fetch failed', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'INTERNAL_ERROR', message: 'Failed to fetch database users' } } } },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/databases/{id}/users',
  tags: ['Databases'],
  summary: 'Create database user',
  description: 'Creates a new user in the cluster.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ example: '4a8e82f0-5f60-44ec-a2ed-5f41e2d0229f' }),
    }),
    body: {
      content: {
        'application/json': {
          schema: CreateDatabaseUserRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'User created',
      content: {
        'application/json': {
          schema: DatabaseUserResponseSchema,
        },
      },
    },
    400: { description: 'Validation error', content: { 'application/json': { schema: z.union([ValidationErrorResponseSchema, ErrorResponseSchema]), example: { error: 'VALIDATION_ERROR', message: 'Invalid request body', validation_errors: [{ path: 'name', message: 'Cluster name must be at least 3 characters' }] } } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'UNAUTHORIZED', message: 'Missing or invalid API key' } } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'FORBIDDEN', message: 'You do not have permission to modify this database cluster' } } } },
    404: { description: 'Cluster not found', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'NOT_FOUND', message: 'Database cluster not found' } } } },
    409: { description: 'Already exists', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'ALREADY_EXISTS', message: 'Resource already exists' } } } },
    429: { description: 'Too many requests', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.', details: { retry_after: 58 } } } } },
    500: { description: 'Create failed', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'CREATE_FAILED', message: 'Failed to create database user' } } } },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/databases/{id}/users/{username}',
  tags: ['Databases'],
  summary: 'Delete database user',
  description: 'Deletes an existing user from the cluster.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ example: '4a8e82f0-5f60-44ec-a2ed-5f41e2d0229f' }),
      username: z.string().openapi({ example: 'readonly_user' }),
    }),
  },
  responses: {
    200: {
      description: 'User deleted',
      content: {
        'application/json': {
          schema: DatabaseSubResourceDeleteResponseSchema,
        },
      },
    },
    400: { description: 'Invalid ID', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'INVALID_ID', message: 'Invalid id format', details: { field: 'id' } } } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'UNAUTHORIZED', message: 'Missing or invalid API key' } } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'FORBIDDEN', message: 'You do not have permission to modify this database cluster' } } } },
    404: { description: 'Not found', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'NOT_FOUND', message: 'Database cluster not found' } } } },
    429: { description: 'Too many requests', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.', details: { retry_after: 58 } } } } },
    500: { description: 'Delete failed', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'DELETE_FAILED', message: 'Failed to delete database user' } } } },
  },
});


registry.registerPath({
  method: 'post',
  path: '/api/v1/databases/{id}/users/{username}/reset-password',
  tags: ['Databases'],
  summary: 'Reset database user password',
  description: 'Resets password for the specified database user and updates stored connection credentials when applicable.',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ example: '4a8e82f0-5f60-44ec-a2ed-5f41e2d0229f' }),
      username: z.string().openapi({ example: 'doadmin' }),
    }),
  },
  responses: {
    200: {
      description: 'Password reset completed',
      content: {
        'application/json': {
          schema: DatabaseUserResponseSchema,
        },
      },
    },
    400: { description: 'Invalid ID', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'INVALID_ID', message: 'Invalid id format', details: { field: 'id' } } } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'UNAUTHORIZED', message: 'Missing or invalid API key' } } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'FORBIDDEN', message: 'You do not have permission to modify this database cluster' } } } },
    404: { description: 'Not found', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'NOT_FOUND', message: 'Database cluster not found' } } } },
    429: { description: 'Too many requests', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.', details: { retry_after: 58 } } } } },
    500: { description: 'Reset failed', content: { 'application/json': { schema: ErrorResponseSchema, example: { error: 'UPDATE_FAILED', message: 'Failed to reset database user password' } } } },
  },
});
}
