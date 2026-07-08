import { describe, it, expect, vi } from "vitest";
import { agentToolUsage } from "../agent-tool-usage.ts";
import type { AuthContext, UsageEvent } from "../../types.ts";
import { onBehalfOfKeyId, OBO_API_KEY_ID } from "../../lib/on-behalf-of.ts";

// Doc: found by the 2026-07-06 audit — agent-runner (plain Node, no
// USAGE_EVENTS queue binding) needs an HTTP bridge to get tool cost
// (web_search/code/function) into the real metering pipeline.

const oboAuth: AuthContext = {
  keyId: onBehalfOfKeyId("org_1"),
  usageApiKeyId: OBO_API_KEY_ID,
  orgId: "org_1",
  allowedModels: null,
  allowedIpCidrs: null,
  zdrEnabled: false,
  monthlyBudgetCents: null,
  hardCapCents: null,
  orgMonthlyBudgetCents: null,
  orgHardCapCents: null,
  semanticCacheEnabled: false,
  orgSemanticCacheThreshold: null,
  rateLimitRpm: null,
  billing: "platform",
};

const customerAuth: AuthContext = {
  ...oboAuth,
  keyId: "11111111-1111-1111-1111-111111111111", // a real customer key id — never `obo:`-prefixed
  usageApiKeyId: "11111111-1111-1111-1111-111111111111",
};

function makeContext(auth: AuthContext, body: unknown, sendImpl?: () => Promise<void>) {
  const sent: UsageEvent[] = [];
  const send = sendImpl ?? (async (event: UsageEvent) => { sent.push(event); });
  let jsonResult: { body: unknown; status: number } | undefined;
  const c = {
    get: (key: string) => (key === "auth" ? auth : undefined),
    req: { json: async () => body },
    env: { USAGE_EVENTS: { send } },
    json: (payload: unknown, status = 200) => {
      jsonResult = { body: payload, status };
      return jsonResult;
    },
  };
  return { c, sent, getResult: () => jsonResult! };
}

describe("agentToolUsage route", () => {
  it("rejects a request whose auth did NOT come through the on-behalf-of path", async () => {
    const { c, sent, getResult } = makeContext(customerAuth, {
      toolType: "web_search",
      unitLabel: "web_search",
      units: 1,
      requestId: "r1",
      status: "success",
    });

    await agentToolUsage(c as never);

    expect(getResult().status).toBe(403);
    expect(sent).toHaveLength(0);
  });

  it("enqueues a correctly-shaped UsageEvent for a valid on-behalf-of web_search report", async () => {
    const { c, sent, getResult } = makeContext(oboAuth, {
      toolType: "web_search",
      unitLabel: "web_search",
      units: 2,
      requestId: "run_1:0",
      status: "success",
    });

    await agentToolUsage(c as never);

    expect(getResult().status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      orgId: "org_1",
      modelId: "agent/web-search",
      modality: "agent_tool",
      unitLabel: "web_search",
      numUnits: 2,
      requestId: "run_1:0",
      status: "success",
    });
  });

  // Regression (found live, 2026-07-06): inference.usage.api_key_id is a plain
  // UUID column. Stamping auth.keyId directly would put `obo:{orgId}` there
  // for on-behalf-of calls — not a valid UUID — and the consumer's INSERT
  // failed outright (confirmed against the real DB before this fix existed).
  it("stamps a valid-UUID apiKeyId (never the raw obo:-prefixed keyId) on the emitted event", async () => {
    const { c, sent } = makeContext(oboAuth, {
      toolType: "web_search",
      unitLabel: "web_search",
      units: 1,
      requestId: "run_2:0",
      status: "success",
    });
    await agentToolUsage(c as never);

    expect(sent[0]?.apiKeyId).toBe(OBO_API_KEY_ID);
    expect(sent[0]?.apiKeyId).not.toBe(oboAuth.keyId);
    expect(sent[0]?.apiKeyId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it("maps code -> agent/code-interpreter and function -> agent/function-call", async () => {
    const codeCtx = makeContext(oboAuth, {
      toolType: "code",
      unitLabel: "cpu_second",
      units: 3.5,
      requestId: "r2",
      status: "success",
    });
    await agentToolUsage(codeCtx.c as never);
    expect(codeCtx.sent[0]?.modelId).toBe("agent/code-interpreter");

    const fnCtx = makeContext(oboAuth, {
      toolType: "function",
      unitLabel: "function_call",
      units: 1,
      requestId: "r3",
      status: "success",
    });
    await agentToolUsage(fnCtx.c as never);
    expect(fnCtx.sent[0]?.modelId).toBe("agent/function-call");
  });

  it("maps file_search to agent/file-search and BOTH memory actions to the single agent/memory row (20260703000002)", async () => {
    const fsCtx = makeContext(oboAuth, {
      toolType: "file_search",
      unitLabel: "file_search",
      units: 1,
      requestId: "r8",
      status: "success",
    });
    await agentToolUsage(fsCtx.c as never);
    expect(fsCtx.sent[0]?.modelId).toBe("agent/file-search");

    const mwCtx = makeContext(oboAuth, {
      toolType: "memory_write",
      unitLabel: "memory_write",
      units: 1,
      requestId: "r9",
      status: "success",
    });
    await agentToolUsage(mwCtx.c as never);
    expect(mwCtx.sent[0]?.modelId).toBe("agent/memory");

    const msCtx = makeContext(oboAuth, {
      toolType: "memory_search",
      unitLabel: "memory_search",
      units: 1,
      requestId: "r10",
      status: "success",
    });
    await agentToolUsage(msCtx.c as never);
    expect(msCtx.sent[0]?.modelId).toBe("agent/memory");
  });

  it("maps mcp -> agent/mcp (doc 14 M2)", async () => {
    const { c, sent } = makeContext(oboAuth, {
      toolType: "mcp",
      unitLabel: "mcp_call",
      units: 1,
      requestId: "r11",
      status: "success",
    });
    await agentToolUsage(c as never);
    expect(sent[0]?.modelId).toBe("agent/mcp");
    expect(sent[0]?.unitLabel).toBe("mcp_call");
  });

  it("maps a failed tool step to status=error_internal so it prices at 0", async () => {
    const { c, sent } = makeContext(oboAuth, {
      toolType: "web_search",
      unitLabel: "web_search",
      units: 1,
      requestId: "r4",
      status: "error",
    });
    await agentToolUsage(c as never);
    expect(sent[0]?.status).toBe("error_internal");
  });

  it("rejects an unknown toolType/unitLabel", async () => {
    const { c, getResult } = makeContext(oboAuth, {
      toolType: "sandbox_gpu",
      unitLabel: "gpu_second",
      units: 1,
      requestId: "r5",
      status: "success",
    });
    await agentToolUsage(c as never);
    expect(getResult().status).toBe(400);
  });

  it("rejects a negative or non-numeric units value", async () => {
    const { c, getResult } = makeContext(oboAuth, {
      toolType: "web_search",
      unitLabel: "web_search",
      units: -1,
      requestId: "r6",
      status: "success",
    });
    await agentToolUsage(c as never);
    expect(getResult().status).toBe(400);
  });

  it("returns 500 (not throw) when the queue enqueue fails", async () => {
    const { c, getResult } = makeContext(
      oboAuth,
      { toolType: "web_search", unitLabel: "web_search", units: 1, requestId: "r7", status: "success" },
      async () => { throw new Error("queue unavailable"); }
    );
    await agentToolUsage(c as never);
    expect(getResult().status).toBe(500);
  });
});
