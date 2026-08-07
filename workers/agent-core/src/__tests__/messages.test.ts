import { describe, it, expect } from "vitest";
import { toMessages, buildInitialMessages, toToolMessage } from "../messages.js";
import type { ToolCall } from "../loop.js";

// Doc: nextstespsAI/12-agent-execution-stages.md (T1.1d)

describe("toMessages", () => {
  it("wraps a bare string as a single user turn", () => {
    expect(toMessages("hi there")).toEqual([{ role: "user", content: "hi there" }]);
  });

  it("passes through valid roles and falls back unknown roles to user", () => {
    const out = toMessages([
      { role: "system", content: "s" },
      { role: "assistant", content: "a" },
      { role: "banana", content: "x" },
    ]);
    expect(out).toEqual([
      { role: "system", content: "s" },
      { role: "assistant", content: "a" },
      { role: "user", content: "x" },
    ]);
  });

  it("stringifies non-string content (multimodal parts)", () => {
    const out = toMessages([{ role: "user", content: [{ type: "text", text: "hey" }] }]);
    expect(out[0].role).toBe("user");
    expect(out[0].content).toBe(JSON.stringify([{ type: "text", text: "hey" }]));
  });

  it("coerces null/undefined content to empty string", () => {
    expect(toMessages([{ role: "user" }])[0].content).toBe("");
  });
});

describe("buildInitialMessages", () => {
  it("prepends a system prompt when present", () => {
    expect(buildInitialMessages("be brief", "hi")).toEqual([
      { role: "system", content: "be brief" },
      { role: "user", content: "hi" },
    ]);
  });

  it("omits the system message when the prompt is null/empty/whitespace", () => {
    expect(buildInitialMessages(null, "hi")).toEqual([{ role: "user", content: "hi" }]);
    expect(buildInitialMessages("   ", "hi")).toEqual([{ role: "user", content: "hi" }]);
  });
});

describe("toToolMessage", () => {
  const call: ToolCall = { id: "c1", type: "web_search", name: "web_search", arguments: "{}" };

  it("links the tool output to the originating call id", () => {
    expect(toToolMessage(call, { rank: 1 })).toEqual({
      role: "tool",
      tool_call_id: "c1",
      content: JSON.stringify({ rank: 1 }),
    });
  });

  it("keeps string output verbatim", () => {
    expect(toToolMessage(call, "plain").content).toBe("plain");
  });
});
