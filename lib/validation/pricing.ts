import { z } from "zod";

// Category schemas - matches form fields and DB columns
export const createCategorySchema = z.object({
  label: z.string().min(1, "Label is required"),
  slug: z.string().min(1, "Slug is required"),
  description: z.string().optional().nullable(),
  starting_price_label: z.string().optional().nullable(),
  starting_price_description: z.string().optional().nullable(),
  sort_order: z.number().int().default(0),
  active: z.boolean().default(true),
});

export const updateCategorySchema = z.object({
  id: z.union([z.string(), z.number()]).transform(val => String(val)),
  label: z.string().min(1, "Label is required").optional(),
  slug: z.string().min(1, "Slug is required").optional(),
  description: z.string().optional().nullable(),
  starting_price_label: z.string().optional().nullable(),
  starting_price_description: z.string().optional().nullable(),
  sort_order: z.number().int().optional(),
  active: z.boolean().optional(),
});

export const deleteCategorySchema = z.object({
  id: z.union([z.string(), z.number()]).transform(val => String(val)),
});

// Promo schemas - matches types.ts
export const createPromoSchema = z.object({
  category_slug: z.string().min(1, "Category is required"),
  badge: z.string().min(1, "Badge is required"),
  badge_note: z.string().optional().nullable(),
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  subtext: z.string().optional().nullable(),
  price_old: z.string().optional().nullable(),
  price_current: z.string().optional().nullable(),
  link_text: z.string().min(1, "Link text is required"),
  link_href: z.string().min(1, "Link URL is required"),
  sort_order: z.number().int().default(0),
  active: z.boolean().default(true),
});

export const updatePromoSchema = z.object({
  id: z.string().uuid("Invalid promo ID"),
  category_slug: z.string().min(1, "Category is required").optional(),
  badge: z.string().optional(),
  badge_note: z.string().optional().nullable(),
  title: z.string().optional(),
  description: z.string().optional(),
  subtext: z.string().optional().nullable(),
  price_old: z.string().optional().nullable(),
  price_current: z.string().optional().nullable(),
  link_text: z.string().optional(),
  link_href: z.string().optional(),
  sort_order: z.number().int().optional(),
  active: z.boolean().optional(),
});

export const deletePromoSchema = z.object({
  id: z.string().uuid("Invalid promo ID"),
});

// Plan/Product pricing schemas (extends existing product)
export const createPlanSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum([
    "compute",
    "gpu",
    "object-storage",
    "database",
    "security",
    "kubernetes",
    "ai-deployment",
    "app-deployment",
    "network-ddos",
    "vps",
    "vds",
    "game",
    "platform-apps",
  ]),
  sub: z.string().optional(),
  description: z.string().optional(),
  short_description: z.string().optional(),
  price: z.number().min(0, "Price must be non-negative"),
  yearly_price: z.number().min(0).optional(),
  billing_period: z.string().optional(),
  resources: z.object({
    cpu: z.number().min(0).default(0),
    ram: z.number().min(0).default(0),
    storage: z.number().min(0).default(0),
  }).optional(),
  specs: z.array(z.string()).optional(),
  features: z.array(z.string()).optional(),
  summary: z.object({
    billing: z.string().optional(),
    support: z.string().optional(),
    provisioning: z.string().optional(),
    guarantee: z.string().optional(),
    buttonText: z.string().optional(),
  }).optional(),
  is_featured: z.boolean().default(false),
  is_highlighted: z.boolean().default(false),
  cta_text: z.string().optional(),
  cta_link: z.string().optional(),
  sort_order: z.number().int().default(0),
  discount: z.number().min(0).max(100).optional(),
});

export const updatePlanSchema = z.object({
  id: z.string().uuid("Invalid plan ID"),
  name: z.string().min(1, "Name is required").optional(),
  type: z.enum([
    "compute",
    "gpu",
    "object-storage",
    "database",
    "security",
    "kubernetes",
    "ai-deployment",
    "app-deployment",
    "network-ddos",
    "vps",
    "vds",
    "game",
    "platform-apps",
  ]).optional(),
  sub: z.string().optional(),
  description: z.string().optional(),
  short_description: z.string().optional(),
  price: z.number().min(0).optional(),
  yearly_price: z.number().min(0).optional(),
  billing_period: z.string().optional(),
  resources: z.object({
    cpu: z.number().min(0),
    ram: z.number().min(0),
    storage: z.number().min(0),
  }).optional(),
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
});

// Types
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type DeleteCategoryInput = z.infer<typeof deleteCategorySchema>;

export type CreatePromoInput = z.infer<typeof createPromoSchema>;
export type UpdatePromoInput = z.infer<typeof updatePromoSchema>;
export type DeletePromoInput = z.infer<typeof deletePromoSchema>;

export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
