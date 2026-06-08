import { z } from "@/lib/openapi/init";

const portSchema = z
  .string()
  .regex(/^\d{1,5}\/(tcp|http)$/, {
    message: "Port must use <port>/tcp or <port>/http format",
  })
  .refine((value) => {
    const port = Number(value.split("/", 1)[0]);
    return Number.isInteger(port) && port >= 1 && port <= 65_535;
  }, "Port must be between 1 and 65535");

const envSchema = z
  .record(z.string().max(16_384))
  .superRefine((env, ctx) => {
    for (const key of Object.keys(env)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: "Environment variable name is invalid",
        });
      }
    }
  });

export const gpuPowerActionSchema = z.object({
  action: z.enum(["start", "stop", "restart"]),
});

export const gpuV1PodCreateSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,62}[a-zA-Z0-9])?$/),
    gpu_catalog_id: z.string().min(1).max(128),
    gpu_count: z.number().int().min(1).max(8).default(1),
    interruptible: z.boolean().default(false),
    image_name: z.string().min(1).max(256).optional(),
    template_id: z.string().min(1).max(128).optional(),
    container_disk_gb: z.number().int().min(10).max(2000).optional(),
    volume_gb: z.number().int().min(0).max(2000).optional(),
    data_center_ids: z.array(z.string().min(1).max(32)).max(20).optional(),
    ports: z.array(portSchema).max(50).optional(),
    env: envSchema.optional(),
    public_key: z.string().min(1).max(16_384).optional(),
    root_password: z.string().min(12).max(256).optional(),
  })
  .refine((value) => !(value.public_key && value.root_password), {
    message: "public_key and root_password are mutually exclusive",
    path: ["root_password"],
  })
  .refine((value) => Boolean(value.template_id || value.image_name), {
    message: "template_id or image_name is required",
    path: ["image_name"],
  });

export const gpuV1VolumeCreateSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9]([a-zA-Z0-9 _-]{0,62}[a-zA-Z0-9])?$/, {
      message: "Volume name contains unsupported characters",
    }),
  size_gb: z.number().int().min(1).max(4000),
  data_center_id: z.string().min(1).max(32),
});

export type GpuPowerActionInput = z.infer<typeof gpuPowerActionSchema>;
export type GpuV1VolumeCreateInput = z.infer<typeof gpuV1VolumeCreateSchema>;
