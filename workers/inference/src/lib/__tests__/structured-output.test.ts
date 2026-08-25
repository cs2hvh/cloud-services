import { describe, it, expect } from "vitest";
import {
  extractJsonSchema,
  validateJsonContent,
  extractFirstContent,
  buildStructuredRetry,
} from "../structured-output.ts";

// ── extractJsonSchema ─────────────────────────────────────────────────────────

describe("extractJsonSchema", () => {
  it("returns null for non-json_schema types", () => {
    expect(extractJsonSchema({ type: "text" })).toBeNull();
    expect(extractJsonSchema(null)).toBeNull();
    expect(extractJsonSchema(undefined)).toBeNull();
    expect(extractJsonSchema("string")).toBeNull();
  });

  it("returns null when json_schema or schema is missing", () => {
    expect(extractJsonSchema({ type: "json_schema" })).toBeNull();
    expect(extractJsonSchema({ type: "json_schema", json_schema: {} })).toBeNull();
    expect(extractJsonSchema({ type: "json_schema", json_schema: { name: "foo" } })).toBeNull();
  });

  it("returns the schema object when well-formed", () => {
    const schema = { type: "object", properties: { name: { type: "string" } } };
    const result = extractJsonSchema({ type: "json_schema", json_schema: { name: "test", schema } });
    expect(result).toEqual(schema);
  });
});

// ── validateJsonContent ───────────────────────────────────────────────────────

describe("validateJsonContent — type checking", () => {
  it("passes valid object", () => {
    const { valid } = validateJsonContent('{"x":1}', { type: "object" });
    expect(valid).toBe(true);
  });

  it("fails on non-JSON input", () => {
    const { valid, errors } = validateJsonContent("not json", { type: "object" });
    expect(valid).toBe(false);
    expect(errors[0]).toMatch(/not valid JSON/);
  });

  it("fails when type mismatches", () => {
    const { valid } = validateJsonContent('"hello"', { type: "object" });
    expect(valid).toBe(false);
  });

  it("passes string type", () => {
    expect(validateJsonContent('"hello"', { type: "string" }).valid).toBe(true);
  });

  it("passes integer type", () => {
    expect(validateJsonContent("42", { type: "integer" }).valid).toBe(true);
  });

  it("fails number on integer type", () => {
    expect(validateJsonContent("42.5", { type: "integer" }).valid).toBe(false);
  });

  it("passes null type", () => {
    expect(validateJsonContent("null", { type: "null" }).valid).toBe(true);
  });
});

describe("validateJsonContent — required properties", () => {
  const schema = {
    type: "object",
    required: ["name", "age"],
    properties: {
      name: { type: "string" },
      age:  { type: "integer" },
    },
  };

  it("passes with all required props", () => {
    expect(validateJsonContent('{"name":"Alice","age":30}', schema).valid).toBe(true);
  });

  it("fails with missing required prop", () => {
    const { valid, errors } = validateJsonContent('{"name":"Alice"}', schema);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("age"))).toBe(true);
  });
});

describe("validateJsonContent — additionalProperties", () => {
  const schema = {
    type: "object",
    properties: { name: { type: "string" } },
    additionalProperties: false,
  };

  it("passes with only known props", () => {
    expect(validateJsonContent('{"name":"Bob"}', schema).valid).toBe(true);
  });

  it("fails with extra props", () => {
    const { valid, errors } = validateJsonContent('{"name":"Bob","extra":1}', schema);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("extra"))).toBe(true);
  });
});

describe("validateJsonContent — enum", () => {
  it("passes valid enum value", () => {
    expect(validateJsonContent('"red"', { enum: ["red", "green", "blue"] }).valid).toBe(true);
  });

  it("fails invalid enum value", () => {
    expect(validateJsonContent('"yellow"', { enum: ["red", "green", "blue"] }).valid).toBe(false);
  });
});

describe("validateJsonContent — anyOf / oneOf / allOf", () => {
  it("anyOf passes when at least one matches", () => {
    const schema = { anyOf: [{ type: "string" }, { type: "number" }] };
    expect(validateJsonContent('"hello"', schema).valid).toBe(true);
    expect(validateJsonContent("42", schema).valid).toBe(true);
    expect(validateJsonContent("true", schema).valid).toBe(false);
  });

  it("oneOf passes when exactly one matches", () => {
    const schema = { oneOf: [{ type: "string" }, { type: "number" }] };
    expect(validateJsonContent('"hello"', schema).valid).toBe(true);
    expect(validateJsonContent("42", schema).valid).toBe(true);
  });

  it("allOf passes when all match", () => {
    const schema = {
      allOf: [
        { type: "object" },
        { required: ["id"], properties: { id: { type: "string" } } },
      ],
    };
    expect(validateJsonContent('{"id":"x"}', schema).valid).toBe(true);
    expect(validateJsonContent('{"name":"x"}', schema).valid).toBe(false);
  });
});

