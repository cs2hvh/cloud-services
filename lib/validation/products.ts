import { z } from "zod";

export const createProductSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  type: z.enum(["database" , "object-storage" ,"network-ddos" , "vps" , "vds" , "game","kubernetes","platform-apps"]),
  sub: z.enum(["mysql", "pg", "mongodb","object-storage","network-ddos","kubernetes","small","medium","large"], {
    errorMap: () => ({ message: "Invalid product subtype" }),
  }),
  price: z.number().min(0, "Price must be non-negative"),
  fixed_price: z.number().min(0).optional().nullable(),
  resources: z.object({
    cpu: z.number().min(0, "CPU must be non-negative"),
    ram: z.number().min(0, "RAM must be non-negative"),
    storage: z.number().min(0, "Storage must be non-negative"),
  }),
  discount: z.number().min(0).max(100).optional(),
  slug: z.string().optional(),
});

export const updateProductSchema = z.object({
  id: z.string().uuid("Invalid product ID"),
  name: z.string().min(1, "Name is required").optional(),
  description: z.string().optional(),
  price: z.number().positive("Price must be positive").optional(),
  fixed_price: z.number().min(0).optional().nullable(),
  resources: z
    .object({
      cpu: z.number().positive("CPU must be positive"),
      ram: z.number().positive("RAM must be positive"),
      storage: z.number().positive("Storage must be positive"),
    })
    .optional(),
  discount: z.number().min(0).max(100).optional(),
  slug: z.string().optional(),
});

export const deleteProductSchema = z.object({
  id: z.string().uuid("Invalid product ID"),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type DeleteProductInput = z.infer<typeof deleteProductSchema>;
