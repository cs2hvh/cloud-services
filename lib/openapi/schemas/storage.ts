import { z } from '@/lib/openapi/init';

import { PaginationMetaSchema } from '@/lib/openapi/schemas/common';

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
