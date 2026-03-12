import { z } from "@/lib/openapi/init";

import { PaginationMetaSchema } from "@/lib/openapi/schemas/common";

export const ProjectSchema = z
  .object({
    id: z.string().uuid().openapi({ example: "77ef5894-cc88-468d-98f4-6e861c24be86" }),
    name: z.string().openapi({ example: "Production Services" }),
    description: z.string().nullable().openapi({ example: "Core production workloads" }),
    owner_id: z.string().uuid().nullable().openapi({ example: "ccf391ef-271b-45e7-9799-3b1be3422363" }),
    users: z.array(z.string().uuid()).openapi({ example: ["ccf391ef-271b-45e7-9799-3b1be3422363"] }),
    created_at: z.string().datetime().nullable().openapi({ example: "2026-03-09T05:30:00Z" }),
    default_project: z.boolean().nullable().openapi({ example: false }),
  })
  .openapi("Project");

export const CreateProjectRequestSchema = z
  .object({
    name: z.string().min(1).max(100).openapi({ example: "Production Services" }),
    description: z.string().max(1000).optional().openapi({ example: "Core production workloads" }),
  })
  .openapi("CreateProjectRequest");

export const UpdateProjectRequestSchema = z
  .object({
    name: z.string().min(1).max(100).optional().openapi({ example: "Production Services v2" }),
    description: z.string().max(1000).optional().openapi({ example: "Updated project description" }),
  })
  .openapi("UpdateProjectRequest");

export const ProjectListResponseSchema = z
  .object({
    data: z.array(ProjectSchema),
    meta: PaginationMetaSchema,
  })
  .openapi("ProjectListResponse");

export const ProjectResponseSchema = z
  .object({
    data: ProjectSchema,
  })
  .openapi("ProjectResponse");

export const ProjectDeleteResponseSchema = z
  .object({
    data: z.object({
      id: z.string().uuid(),
      name: z.string(),
      deleted: z.boolean().openapi({ example: true }),
    }),
  })
  .openapi("ProjectDeleteResponse");
