import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be at most 100 characters"),
  description: z.string().max(1000, "Description must be at most 1000 characters").optional(),
});

export const updateProjectSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(100, "Name must be at most 100 characters").optional(),
    description: z.string().max(1000, "Description must be at most 1000 characters").optional(),
  })
  .refine((data) => data.name !== undefined || data.description !== undefined, {
    message: "At least one field must be provided",
    path: ["name"],
  });

export type CreateProjectPayload = z.infer<typeof createProjectSchema>;
export type UpdateProjectPayload = z.infer<typeof updateProjectSchema>;
