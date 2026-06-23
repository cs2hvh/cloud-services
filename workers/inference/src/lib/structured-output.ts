/**
 * Structured output (JSON schema) validation + constrained retry.
 *
 * Validates non-streaming chat completions against the customer-supplied
 * response_format.json_schema.schema.  On failure: one constrained retry
 * (append corrective user turn + re-forward).  Second failure → clean error.
 *
 * Not applied to streaming — buffering a stream defeats the purpose; the
 * upstream model's constrained decoding covers that path.
 *
 * No external deps — uses a minimal inline JSON Schema validator that covers
 * type, required, additionalProperties, properties, items, enum, anyOf/oneOf/allOf,
 * $ref/$defs, minLength/maxLength, minimum/maximum.
 */

type Schema = Record<string, unknown>;
type Msg = { role: string; content?: unknown; tool_calls?: unknown[] };

export interface StructuredValidation {
  valid: boolean;
  errors: string[];
}

/** Extract the JSON Schema from a response_format field, or null if not json_schema mode. */
export function extractJsonSchema(responseFormat: unknown): Schema | null {
  if (!responseFormat || typeof responseFormat !== "object") return null;
  const rf = responseFormat as Record<string, unknown>;
  if (rf.type !== "json_schema") return null;
  const js = rf.json_schema;
  if (!js || typeof js !== "object") return null;
  const schema = (js as Record<string, unknown>).schema;
  if (!schema || typeof schema !== "object") return null;
  return schema as Schema;
}

/** Validate the first assistant content string against a JSON schema. */
export function validateJsonContent(content: string, schema: Schema): StructuredValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { valid: false, errors: ["Response content is not valid JSON"] };
  }
  const defs = ((schema.$defs ?? schema.definitions) ?? {}) as Schema;
  const errors = check(parsed, schema, "", defs);
  return { valid: errors.length === 0, errors };
}

/** Pull text content from choices[0].message.content in a chat response body. */
export function extractFirstContent(body: Record<string, unknown>): string | null {
  const choices = body.choices as Array<{ message?: { content?: unknown } }> | undefined;
  const c = choices?.[0]?.message?.content;
  return typeof c === "string" ? c : null;
}

/**
 * Build the retry body for a structured-output failure.
 * Appends the bad assistant message + a corrective user turn.
 */
export function buildStructuredRetry(
  originalBody: Record<string, unknown>,
  badResponse: Record<string, unknown>,
  schema: Schema,
  errors: string[],
): Record<string, unknown> {
  const original = (originalBody.messages ?? []) as Msg[];
  const bad = badResponse.choices as Array<{ message?: Msg }> | undefined;
  const badMsg = bad?.[0]?.message;
  const extra: Msg[] = [
    ...(badMsg ? [{ ...badMsg, role: "assistant" as const }] : []),
    {
      role: "user",
      content:
        `Your previous response did not conform to the required JSON schema. ` +
        `Validation errors: ${errors.slice(0, 3).join("; ")}. ` +
        `Required schema: ${JSON.stringify(schema)}. ` +
        `Respond with ONLY a valid JSON object matching this schema. No explanation, no markdown fences, just the JSON.`,
    },
  ];
  return { ...originalBody, messages: [...original, ...extra] };
}

// ─── Inline JSON Schema validator ────────────────────────────────────────────

