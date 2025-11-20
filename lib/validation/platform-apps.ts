import { z } from "zod";
import { NAMING_RULES } from "./constants";

// Validation schemas for platform apps

export const createPlatformAppSchema = z.object({
  name: z
    .string()
    .min(NAMING_RULES.MIN_CLUSTER_NAME_LENGTH, "App name must be at least 3 characters")
    .max(NAMING_RULES.MAX_CLUSTER_NAME_LENGTH, "App name must be at most 63 characters")
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "App name must contain only lowercase letters, numbers, and hyphens"),
  
  git_provider: z.enum(["github", "gitlab", "bitbucket"], {
    errorMap: () => ({ message: "Git provider must be github, gitlab, or bitbucket" }),
  }),
  
  repository_id: z.string().min(1, "Repository ID is required"),
  repository_name: z.string().min(1, "Repository name is required"),
  repository_url: z.string().url("Repository URL must be a valid URL"),
  
  branch: z.string().min(1, "Branch name is required").default("main"),
  
  framework: z.enum([
    "simple-test",
    "Next.js", 
    "React", 
    "Vue.js", 
    "Node.js", 
    "express", 
    "python",
    "django",
    "flask",
    "fastapi",
    "Static"
  ], {
    errorMap: () => ({ message: "Invalid framework selection" }),
  }),
  
  build_command: z.string().optional(),
  output_directory: z.string().optional(),
  
  project_id: z.string().uuid("Project ID must be a valid UUID").optional(),
  
  env_vars: z.array(
    z.object({
      key: z.string().min(1, "Environment variable key is required"),
      value: z.string().min(1, "Environment variable value is required"),
    })
  ).optional().default([]),
});

export type CreatePlatformAppPayload = z.infer<typeof createPlatformAppSchema>;

export const updatePlatformAppSchema = z.object({
  app_id: z.string().uuid("App ID must be a valid UUID"),
  
  name: z.string().min(NAMING_RULES.MIN_CLUSTER_NAME_LENGTH).max(NAMING_RULES.MAX_CLUSTER_NAME_LENGTH).optional(),
  branch: z.string().min(1).optional(),
  framework: z.enum([
    "simple-test",
    "Next.js", 
    "React", 
    "Vue.js", 
    "Node.js", 
    "express", 
    "python",
    "django",
    "flask",
    "fastapi",
    "Static"
  ]).optional(),
  build_command: z.string().optional(),
  output_directory: z.string().optional(),
  status: z.enum(["pending", "building", "running", "failed", "stopped"]).optional(),
  deployment_url: z.string().url().optional(),
});

export type UpdatePlatformAppPayload = z.infer<typeof updatePlatformAppSchema>;

export const deletePlatformAppSchema = z.object({
  app_id: z.string().uuid("App ID must be a valid UUID"),
});

export type DeletePlatformAppPayload = z.infer<typeof deletePlatformAppSchema>;

export const getPlatformAppSchema = z.object({
  app_id: z.string().uuid("App ID must be a valid UUID"),
});

export type GetPlatformAppPayload = z.infer<typeof getPlatformAppSchema>;

export const updateEnvVarsSchema = z.object({
  app_id: z.string().uuid("App ID must be a valid UUID"),
  env_vars: z.array(
    z.object({
      key: z.string().min(1, "Environment variable key is required"),
      value: z.string().min(1, "Environment variable value is required"),
    })
  ),
});

export type UpdateEnvVarsPayload = z.infer<typeof updateEnvVarsSchema>;
