import { z } from '@/lib/openapi/init';

import { PaginationMetaSchema } from '@/lib/openapi/schemas/common';

const EnvVarSchema = z.object({
  key: z.string().openapi({ example: 'DATABASE_URL', description: 'Environment variable key' }),
  value: z.string().openapi({ example: 'postgres://user:pass@host:5432/db', description: 'Environment variable value' }),
}).openapi('EnvVar');

const ApplyStatusSchema = z.object({
  applied_live: z.boolean().openapi({ example: true, description: 'Whether changes were applied to the running app' }),
  requires_redeploy: z.boolean().openapi({ example: false, description: 'Whether a redeploy is needed' }),
  mode: z.string().openapi({ example: 'live', description: 'Apply mode (live, persisted_only)' }),
  reason: z.string().optional().openapi({ description: 'Reason for the apply result' }),
  hint: z.string().optional().openapi({ description: 'Suggested next step' }),
  ignored_keys: z.array(z.string()).optional().openapi({ example: [], description: 'Keys ignored by the framework' }),
}).openapi('ApplyStatus');

export const EnvVarsListResponseSchema = z.object({
  data: z.object({
    app_id: z.string().uuid().openapi({ example: '8bdf284c-d3df-40f0-9565-b6e26f588c83' }),
    framework: z.string().nullable().openapi({ example: 'Next.js' }),
    env_vars: z.array(EnvVarSchema),
  }),
  meta: PaginationMetaSchema,
}).openapi('EnvVarsListResponse');

export const EnvVarsReplaceRequestSchema = z.object({
  env_vars: z.array(EnvVarSchema).openapi({ description: 'Full list of environment variables to set (replaces all existing)' }),
}).openapi('EnvVarsReplaceRequest');

export const EnvVarsReplaceResponseSchema = z.object({
  data: z.object({
    app_id: z.string().uuid().openapi({ example: '8bdf284c-d3df-40f0-9565-b6e26f588c83' }),
    framework: z.string().nullable().openapi({ example: 'Next.js' }),
    env_vars: z.array(EnvVarSchema),
    apply: ApplyStatusSchema,
  }),
}).openapi('EnvVarsReplaceResponse');

export const EnvVarDeleteResponseSchema = z.object({
  data: z.object({
    app_id: z.string().uuid().openapi({ example: '8bdf284c-d3df-40f0-9565-b6e26f588c83' }),
    deleted_key: z.string().openapi({ example: 'OLD_SECRET', description: 'The key that was deleted' }),
    env_vars: z.array(EnvVarSchema).openapi({ description: 'Remaining environment variables' }),
    apply: ApplyStatusSchema,
  }),
}).openapi('EnvVarDeleteResponse');

export const EnvVarGetResponseSchema = z.object({
  data: z.object({
    app_id: z.string().uuid().openapi({ example: '8bdf284c-d3df-40f0-9565-b6e26f588c83' }),
    key: z.string().openapi({ example: 'DATABASE_URL', description: 'Environment variable key' }),
    value: z.string().openapi({ example: 'postgres://user:pass@host:5432/db', description: 'Environment variable value' }),
  }),
}).openapi('EnvVarGetResponse');
