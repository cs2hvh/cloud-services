import { describe, it, expect } from "vitest";
import { extractToolDefs, validateToolCalls, buildToolRepairBody } from "../tool-guarantees.ts";

const getWeatherTool = {
  type: "function",
  function: {
    name: "get_weather",
    parameters: {
      type: "object",
      required: ["location"],
      properties: {
        location: { type: "string" },
        unit:     { type: "string", enum: ["celsius", "fahrenheit"] },
      },
    },
  },
};

const searchTool = {
  type: "function",
  function: {
    name: "search",
    parameters: {
      type: "object",
      required: ["query"],
      properties: { query: { type: "string" } },
    },
  },
};

// ── extractToolDefs ───────────────────────────────────────────────────────────

describe("extractToolDefs", () => {
  it("extracts function definitions from tools array", () => {
    const defs = extractToolDefs([getWeatherTool, searchTool]);
    expect(defs.size).toBe(2);
    expect(defs.has("get_weather")).toBe(true);
    expect(defs.has("search")).toBe(true);
  });

  it("ignores non-function tool types", () => {
    const tools = [{ type: "retrieval" }, getWeatherTool];
    expect(extractToolDefs(tools).size).toBe(1);
  });

  it("ignores malformed tool entries", () => {
    const tools = [null, undefined, {}, { type: "function" }, getWeatherTool];
    expect(extractToolDefs(tools as unknown[]).size).toBe(1);
  });

  it("returns empty map for empty array", () => {
    expect(extractToolDefs([]).size).toBe(0);
  });
});

// ── validateToolCalls ─────────────────────────────────────────────────────────

describe("validateToolCalls", () => {
  const toolDefs = extractToolDefs([getWeatherTool, searchTool]);

  it("returns no errors for valid tool calls", () => {
    const body = {
      choices: [{
        message: {
          tool_calls: [{
            id: "call-1",
            function: { name: "get_weather", arguments: '{"location":"New York","unit":"celsius"}' },
          }],
        },
      }],
    };
    expect(validateToolCalls(body, toolDefs)).toHaveLength(0);
  });

  it("returns errors for missing required argument", () => {
    const body = {
      choices: [{
        message: {
          tool_calls: [{
            id: "call-1",
            function: { name: "get_weather", arguments: '{"unit":"celsius"}' },
          }],
        },
      }],
    };
    const errors = validateToolCalls(body, toolDefs);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.functionName).toBe("get_weather");
    expect(errors[0]?.errors.some((e) => e.includes("location"))).toBe(true);
  });

  it("returns errors for invalid enum value", () => {
    const body = {
      choices: [{
        message: {
          tool_calls: [{
            id: "call-2",
            function: { name: "get_weather", arguments: '{"location":"NYC","unit":"kelvin"}' },
          }],
        },
      }],
    };
    const errors = validateToolCalls(body, toolDefs);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.errors.some((e) => e.includes("enum"))).toBe(true);
  });

  it("passes through unknown tool names without error", () => {
    const body = {
      choices: [{
        message: {
          tool_calls: [{ id: "x", function: { name: "unknown_tool", arguments: "{}" } }],
        },
      }],
    };
    expect(validateToolCalls(body, toolDefs)).toHaveLength(0);
  });

  it("returns empty array when there are no tool_calls", () => {
    expect(validateToolCalls({ choices: [{ message: {} }] }, toolDefs)).toHaveLength(0);
    expect(validateToolCalls({ choices: [] }, toolDefs)).toHaveLength(0);
  });
});

// ── buildToolRepairBody ───────────────────────────────────────────────────────

describe("buildToolRepairBody", () => {
  const originalBody = {
    model: "ahura/model",
    messages: [
      { role: "user", content: "What is the weather?" },
    ],
    tools: [getWeatherTool],
  };

  const badResponse = {
    choices: [{
      message: {
        role: "assistant",
        content: null,
        tool_calls: [{
          id: "call-bad",
          function: { name: "get_weather", arguments: '{"unit":"celsius"}' },
        }],
      },
    }],
  };

  const toolErrors = [{
    toolCallId: "call-bad",
    functionName: "get_weather",
    errors: ['missing required property "location"'],
  }];

  it("appends bad assistant message, tool result, and user correction", () => {
    const body = buildToolRepairBody(originalBody, badResponse, toolErrors);
    const msgs = body.messages as Array<{ role: string; content?: unknown; tool_call_id?: string }>;

    expect(msgs.length).toBe(4); // original + assistant + tool + user
    expect(msgs[0]?.role).toBe("user");
    expect(msgs[1]?.role).toBe("assistant");
    expect(msgs[2]?.role).toBe("tool");
    expect(msgs[2]?.tool_call_id).toBe("call-bad");
    expect(typeof msgs[2]?.content).toBe("string");
    expect((msgs[2]?.content as string)).toContain("VALIDATION_FAILED");
    expect(msgs[3]?.role).toBe("user");
    expect(typeof msgs[3]?.content).toBe("string");
  });

  it("preserves original body fields", () => {
    const body = buildToolRepairBody(originalBody, badResponse, toolErrors);
    expect(body.model).toBe("ahura/model");
    expect(body.tools).toBeDefined();
  });
});
