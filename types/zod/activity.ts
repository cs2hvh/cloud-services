import { z } from "zod";

// Schema for adding a new activity
export const addActivitySchema = z.object({
  cluster_name: z.string().min(1, "Cluster name is required"),
  cluster_type: z.string().min(1, "Cluster type is required"),
  action: z.string().min(1, "Action is required"),
  created_at: z.string().datetime().optional(),
  owner_id: z.string().uuid("Invalid owner ID format"),
  project_id: z.string().uuid("Invalid project ID format"),
});

// Schema for reading activities (query params)
export const readActivitiesSchema = z.object({
  project_id: z.string().uuid("Invalid project ID format"),
  limit: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 50)),
  offset: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 0)),
});

export type AddActivityInput = z.infer<typeof addActivitySchema>;
export type ReadActivitiesInput = z.infer<typeof readActivitiesSchema>;
