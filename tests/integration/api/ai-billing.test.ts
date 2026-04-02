import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as testAgentPost } from "@/app/api/ai-agents/[id]/test/route";
import { POST as publicChatPost } from "@/app/api/v1/agents/[endpointId]/chat/route";
import { expectResponseStatus } from "../../utils/test-helpers";

vi.mock("@/lib/auth/server-auth", () => ({
  authenticateUserFromHeader: vi.fn(),
}));

vi.mock("@/lib/cooldown/userbased", () => ({
  limitByUser: vi.fn(),
}));

vi.mock("@/lib/supabase/queries/billing", () => ({
  Billing: {
    get_balance: vi.fn(),
    deduct: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/queries/ai_agents", () => ({
  AIAgents: {
    get: vi.fn(),
    get_by_endpoint: vi.fn(),
  },
  AgentModelKeys: {
    get_key_with_provider: vi.fn(),
  },
  AgentKBChunks: {
    search: vi.fn(),
  },
  AgentConversations: {
    create: vi.fn(),
    update_stats: vi.fn(),
  },
  AgentMessages: {
    get_recent: vi.fn(),
    create: vi.fn(),
  },
  AgentUsage: {
    record: vi.fn(),
  },
  AgentApiKeys: {
    validate: vi.fn(),
    record_usage: vi.fn(),
  },
  PlatformModels: {
    get_by_model_id: vi.fn(),
    calculate_cost: vi.fn(),
  },
}));

vi.mock("@/lib/ai", () => ({
  getDefaultOpenRouterClient: vi.fn(),
  createLLMClient: vi.fn(),
  buildMessages: vi.fn(),
  buildRAGSystemPrompt: vi.fn(),
  createRAGPipeline: vi.fn(),
  calculateCost: vi.fn(),
}));

describe("AI billing routes", () => {
  const testAgent = {
    id: "agent-1",
    user_id: "owner-123",
    model_id: "openrouter/test-model",
    model_key_id: null,
    system_prompt: "You are helpful",
    max_tokens: 200,
    temperature: 0.7,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
    rag_enabled: false,
    knowledge_base_ids: [],
    similarity_threshold: 0.5,
    max_context_chunks: 5,
    use_platform_billing: true,
    is_public: true,
    require_auth: false,
    allowed_origins: [],
    rate_limit_rpm: 60,
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const { authenticateUserFromHeader } = await import("@/lib/auth/server-auth");
    vi.mocked(authenticateUserFromHeader).mockResolvedValue({
      authenticated: true,
      user: {
        id: "owner-123",
        email: "owner@example.com",
      },
      response: null,
    } as never);

    const { limitByUser } = await import("@/lib/cooldown/userbased");
    vi.mocked(limitByUser).mockResolvedValue({ allowed: true } as never);

    const { Billing } = await import("@/lib/supabase/queries/billing");
    vi.mocked(Billing.get_balance).mockResolvedValue(10);
    vi.mocked(Billing.deduct).mockResolvedValue(9.97 as never);

    const {
      AIAgents,
      AgentConversations,
      AgentMessages,
      AgentUsage,
      PlatformModels,
      AgentApiKeys,
    } = await import("@/lib/supabase/queries/ai_agents");
    vi.mocked(AIAgents.get).mockResolvedValue({
      success: true,
      data: testAgent,
    } as never);
    vi.mocked(AIAgents.get_by_endpoint).mockResolvedValue({
      success: true,
      data: testAgent,
    } as never);
    vi.mocked(AgentConversations.create).mockResolvedValue({
      success: true,
      data: { id: "conv-123" },
    } as never);
    vi.mocked(AgentConversations.update_stats).mockResolvedValue(undefined);
    vi.mocked(AgentMessages.get_recent).mockResolvedValue([]);
    vi.mocked(AgentMessages.create).mockResolvedValue(undefined);
    vi.mocked(AgentUsage.record).mockResolvedValue(undefined);
    vi.mocked(PlatformModels.get_by_model_id).mockResolvedValue({
      model_id: "openrouter/test-model",
      input_cost_per_1k: 0.001,
      output_cost_per_1k: 0.002,
    } as never);
    vi.mocked(PlatformModels.calculate_cost).mockReturnValue(0.03);
    vi.mocked(AgentApiKeys.validate).mockResolvedValue({
      valid: true,
      key: { id: "key-1" },
    } as never);
    vi.mocked(AgentApiKeys.record_usage).mockResolvedValue(undefined);

    const { getDefaultOpenRouterClient, buildMessages } = await import("@/lib/ai");
    vi.mocked(buildMessages).mockReturnValue([
      { role: "system", content: "You are helpful" },
      { role: "user", content: "Hello" },
    ] as never);
    vi.mocked(getDefaultOpenRouterClient).mockReturnValue({
      createCompletion: vi.fn().mockResolvedValue({
        choices: [{ message: { content: "Hello from model" } }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      }),
      createStreamingCompletion: vi.fn(),
      createStreamingCompletionRaw: vi.fn(),
    } as never);
  });

  it("TC-AI-BILL-001: should enforce minimum balance on /api/ai-agents/[id]/test", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    vi.mocked(Billing.get_balance).mockResolvedValueOnce(0);

    const request = new Request("http://localhost:3000/api/ai-agents/agent-1/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    });

    const response = await testAgentPost(request as NextRequest, {
      params: Promise.resolve({ id: "agent-1" }),
    });
    const data = await expectResponseStatus(response, 402);

    expect(data.error).toBe("Insufficient credits");
  });

  it("TC-AI-BILL-001: should enforce minimum balance on public chat endpoint", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    vi.mocked(Billing.get_balance).mockResolvedValueOnce(0);

    const request = new Request("http://localhost:3000/api/v1/agents/public-ep/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    });

    const response = await publicChatPost(request as NextRequest, {
      params: Promise.resolve({ endpointId: "public-ep" }),
    });
    const data = await expectResponseStatus(response, 402);

    expect(data.error).toBe("Insufficient credits");
  });

  it("TC-AI-BILL-002: should deduct credits after successful public chat response", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    const request = new Request("http://localhost:3000/api/v1/agents/public-ep/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    });

    const response = await publicChatPost(request as NextRequest, {
      params: Promise.resolve({ endpointId: "public-ep" }),
    });
    const data = await expectResponseStatus(response, 200);

    expect(data.message.content).toContain("Hello");
    expect(Billing.deduct).toHaveBeenCalledWith("owner-123", 0.03);
  });

  it("TC-AI-BILL-003: should not crash if deduction fails after response generation", async () => {
    const { Billing } = await import("@/lib/supabase/queries/billing");
    vi.mocked(Billing.deduct).mockRejectedValueOnce(new Error("Deduction failed"));

    const request = new Request("http://localhost:3000/api/v1/agents/public-ep/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    });

    const response = await publicChatPost(request as NextRequest, {
      params: Promise.resolve({ endpointId: "public-ep" }),
    });
    const data = await expectResponseStatus(response, 200);

    expect(data.message.content).toContain("Hello");
  });
});
