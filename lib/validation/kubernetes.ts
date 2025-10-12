import { z } from "zod";

export const kubernetesClusterSchema = z.object({
  name: z.string()
    .min(3, "Name must be at least 3 characters")
    .regex(/^(?=.*[a-zA-Z].*[a-zA-Z])[a-zA-Z0-9-]+$/, "Name must contain at least 2 letters and only alphanumeric characters or hyphens"),
  nodes: z.number()
    .min(1, "Must have at least 1 node")
    .nonnegative("Number of nodes cannot be negative")
    .int("Number of nodes must be a whole number")
});