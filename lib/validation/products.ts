import { z } from "zod";

export const createProductSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  type: z.enum(["database" , "object-storage" ,"network-ddos" , "vps" , "vds" , "game"]),
  sub: z.enum(["mysql", "pg", "mongodb","object-storage","network-ddos","kubernetes"], {
    errorMap: () => ({ message: "Invalid database type" }),
  }),
  price: z.number().positive("Price must be positive"),
  fixed_price: z.number().min(0).optional().nullable(),
  resources: z.object({
    cpu: z.number().positive("CPU must be positive"),
    ram: z.number().positive("RAM must be positive"),
    storage: z.number().positive("Storage must be positive"),
  }),
  discount: z.number().min(0).max(100).optional().nullable(),
  slug: z.string().optional().nullable(),
});

export const updateProductSchema = z.object({
  id: z.string().uuid("Invalid product ID"),
  name: z.string().min(1, "Name is required").optional(),
  description: z.string().optional().nullable(),
  price: z.number().positive("Price must be positive").optional(),
  fixed_price: z.number().min(0).optional().nullable(),
  resources: z
    .object({
      cpu: z.number().positive("CPU must be positive"),
      ram: z.number().positive("RAM must be positive"),
      storage: z.number().positive("Storage must be positive"),
    })
    .optional(),
  discount: z.number().min(0).max(100).optional().nullable(),
  slug: z.string().optional().nullable(),
});

export const deleteProductSchema = z.object({
  id: z.string().uuid("Invalid product ID"),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type DeleteProductInput = z.infer<typeof deleteProductSchema>;
