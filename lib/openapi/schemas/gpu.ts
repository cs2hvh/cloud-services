import { z } from "@/lib/openapi/init";
import { PaginationMetaSchema } from "@/lib/openapi/schemas/common";
import {
  gpuPowerActionSchema,
  gpuV1PodCreateSchema,
  gpuV1VolumeCreateSchema,
} from "@/lib/validation/gpu";

export const GpuPodCreateRequestSchema =
  gpuV1PodCreateSchema.openapi("GpuPodCreateRequest");
export const GpuPodPowerRequestSchema =
  gpuPowerActionSchema.openapi("GpuPodPowerRequest");

export const GpuInventoryItemSchema = z.object({
  gpu_catalog_id: z.string().openapi({ example: "h100-80gb-hbm3" }),
  display_name: z.string().openapi({ example: "H100 SXM (80 GB)" }),
  memory_gb: z.number().int().openapi({ example: 80 }),
  cloud_type: z.literal("SECURE").openapi({ example: "SECURE" }),
  stock_status: z.enum(["high", "medium", "low", "none"]).openapi({ example: "high" }),
  available_counts: z.array(z.number().int()).openapi({ example: [1, 2, 4, 8] }),
  on_demand_price_per_gpu_hour: z.number().nullable().openapi({
    example: 2.5,
    description: "Customer resale price per GPU-hour, including markup and pricing floor.",
  }),
  spot_price_per_gpu_hour: z.number().nullable().openapi({
    example: 1.8,
    description: "Customer resale spot price per GPU-hour.",
  }),
  observed_at: z.string().datetime().openapi({ example: "2026-06-05T12:34:56Z" }),
}).openapi("GpuInventoryItem");

export const GpuTemplateSchema = z.object({
  id: z.string().openapi({ example: "pytorch-cuda-12" }),
  name: z.string().openapi({ example: "PyTorch 2.3 + CUDA 12.1" }),
  image_name: z.string().openapi({ example: "ghcr.io/example/gpu-pytorch:latest" }),
  description: z.string().nullable(),
  category: z.enum(["base", "frameworks", "llm-serving", "image-gen"]),
  ports: z.array(z.string()).openapi({ example: ["22/tcp", "8888/http"] }),
  default_container_disk_gb: z.number().int().openapi({ example: 80 }),
  env_hints: z.record(z.string()).nullable(),
  sort_order: z.number().int(),
}).openapi("GpuTemplate");

export const GpuPodSummarySchema = z.object({
  id: z.number().int().openapi({ example: 42 }),
  name: z.string().openapi({ example: "training-run-1" }),
  status: z.enum([
    "provisioning",
    "running",
    "stopped",
    "restarting",
    "terminated",
    "failed",
    "interrupted",
  ]),
  gpu_catalog_id: z.string().openapi({ example: "h100-80gb-hbm3" }),
  gpu_count: z.number().int().openapi({ example: 2 }),
  cloud_type: z.enum(["SECURE", "COMMUNITY"]),
  interruptible: z.boolean(),
  public_ip: z.string().nullable(),
  port_mappings: z.record(z.number().int()).nullable(),
  hourly_cost_usd: z.number().openapi({ example: 5 }),
  created_at: z.string().datetime(),
}).openapi("GpuPodSummary");

export const GpuPodDetailSchema = GpuPodSummarySchema.extend({
  image_name: z.string(),
  template_id: z.string().nullable(),
  container_disk_gb: z.number().int(),
  volume_gb: z.number().int(),
  ports: z.array(z.string()),
  env_keys: z.array(z.string()),
  ssh_command: z.string().nullable(),
  billing_start: z.string().datetime().nullable(),
  billing_end: z.string().datetime().nullable(),
}).openapi("GpuPodDetail");

export const GpuPodCreatedSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  status: z.string(),
  public_ip: z.string().nullable(),
  port_mappings: z.record(z.number().int()),
  hourly_cost_usd: z.number(),
  ssh_command: z.string().nullable(),
}).openapi("GpuPodCreated");

export const GpuPodPowerResultSchema = z.object({
  id: z.number().int(),
  action: z.enum(["start", "stop", "restart"]),
  status: z.string(),
}).openapi("GpuPodPowerResult");

export const GpuPodDeleteResultSchema = z.object({
  id: z.number().int(),
  deleted: z.literal(true),
  final_charge_usd: z.number(),
}).openapi("GpuPodDeleteResult");

export const GpuInventoryListResponseSchema = z.object({
  data: z.array(GpuInventoryItemSchema),
  meta: PaginationMetaSchema,
}).openapi("GpuInventoryListResponse");

export const GpuTemplateListResponseSchema = z.object({
  data: z.array(GpuTemplateSchema),
  meta: PaginationMetaSchema,
}).openapi("GpuTemplateListResponse");

export const GpuPodListResponseSchema = z.object({
  data: z.array(GpuPodSummarySchema),
  meta: PaginationMetaSchema,
}).openapi("GpuPodListResponse");

export const GpuPodResponseSchema = z.object({
  data: GpuPodDetailSchema,
}).openapi("GpuPodResponse");

export const GpuPodCreatedResponseSchema = z.object({
  data: GpuPodCreatedSchema,
}).openapi("GpuPodCreatedResponse");

export const GpuPodPowerResponseSchema = z.object({
  data: GpuPodPowerResultSchema,
}).openapi("GpuPodPowerResponse");

export const GpuPodDeleteResponseSchema = z.object({
  data: GpuPodDeleteResultSchema,
}).openapi("GpuPodDeleteResponse");

export const GpuVolumeCreateRequestSchema =
  gpuV1VolumeCreateSchema.openapi("GpuVolumeCreateRequest");

export const GpuVolumeSchema = z.object({
  id: z.number().int().openapi({ example: 7 }),
  name: z.string().openapi({ example: "training-data" }),
  size_gb: z.number().int().openapi({ example: 500 }),
  data_center_id: z.string().openapi({ example: "US-TX-3" }),
  status: z.enum(["creating", "available", "attached", "error", "deleted"]),
  monthly_cost_usd: z.number().openapi({
    example: 43.75,
    description: "Customer resale price per month. Provider costs are not exposed.",
  }),
  created_at: z.string().datetime(),
}).openapi("GpuVolume");

export const GpuVolumeDeleteResultSchema = z.object({
  id: z.number().int(),
  deleted: z.literal(true),
}).openapi("GpuVolumeDeleteResult");

export const GpuVolumeListResponseSchema = z.object({
  data: z.array(GpuVolumeSchema),
  meta: PaginationMetaSchema,
}).openapi("GpuVolumeListResponse");

export const GpuVolumeResponseSchema = z.object({
  data: GpuVolumeSchema,
}).openapi("GpuVolumeResponse");

export const GpuVolumeDeleteResponseSchema = z.object({
  data: GpuVolumeDeleteResultSchema,
}).openapi("GpuVolumeDeleteResponse");
