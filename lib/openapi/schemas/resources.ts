import { z } from "@/lib/openapi/init";

export const ResourceTypeSchema = z
  .enum([
    "vps",
    "vds",
    "game",
    "database",
    "object-storage",
    "kubernetes",
    "network-ddos",
    "platform-apps",
    "compute",
    "gpu",
    "security",
    "ai-deployment",
    "app-deployment",
  ])
  .openapi("ResourceType");

export const ResourcePlanSchema = z
  .object({
    plan_id: z.string().uuid().openapi({ example: "f15eca8f-032e-4c35-99ee-b5a15f1ec18a" }),
    name: z.string().nullable().openapi({ example: "Starter DB Plan" }),
    description: z.string().nullable().openapi({ example: "General-purpose managed database plan." }),
    type: ResourceTypeSchema.openapi({ example: "database" }),
    sub_type: z.string().nullable().openapi({ example: "postgresql" }),
  })
  .openapi("ResourcePlan");

export const ResourcePlanListResponseSchema = z
  .object({
    data: z.array(ResourcePlanSchema),
    meta: z.object({
      total: z.number().openapi({ example: 12 }),
      type: ResourceTypeSchema.optional().openapi({ example: "database" }),
    }),
  })
  .openapi("ResourcePlanListResponse");

