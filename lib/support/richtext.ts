const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "ul",
  "ol",
  "li",
  "div",
  "span",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "a",
  "pre",
  "code",
  "hr",
  "s",
  "strike",
]);

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function stripDangerousMarkup(input: string): string {
  return input
    .replace(/<\s*(script|style|iframe|object|embed|meta|link)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/\s(href|src)\s*=\s*"javascript:[^"]*"/gi, "")
    .replace(/\s(href|src)\s*=\s*'javascript:[^']*'/gi, "")
    .replace(/\s(href|src)\s*=\s*"vbscript:[^"]*"/gi, "")
    .replace(/\s(href|src)\s*=\s*'vbscript:[^']*'/gi, "");
}

function sanitizeHref(rawHref: string): string | null {
  const value = rawHref.trim();
  if (!value) return null;
  if (/^(https?:|mailto:|\/|#)/i.test(value)) {
    return value;
  }
  return null;
}

function sanitizeTag(tagName: string, attrs: string, isClosing: boolean): string {
  const normalized = tagName.toLowerCase();
  if (!ALLOWED_TAGS.has(normalized)) {
    return "";
  }

  if (isClosing) {
    return `</${normalized}>`;
  }

  if (normalized === "br") {
    return "<br>";
  }

  if (normalized === "hr") {
    return "<hr>";
  }

  if (
    (normalized === "p" ||
      normalized === "div" ||
      normalized === "h1" ||
      normalized === "h2" ||
      normalized === "h3" ||
      normalized === "h4" ||
      normalized === "h5" ||
      normalized === "h6") &&
    attrs
  ) {
    const styleMatch = attrs.match(/style\s*=\s*["']([^"']+)["']/i);
    if (styleMatch && /text-align\s*:\s*(left|center|right|justify)/i.test(styleMatch[1])) {
      const align = styleMatch[1].match(/text-align\s*:\s*(left|center|right|justify)/i)?.[1].toLowerCase();
      if (align) {
        return `<${normalized} style="text-align:${align}">`;
      }
    }
  }

  if (normalized === "a" && attrs) {
    const hrefMatch = attrs.match(/href\s*=\s*["']([^"']+)["']/i);
    const href = hrefMatch ? sanitizeHref(hrefMatch[1]) : null;
    if (href) {
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer nofollow">`;
    }
  }

  return `<${normalized}>`;
}

export function plainTextFromRichText(input: string): string {
  return input
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|blockquote|h1|h2|h3|h4|h5|h6|pre)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function paragraphsFromPlainText(input: string): string {
  const escaped = escapeHtml(input);
  const blocks = escaped.split(/\n{2,}/).map((segment) => segment.trim()).filter(Boolean);
  if (blocks.length === 0) {
    return "";
  }
  return blocks
    .map((block) => `<p>${block.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function sanitizeSupportRichText(input: string): string {
  const normalized = String(input || "").trim();
  if (!normalized) return "";

  if (!/[<>]/.test(normalized)) {
    return paragraphsFromPlainText(normalized);
  }

  const stripped = stripDangerousMarkup(normalized);

  const sanitized = stripped.replace(
    /<\s*(\/?)\s*([a-zA-Z0-9]+)([^>]*)>/g,
    (_full, closingSlash: string, tagName: string, attrs: string) =>
      sanitizeTag(tagName, attrs || "", Boolean(closingSlash))
  );

  return sanitized.trim();
}

export function getSupportRichTextLength(input: string): number {
  return plainTextFromRichText(sanitizeSupportRichText(input)).length;
}

