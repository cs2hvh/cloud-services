/**
 * A small tokenizer for the four languages the docs show: bash, json, python
 * and typescript. It colours strings, comments, numbers, keywords and shell
 * variables, and nothing else, which is enough for API examples and keeps a
 * syntax highlighter and its runtime out of the bundle.
 *
 * Pure: a string in, a list of {text, kind} out. Both the server-rendered
 * code block and the client-side tabs use it.
 */

export type Lang = "bash" | "json" | "python" | "typescript" | "text";

export type TokenKind = "plain" | "string" | "key" | "comment" | "number" | "keyword" | "var";

export interface Token {
  text: string;
  kind: TokenKind;
}

const KEYWORDS: Record<Exclude<Lang, "text" | "json">, string[]> = {
  bash: ["curl", "export", "echo", "for", "do", "done", "if", "then", "fi"],
  python: [
    "from", "import", "def", "return", "for", "in", "if", "else", "elif", "as",
    "with", "async", "await", "print", "not", "and", "or", "None", "True", "False", "class",
  ],
  typescript: [
    "import", "from", "const", "let", "var", "await", "async", "function", "return",
    "new", "export", "for", "of", "if", "else", "type", "interface", "true", "false", "null",
  ],
};

function pattern(lang: Lang): RegExp {
  const string = `"(?:[^"\\\\\\n]|\\\\.)*"|'(?:[^'\\\\\\n]|\\\\.)*'|\`(?:[^\`\\\\]|\\\\.)*\``;
  const number = `\\b\\d+(?:\\.\\d+)?\\b`;
  const parts: string[] = [];
  if (lang === "bash" || lang === "python") parts.push(`(?<comment>#[^\\n]*)`);
  if (lang === "typescript") parts.push(`(?<comment>//[^\\n]*)`);
  parts.push(`(?<string>${string})`);
  if (lang === "json") parts.push(`(?<number>${number}|\\b(?:true|false|null)\\b)`);
  else parts.push(`(?<number>${number})`);
  if (lang === "bash") parts.push(`(?<var>\\$[A-Za-z_][A-Za-z0-9_]*|\\$\\{[^}]*\\})`);
  if (lang === "bash" || lang === "python" || lang === "typescript") {
    parts.push(`(?<keyword>\\b(?:${KEYWORDS[lang].join("|")})\\b)`);
  }
  return new RegExp(parts.join("|"), "g");
}

export function tokenize(code: string, lang: Lang): Token[] {
  if (lang === "text") return [{ text: code, kind: "plain" }];
  const re = pattern(lang);
  const out: Token[] = [];
  let last = 0;
  for (const m of code.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ text: code.slice(last, idx), kind: "plain" });
    const groups = m.groups ?? {};
    let kind: TokenKind = "plain";
    if (groups.comment !== undefined) kind = "comment";
    else if (groups.string !== undefined) {
      // A JSON key is a string followed by a colon; it reads better in ink
      // than in the value colour.
      const after = code.slice(idx + m[0].length).match(/^\s*:/);
      kind = lang === "json" && after ? "key" : "string";
    } else if (groups.number !== undefined) kind = "number";
    else if (groups.var !== undefined) kind = "var";
    else if (groups.keyword !== undefined) kind = "keyword";
    out.push({ text: m[0], kind });
    last = idx + m[0].length;
  }
  if (last < code.length) out.push({ text: code.slice(last), kind: "plain" });
  return out;
}

/** Tailwind classes per token kind, on the marketing palette. */
export const TOKEN_CLASS: Record<TokenKind, string> = {
  plain: "",
  string: "text-[var(--ah-blue-lt)]",
  key: "text-[var(--ah-ink)]",
  comment: "text-[var(--ah-muted)] italic",
  number: "text-[var(--ah-amber)]",
  keyword: "text-[#8fb8ff]",
  var: "text-[var(--ah-green)]",
};
