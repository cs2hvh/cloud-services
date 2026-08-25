/**
 * Agents v2 (`agentcore`) — shared type contracts.
 *
 * Doc: nextstespsAI/11-agent-implementation-plan.md · 12-agent-execution-stages.md (T0.2)
 *
 * These are the FIXED contracts every track codes against (DB row shapes, the
 * customer request/response envelope, and the SSE event union). Lock them here
 * before feature code so Track A (runner), Track B (gateway), and Track C
 * (control-plane + UI) never block on each other.
 *
 * DB row types mirror the columns in
 * supabase/migrations/20260701000001_agentcore_schema.sql exactly.
 */

// ── Tool declarations (what a customer attaches to an agent) ──────────────────

/** Hosted tools we build & operate, plus the customer-extensibility channels. */
export type AgentToolType =
  | "web_search"
  | "file_search"
  | "code"
  | "memory"
  | "function"
  | "mcp"
  | "agent";

/** A hosted tool attached by name; extra fields are tool-specific config. */
export interface HostedToolDecl {
  type: "web_search" | "file_search" | "code" | "memory";
  [key: string]: unknown;
}

/**
 * An inline function tool (standard OpenAI-style function calling). Not stored
 * server-side — re-declared per request. The runner POSTs `webhook_url` when the
 * model calls it and feeds the response back into the loop.
 */
export interface FunctionToolDecl {
  type: "function";
  name: string;
  description?: string;
  /** JSON Schema for the function parameters. */
  parameters: Record<string, unknown>;
  webhook_url: string;
  /**
   * Optional shared secret. When present, the runner HMAC-SHA256 signs each
   * webhook POST (Stripe-style: `sha256(secret, "{timestamp}.{body}")`) and sends
   * `X-Ahura-Timestamp` + `X-Ahura-Signature`, so the customer can verify the call
   * originated from us and reject replays. Carried in the decl (inline tools hold
   * their own config, §4) — never logged or echoed into the trace.
   */
  secret?: string;
}

/**
 * An MCP **client** tool (doc 14): connects to a remote MCP server, discovers
 * its tools, and advertises them (namespaced) alongside the rest. Exactly one
 * of `server_url` (inline, M1) | `server_slug` (registry, M3+) is set — both
 * resolve to the same internal config shape, so the adapter is agnostic to
 * where the config came from.
 */
export interface McpToolDecl {
  type: "mcp";
  /** Inline mode (M1): a remote Streamable HTTP MCP server URL. */
  server_url?: string;
  /** Registry mode (M3+): resolved from agentcore.mcp_servers by slug. */
  server_slug?: string;
  /** Namespaces this server's tools (a-z0-9_); defaults from host/slug. */
  label?: string;
  /** Inline-mode bearer token (registry mode stores it encrypted server-side). */
  auth_token?: string;
  /** Bind only these vetted tools; absent = all the server offers. */
  allowed_tools?: string[];
}

/**
 * Agent-delegation tool (doc 02 Service G's "A2A" half — scoped narrowly, per
 * doc 02's own note: "v1 should be internal-only, one of our agents calling
 * another as a tool," explicitly not full Google A2A protocol compliance.
 * This agent calls another agent IN THE SAME ORG as a real, independently
 * traced+billed agentcore.runs row (parent_run_id/depth) — not a wire
 * protocol. Never cross-org; see agent-delegate.ts for the depth guard.
 */
export interface AgentDelegateToolDecl {
  type: "agent";
  target_agent_id: string;
  /** Namespaces the model-facing tool name (agent__{label}) — required because
   *  an agent may delegate to several sub-agents, each needing a distinct tool
   *  name; we can't derive one from target_agent_id synchronously at dispatcher-
   *  build time (same constraint FunctionToolDecl already has for webhook tools). */
  label: string;
  /** Model-facing description — what this sub-agent is for. Same reasoning as
   *  `label`: no synchronous DB read at spec-build time to derive one. */
  description?: string;
}

export type AgentToolDecl = HostedToolDecl | FunctionToolDecl | McpToolDecl | AgentDelegateToolDecl;

// ── Agent config (agentcore.agents row) ──────────────────────────────────────

export type GuardrailMode = "off" | "warn" | "block";

export interface MemoryPolicy {
  enabled?: boolean;
  scope?: "agent" | "end_user";
  max_items?: number;
}