describe("validateJsonContent — string constraints", () => {
  it("minLength / maxLength", () => {
    const schema = { type: "string", minLength: 2, maxLength: 5 };
    expect(validateJsonContent('"ab"', schema).valid).toBe(true);
    expect(validateJsonContent('"a"', schema).valid).toBe(false);
    expect(validateJsonContent('"toolong"', schema).valid).toBe(false);
  });

  it("pattern", () => {
    const schema = { type: "string", pattern: "^[A-Z]" };
    expect(validateJsonContent('"Hello"', schema).valid).toBe(true);
    expect(validateJsonContent('"hello"', schema).valid).toBe(false);
  });
});

describe("validateJsonContent — number constraints", () => {
  it("minimum / maximum", () => {
    const schema = { type: "number", minimum: 0, maximum: 100 };
    expect(validateJsonContent("50", schema).valid).toBe(true);
    expect(validateJsonContent("-1", schema).valid).toBe(false);
    expect(validateJsonContent("101", schema).valid).toBe(false);
  });

  it("multipleOf", () => {
    const schema = { type: "integer", multipleOf: 5 };
    expect(validateJsonContent("10", schema).valid).toBe(true);
    expect(validateJsonContent("7", schema).valid).toBe(false);
  });
});

describe("validateJsonContent — array constraints", () => {
  it("items type check", () => {
    const schema = { type: "array", items: { type: "string" } };
    expect(validateJsonContent('["a","b"]', schema).valid).toBe(true);
    expect(validateJsonContent('["a",1]', schema).valid).toBe(false);
  });

  it("minItems / maxItems", () => {
    const schema = { type: "array", minItems: 1, maxItems: 3 };
    expect(validateJsonContent("[1]", schema).valid).toBe(true);
    expect(validateJsonContent("[]", schema).valid).toBe(false);
    expect(validateJsonContent("[1,2,3,4]", schema).valid).toBe(false);
  });
});

describe("validateJsonContent — $ref / $defs", () => {
  it("resolves $ref to $defs", () => {
    const schema = {
      type: "object",
      properties: { item: { $ref: "#/$defs/Item" } },
      $defs: { Item: { type: "object", required: ["id"], properties: { id: { type: "string" } } } },
    };
    expect(validateJsonContent('{"item":{"id":"x"}}', schema).valid).toBe(true);
    expect(validateJsonContent('{"item":{"id":1}}', schema).valid).toBe(false);
  });
});

// ── extractFirstContent ───────────────────────────────────────────────────────

describe("extractFirstContent", () => {
  it("extracts content from choices[0].message.content", () => {
    const body = { choices: [{ message: { content: "hello world" } }] };
    expect(extractFirstContent(body)).toBe("hello world");
  });

  it("returns null when choices is empty", () => {
    expect(extractFirstContent({ choices: [] })).toBeNull();
  });

  it("returns null when content is not a string", () => {
    expect(extractFirstContent({ choices: [{ message: { content: null } }] })).toBeNull();
    expect(extractFirstContent({ choices: [{ message: {} }] })).toBeNull();
  });
});

// ── buildStructuredRetry ──────────────────────────────────────────────────────

describe("buildStructuredRetry", () => {
  const originalBody = {
    model: "ahura/claude",
    messages: [{ role: "user", content: "Give me JSON" }],
    response_format: { type: "json_schema", json_schema: { schema: { type: "object" } } },
  };
  const badResponse = {
    choices: [{ message: { role: "assistant", content: "not json" } }],
  };
  const schema = { type: "object", required: ["name"] };
  const errors = ['missing required property "name"'];

  it("appends bad assistant message and corrective user turn", () => {
    const retry = buildStructuredRetry(originalBody, badResponse, schema, errors);
    const msgs  = retry.messages as Array<{ role: string; content?: string }>;

    expect(msgs.length).toBe(3);
    expect(msgs[0]?.role).toBe("user");
    expect(msgs[1]?.role).toBe("assistant");
    expect(msgs[1]?.content).toBe("not json");
    expect(msgs[2]?.role).toBe("user");
    expect(msgs[2]?.content).toMatch(/missing required property/);
    expect(msgs[2]?.content).toMatch(/schema/);
  });

  it("preserves all original body fields except messages", () => {
    const retry = buildStructuredRetry(originalBody, badResponse, schema, errors);
    expect(retry.model).toBe("ahura/claude");
    expect(retry.response_format).toBeDefined();
  });
});
