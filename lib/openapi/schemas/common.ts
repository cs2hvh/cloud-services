import { z } from '@/lib/openapi/init';

export const ErrorResponseSchema = z.object({
  error: z.string().openapi({
    example: 'VALIDATION_ERROR',
    description: 'Error code identifier',
  }),
  message: z.string().openapi({
    example: 'Invalid request body',
    description: 'Human-readable error message',
  }),
  details: z.record(z.unknown()).optional().openapi({
    example: { field: 'name', issue: 'Must be at least 3 characters' },
    description: 'Additional error details',
  }),
}).openapi('ErrorResponse');

export const ValidationErrorResponseSchema = z.object({
  error: z.string().openapi({ example: 'VALIDATION_ERROR' }),
  message: z.string().openapi({ example: 'Invalid request body' }),
  validation_errors: z.array(
    z.object({
      path: z.string().openapi({ example: 'name' }),
      message: z.string().openapi({ example: 'Must be at least 3 characters' }),
    })
  ).openapi({
    example: [
      { path: 'name', message: 'Must be at least 3 characters' },
      { path: 'branch', message: 'Required field' },
    ],
  }),
}).openapi('ValidationErrorResponse');

export const PaginationMetaSchema = z.object({
  total: z.number().openapi({ example: 42 }),
  page: z.number().optional().openapi({ example: 1 }),
  per_page: z.number().optional().openapi({ example: 20 }),
}).openapi('PaginationMeta');
