/**
 * Zod schemas for the agentcore agent CRUD API (T1.4b).
 *
 * Pure — no server deps — so both /api/agents routes and unit tests import it.
 */
import { z } from "zod";

export const toolSchema = z
  .object({ type: z.enum(["web_search", "file_search", "code", "memory", "function", "mcp"]) })
  .passthrough();

export const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  model: z.string().min(1),
  system_prompt: z.string().max(20000).optional().nullable(),
  tools: z.array(toolSchema).max(20).optional(),
  memory_policy: z.record(z.unknown()).optional(),
  guardrail: z.enum(["off", "warn", "block"]).optional(),
  max_steps: z.number().int().min(1).max(100).optional(),
  max_cost_cents: z.number().int().positive().max(1_000_000).optional(),
});

export const updateAgentSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    model: z.string().min(1).optional(),
    system_prompt: z.string().max(20000).optional().nullable(),
    tools: z.array(toolSchema).max(20).optional(),
    memory_policy: z.record(z.unknown()).optional(),
    guardrail: z.enum(["off", "warn", "block"]).optional(),
    max_steps: z.number().int().min(1).max(100).optional(),
    max_cost_cents: z.number().int().positive().max(1_000_000).optional(),
    is_active: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "No fields to update" });

export type CreateAgentInput = z.infer<typeof createAgentSchema>;
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;

/** Dashboard-initiated run (playground). Either a stored agent_id, or an inline
 *  model + required cost ceiling — same contract as the gateway's /v1/responses. */
export const createRunSchema = z
  .object({
    agent_id: z.string().uuid().optional(),
    model: z.string().min(1).optional(),
    system_prompt: z.string().max(20000).optional(),
    input: z.union([z.string().min(1), z.array(z.record(z.unknown())).min(1)]),
    max_cost_cents: z.number().int().positive().max(1_000_000).optional(),
    previous_response_id: z.string().uuid().optional(),
  })
  .refine((d) => d.agent_id || d.model, { message: "Either agent_id or model is required" })
  .refine((d) => d.agent_id || d.max_cost_cents != null, {
    message: "max_cost_cents is required when no agent_id is provided",
  });

export type CreateRunInputBody = z.infer<typeof createRunSchema>;

/** Register an MCP server in the org's registry (M3, doc 14 §4). Always
 *  'private' visibility — curated rows are seeded separately (M4), never via
 *  this customer-facing route. */
export const createMcpServerSchema = z.object({
  slug: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9_-]*$/, "slug must be lowercase alphanumeric/underscore/hyphen"),
  display_name: z.string().min(1).max(100),
  server_url: z.string().url().refine((u) => u.startsWith("http://") || u.startsWith("https://"), "must be an http(s) URL"),
  auth_token: z.string().min(1).max(2000).optional(),
  allowed_tools: z.array(z.string().min(1)).max(50).optional(),
});

export type CreateMcpServerInput = z.infer<typeof createMcpServerSchema>;

/** Edit a registered MCP server (M4). `slug` is deliberately NOT editable
 *  here — it's the stable bind-key agents reference via `{server_slug}`;
 *  changing it would silently break every agent already bound to it. */
export const updateMcpServerSchema = z
  .object({
    display_name: z.string().min(1).max(100).optional(),
    server_url: z.string().url().refine((u) => u.startsWith("http://") || u.startsWith("https://"), "must be an http(s) URL").optional(),
    auth_token: z.string().min(1).max(2000).optional(),
    allowed_tools: z.array(z.string().min(1)).max(50).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "No fields to update" });

export type UpdateMcpServerInput = z.infer<typeof updateMcpServerSchema>;
