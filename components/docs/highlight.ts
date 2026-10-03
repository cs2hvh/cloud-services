/**
 * A small tokenizer for the languages the docs show: bash, json, python,
 * typescript, and — for the app platform's CI and Dockerfile examples — yaml
 * and docker. It colours strings, comments, numbers, keywords, keys and shell
 * variables, and nothing else, which is enough for examples and keeps a syntax
 * highlighter and its runtime out of the bundle.
 *
 * Pure: a string in, a list of {text, kind} out. Both the server-rendered
 * code block and the client-side tabs use it.
 *
 * yaml and docker were added after the original four; every pattern for those
 * four is unchanged, so no existing page can render differently.
 */

export type Lang = "bash" | "json" | "python" | "typescript" | "yaml" | "docker" | "text";

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
  // Dockerfile instructions are upper case by convention, and matched that way
  // so prose in a comment is never coloured as one.
  docker: [
    "FROM", "AS", "RUN", "COPY", "ADD", "ARG", "ENV", "WORKDIR", "EXPOSE", "CMD",
    "ENTRYPOINT", "USER", "LABEL", "VOLUME", "HEALTHCHECK",
  ],
  // Unquoted YAML has no keywords worth colouring; its keys are matched below.
  yaml: [],
};

function pattern(lang: Lang): RegExp {
  const string = `"(?:[^"\\\\\\n]|\\\\.)*"|'(?:[^'\\\\\\n]|\\\\.)*'|\`(?:[^\`\\\\]|\\\\.)*\``;
  const number = `\\b\\d+(?:\\.\\d+)?\\b`;
  const parts: string[] = [];
  if (lang === "bash" || lang === "python" || lang === "yaml" || lang === "docker") {
    parts.push(`(?<comment>#[^\\n]*)`);
  }
  if (lang === "typescript") parts.push(`(?<comment>//[^\\n]*)`);
  parts.push(`(?<string>${string})`);
  // A YAML key: a bare word followed by a colon and whitespace or end of line,
  // so `image: node:22` colours `image` and leaves `node:22` alone.
  if (lang === "yaml") parts.push(`(?<key>[A-Za-z_][\\w.-]*(?=:(?:[ \\t]|$)))`);
  if (lang === "json") parts.push(`(?<number>${number}|\\b(?:true|false|null)\\b)`);
  else parts.push(`(?<number>${number})`);
  if (lang === "bash") parts.push(`(?<var>\\$[A-Za-z_][A-Za-z0-9_]*|\\$\\{[^}]*\\})`);
  // GitHub Actions expressions first, so `\${{ secrets.X }}` is one token.
  if (lang === "yaml" || lang === "docker") {
    parts.push(`(?<var>\\$\\{\\{[^}]*\\}\\}|\\$[A-Za-z_][A-Za-z0-9_]*|\\$\\{[^}]*\\})`);
  }
  if (lang === "bash" || lang === "python" || lang === "typescript" || lang === "docker") {
    // An empty list would compile to a pattern that matches the empty string
    // at every word boundary, so only languages that have keywords get one.
    parts.push(`(?<keyword>\\b(?:${KEYWORDS[lang].join("|")})\\b)`);
  }
  return new RegExp(parts.join("|"), lang === "yaml" ? "gm" : "g");
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
    } else if (groups.key !== undefined) kind = "key";
    else if (groups.number !== undefined) kind = "number";
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