export interface AgentConfig {
  id: string;
  orgId: string;
  name: string;
  /** Catalog model id used for every model turn. */
  model: string;
  systemPrompt: string | null;
  tools: AgentToolDecl[];
  memoryPolicy: MemoryPolicy;
  guardrail: GuardrailMode;
  maxSteps: number;
  /** Required hard cost ceiling (cents) — the third cost-runaway gate. */
  maxCostCents: number;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Runs (agentcore.runs row) ────────────────────────────────────────────────

export type RunStatus =
  | "queued"
  | "running"
  | "requires_action"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired";

const TERMINAL_RUN_STATUSES: ReadonlySet<RunStatus> = new Set<RunStatus>([
  "completed",
  "failed",
  "cancelled",
  "expired",
]);

export function isTerminalRunStatus(status: RunStatus): boolean {
  return TERMINAL_RUN_STATUSES.has(status);
}

export interface Run {
  id: string;
  orgId: string;
  agentId: string | null;
  apiKeyId: string | null;
  billingUserId: string;
  previousResponseId: string | null;
  status: RunStatus;
  input: ResponsesInput;
  output: ResponsesOutput | null;
  stepCount: number;
  /** Running cost total (cents) — compared against maxCostCents mid-run. */
  costCents: number;
  maxCostCents: number;
  error: string | null;
  claimedBy: string | null;
  heartbeatAt: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

// ── Run steps (agentcore.run_steps row) — the trace + billing ledger ─────────

export type StepType =
  | "model"
  | "web_search"
  | "file_search"
  | "code"
  | "function"
  | "memory"
  | "mcp"
  | "agent";

export type StepStatus = "success" | "error";

export interface RunStep {
  id: number;
  runId: string;
  orgId: string;
  stepIndex: number;
  stepType: StepType;
  toolName: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  /** Tool units consumed (searches, cpu-seconds, calls). Null for model steps. */
  units: number | null;
  unitLabel: string | null;
  costCents: number;
  latencyMs: number | null;
  status: StepStatus;
  /** Brand-scrubbed args/result preview; R2 ref for large payloads. */
  detail: Record<string, unknown> | null;
  createdAt: string;
}

// ── Customer API envelope (OpenAI-Responses-compatible) ──────────────────────

/** Input is either a bare string or an OpenAI-style message array. */
export type ResponsesInput = string | Array<Record<string, unknown>>;

export interface ResponsesRequest {
  /** Reference a stored agent, OR provide model + tools inline (one required). */
  agent_id?: string;
  model?: string;
  system_prompt?: string;
  tools?: AgentToolDecl[];
  input: ResponsesInput;
  previous_response_id?: string;
  max_steps?: number;
  /** Required when no agent_id is supplied (agents carry their own ceiling). */
  max_cost_cents?: number;
  stream?: boolean;
}

/** The `202` body returned when a run is enqueued (v1 is durable-only). */
export interface ResponsesAcceptedResponse {
  id: string;
  object: "response";
  status: Extract<RunStatus, "queued">;
}

export interface ResponsesUsage {
  input_tokens: number;
  output_tokens: number;
  /** Per-tool unit counts, e.g. { web_search: 3, cpu_second: 4.2 }. */
  tools: Record<string, number>;
}

/** The final envelope surfaced on GET .../runs/{id} once completed. */
export interface ResponsesOutput {
  id: string;
  object: "response";
  status: RunStatus;
  output: Array<Record<string, unknown>>;
  usage: ResponsesUsage;
  steps: number;
  /** Brand: our own cost header, never an upstream figure. */
  x_ahura_cost_cents: number;
}

// ── SSE event union (GET .../runs/{id}/stream) ───────────────────────────────
// OpenAI-Responses-shaped event names so existing SDKs parse the stream.

export interface ResponseCreatedEvent {
  type: "response.created";
  response: { id: string; status: RunStatus };
}

export interface ResponseStepAddedEvent {
  type: "response.step.added";
  step: RunStep;
}

export interface ResponseOutputTextDeltaEvent {
  type: "response.output_text.delta";
  delta: string;
}

export interface ResponseCompletedEvent {
  type: "response.completed";
  response: ResponsesOutput;
}

export interface ResponseFailedEvent {
  type: "response.failed";
  response: { id: string; status: RunStatus; error: string };
}

export type ResponseStreamEvent =
  | ResponseCreatedEvent
  | ResponseStepAddedEvent
  | ResponseOutputTextDeltaEvent
  | ResponseCompletedEvent
  | ResponseFailedEvent;