function check(value: unknown, schema: Schema, path: string, defs: Schema): string[] {
  const errs: string[] = [];

  // $ref
  if (typeof schema.$ref === "string") {
    const key = schema.$ref.replace(/^#\/(definitions|\$defs)\//, "");
    const ref = defs[key] as Schema | undefined;
    return ref ? check(value, ref, path, defs) : [`${at(path)}: unresolvable $ref "${schema.$ref}"`];
  }

  // type
  if (schema.type !== undefined) {
    const ts = Array.isArray(schema.type) ? (schema.type as string[]) : [schema.type as string];
    if (!ts.some((t) => isType(value, t))) {
      errs.push(`${at(path)}: expected ${ts.join("|")}, got ${tyOf(value)}`);
      return errs; // further checks on wrong type are noise
    }
  }

  // enum
  if (Array.isArray(schema.enum)) {
    if (!(schema.enum as unknown[]).some((e) => JSON.stringify(e) === JSON.stringify(value))) {
      errs.push(`${at(path)}: value is not one of the allowed enum values`);
    }
  }

  // object
  if (isObject(value)) {
    const obj = value as Record<string, unknown>;
    const props = schema.properties as Record<string, Schema> | undefined;

    if (Array.isArray(schema.required)) {
      for (const k of schema.required as string[]) {
        if (!(k in obj)) errs.push(`${at(path)}: missing required property "${k}"`);
      }
    }

    if (props) {
      for (const [k, s] of Object.entries(props)) {
        if (k in obj) errs.push(...check(obj[k], s, dot(path, k), defs));
      }
    }

    if (schema.additionalProperties === false && props) {
      const allowed = new Set(Object.keys(props));
      for (const k of Object.keys(obj)) {
        if (!allowed.has(k)) errs.push(`${at(path)}: unexpected additional property "${k}"`);
      }
    }

    if (typeof schema.minProperties === "number" && Object.keys(obj).length < schema.minProperties) {
      errs.push(`${at(path)}: too few properties (min ${schema.minProperties})`);
    }
    if (typeof schema.maxProperties === "number" && Object.keys(obj).length > schema.maxProperties) {
      errs.push(`${at(path)}: too many properties (max ${schema.maxProperties})`);
    }
  }

  // array
  if (Array.isArray(value)) {
    if (schema.items && typeof schema.items === "object" && !Array.isArray(schema.items)) {
      const items = schema.items as Schema;
      for (let i = 0; i < value.length; i++) {
        errs.push(...check(value[i], items, `${at(path)}[${i}]`, defs));
      }
    }
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errs.push(`${at(path)}: must have at least ${schema.minItems} items`);
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      errs.push(`${at(path)}: must have at most ${schema.maxItems} items`);
    }
  }

  // string
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errs.push(`${at(path)}: minLength ${schema.minLength} not satisfied (got ${value.length})`);
    }
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
      errs.push(`${at(path)}: maxLength ${schema.maxLength} exceeded (got ${value.length})`);
    }
    if (typeof schema.pattern === "string") {
      try {
        if (!new RegExp(schema.pattern).test(value)) {
          errs.push(`${at(path)}: does not match pattern "${schema.pattern}"`);
        }
      } catch { /* ignore invalid regex */ }
    }
  }

  // number
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      errs.push(`${at(path)}: ${value} < minimum ${schema.minimum}`);
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      errs.push(`${at(path)}: ${value} > maximum ${schema.maximum}`);
    }
    if (typeof schema.exclusiveMinimum === "number" && value <= schema.exclusiveMinimum) {
      errs.push(`${at(path)}: ${value} must be > exclusiveMinimum ${schema.exclusiveMinimum}`);
    }
    if (typeof schema.exclusiveMaximum === "number" && value >= schema.exclusiveMaximum) {
      errs.push(`${at(path)}: ${value} must be < exclusiveMaximum ${schema.exclusiveMaximum}`);
    }
    if (typeof schema.multipleOf === "number" && schema.multipleOf !== 0 && value % schema.multipleOf !== 0) {
      errs.push(`${at(path)}: ${value} is not a multiple of ${schema.multipleOf}`);
    }
  }

  // combinators
  if (Array.isArray(schema.anyOf)) {
    if (!(schema.anyOf as Schema[]).some((s) => check(value, s, path, defs).length === 0)) {
      errs.push(`${at(path)}: value does not match any anyOf schema`);
    }
  }
  if (Array.isArray(schema.oneOf)) {
    const n = (schema.oneOf as Schema[]).filter((s) => check(value, s, path, defs).length === 0).length;
    if (n !== 1) errs.push(`${at(path)}: must match exactly one oneOf schema (matched ${n})`);
  }
  if (Array.isArray(schema.allOf)) {
    for (const s of schema.allOf as Schema[]) errs.push(...check(value, s, path, defs));
  }
  if (schema.not && typeof schema.not === "object") {
    if (check(value, schema.not as Schema, path, defs).length === 0) {
      errs.push(`${at(path)}: value matches disallowed "not" schema`);
    }
  }

  return errs;
}

function isType(v: unknown, t: string): boolean {
  switch (t) {
    case "null":    return v === null;
    case "boolean": return typeof v === "boolean";
    case "integer": return typeof v === "number" && Number.isInteger(v);
    case "number":  return typeof v === "number";
    case "string":  return typeof v === "string";
    case "array":   return Array.isArray(v);
    case "object":  return isObject(v);
    default: return true;
  }
}

function isObject(v: unknown): boolean {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function tyOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function at(path: string): string { return path || "root"; }
function dot(base: string, key: string): string { return base ? `${base}.${key}` : key; }
