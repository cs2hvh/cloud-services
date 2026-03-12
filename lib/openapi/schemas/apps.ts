import { z } from '@/lib/openapi/init';

import { PaginationMetaSchema } from '@/lib/openapi/schemas/common';

export const AppSchema = z.object({
  id: z.string().uuid().openapi({ example: '8bdf284c-d3df-40f0-9565-b6e26f588c83' }),
  name: z.string().openapi({ example: 'my-awesome-app' }),
  slug: z.string().openapi({ example: 'my-awesome-app' }),
  framework: z.string().nullable().openapi({ example: 'Next.js' }),
  repository_name: z.string().openapi({ example: 'user/repo' }),
  repository_url: z.string().url().optional().openapi({ example: 'https://github.com/user/repo' }),
  branch: z.string().openapi({ example: 'main' }),
  status: z.enum(['pending', 'deploying', 'building', 'running', 'failed', 'stopped']).openapi({ example: 'running' }),
  deployment_url: z.string().url().nullable().optional().openapi({ example: 'https://my-awesome-app.example.com' }),
  port: z.number().optional().openapi({ example: 3000 }),
  ip: z.string().optional().openapi({ example: '192.168.1.1' }),
  size: z.string().optional().openapi({ example: 'small' }),
  auto_deploy: z.boolean().openapi({ example: true }),
  git_provider: z.enum(['github', 'gitlab', 'bitbucket']).openapi({ example: 'github' }),
  build_command: z.string().optional().openapi({ example: 'npm run build' }),
  output_directory: z.string().optional().openapi({ example: 'dist' }),
  created_at: z.string().datetime().openapi({ example: '2026-02-27T10:00:00Z' }),
  updated_at: z.string().datetime().openapi({ example: '2026-02-27T12:00:00Z' }),
}).openapi('App');

export const UpdateAppRequestSchema = z.object({
  name: z.string().min(3).max(40).optional().openapi({
    example: 'my-updated-app',
    description: 'App name (DNS-compatible, lowercase, 3-40 chars)',
  }),
  auto_deploy: z.boolean().optional().openapi({
    example: true,
    description: 'Enable automatic deployments on git push',
  }),
}).openapi('UpdateAppRequest');

export const AppListResponseSchema = z.object({
  data: z.array(AppSchema),
  meta: PaginationMetaSchema,
}).openapi('AppListResponse');

export const AppResponseSchema = z.object({
  data: AppSchema,
}).openapi('AppResponse');

export const AppUpdateResponseSchema = z.object({
  data: AppSchema.pick({
    id: true,
    name: true,
    slug: true,
    framework: true,
    repository_name: true,
    branch: true,
    status: true,
    deployment_url: true,
    updated_at: true,
  }),
}).openapi('AppUpdateResponse');

export const AppDeleteResponseSchema = z.object({
  data: z.object({
    id: z.string().uuid(),
    name: z.string(),
    deleted: z.boolean().openapi({ example: true }),
  }),
}).openapi('AppDeleteResponse');
