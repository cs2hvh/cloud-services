import { z } from "zod";

export const createProductSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  short_description: z.string().optional(),
  type: z.enum([
    "database",
    "object-storage",
    "network-ddos",
    "vps",
    "vds",
    "game",
    "kubernetes",
    "platform-apps",
    "compute",
    "gpu",
    "security",
    "ai-deployment",
    "app-deployment",
    "inference_vector",
    "custom_image",
  ]),
  sub: z.string().optional(),
  price: z.number().min(0, "Price must be non-negative"),
  yearly_price: z.number().min(0).optional().nullable(),
  billing_period: z.string().optional(),
  fixed_price: z.number().min(0).optional().nullable(),
  resources: z.object({
    cpu: z.number().min(0, "CPU must be non-negative"),
    ram: z.number().min(0, "RAM must be non-negative"),
    storage: z.number().min(0, "Storage must be non-negative"),
  }),
  specs: z.array(z.string()).optional(),
  features: z.array(z.string()).optional(),
  summary: z.object({
    billing: z.string().optional(),
    support: z.string().optional(),
    provisioning: z.string().optional(),
    guarantee: z.string().optional(),
    buttonText: z.string().optional(),
  }).optional().nullable(),
  is_featured: z.boolean().optional(),
  is_highlighted: z.boolean().optional(),
  cta_text: z.string().optional(),
  cta_link: z.string().optional(),
  sort_order: z.number().int().optional(),
  discount: z.number().min(0).max(100).optional(),
  slug: z.string().optional(),
  cpu_type: z.enum(['basic', 'general_purpose', 'storage_optimized', 'shared', 'dedicated', 'gpu']).optional(),
  machine_type: z.string().optional(),
});

export const updateProductSchema = z.object({
  id: z.string().uuid("Invalid product ID"),
  name: z.string().min(1, "Name is required").optional(),
  description: z.string().optional(),
  short_description: z.string().optional(),
  type: createProductSchema.shape.type.optional(),
  price: z.number().min(0).optional(),
  yearly_price: z.number().min(0).optional().nullable(),
  billing_period: z.string().optional(),
  fixed_price: z.number().min(0).optional().nullable(),
  resources: z
    .object({
      cpu: z.number().min(0),
      ram: z.number().min(0),
      storage: z.number().min(0),
    })
    .optional(),
  specs: z.array(z.string()).optional(),
  features: z.array(z.string()).optional(),
  summary: z.object({
    billing: z.string().optional(),
    support: z.string().optional(),
    provisioning: z.string().optional(),
    guarantee: z.string().optional(),
    buttonText: z.string().optional(),
  }).optional(),
  is_featured: z.boolean().optional(),
  is_highlighted: z.boolean().optional(),
  cta_text: z.string().optional(),
  cta_link: z.string().optional(),
  sort_order: z.number().int().optional(),
  discount: z.number().min(0).max(100).optional(),
  slug: z.string().optional(),
  cpu_type: z.enum(['basic', 'general_purpose', 'storage_optimized', 'shared', 'dedicated', 'gpu']).optional(),
  machine_type: z.string().optional(),
});

export const deleteProductSchema = z.object({
  id: z.string().uuid("Invalid product ID"),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type DeleteProductInput = z.infer<typeof deleteProductSchema>;
