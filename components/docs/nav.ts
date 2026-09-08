/**
 * Documentation navigation.
 *
 * One config drives the sidebar, the previous/next footer on every page and
 * the sitemap, so a page cannot exist in one and be missing from another.
 * Order here is reading order.
 */

export interface DocsNavItem {
  title: string;
  href: string;
  /** One line for the docs home and for search engines. */
  description: string;
}

export interface DocsNavGroup {
  label: string;
  items: DocsNavItem[];
}

export const INFERENCE_DOCS: DocsNavGroup[] = [
  {
    label: "Get started",
    items: [
      {
        title: "Overview",
        href: "/docs/inference",
        description: "What the inference API is, the base URL, and a first request in under a minute.",
      },
      {
        title: "Authentication",
        href: "/docs/inference/authentication",
        description: "API keys, the headers every request carries, and what a key can be restricted to.",
      },
      {
        title: "Models",
        href: "/docs/inference/models",
        description: "The live catalog: ids, context windows, capabilities and per-token prices.",
      },
      {
        title: "SDKs & frameworks",
        href: "/docs/inference/sdks",
        description: "Use the OpenAI or Anthropic SDK, LangChain, or plain HTTP.",
      },
    ],
  },
  {
    label: "API reference",
    items: [
      {
        title: "Chat completions",
        href: "/docs/inference/chat-completions",
        description: "POST /v1/chat/completions: every parameter, the response, and the headers we add.",
      },
      {
        title: "Messages",
        href: "/docs/inference/messages",
        description: "POST /v1/messages: the Anthropic-compatible endpoint for existing Anthropic code.",
      },
      {
        title: "Streaming",
        href: "/docs/inference/streaming",
        description: "Server-sent events, how usage arrives on a stream, and reasoning tokens.",
      },
      {
        title: "Errors",
        href: "/docs/inference/errors",
        description: "The error envelope and every code the gateway returns, with what to do about each.",
      },
    ],
  },
  {
    label: "Features",
    items: [
      {
        title: "Tool calling",
        href: "/docs/inference/tool-calling",
        description: "Function calling in the OpenAI format, including the follow-up turn.",
      },
      {
        title: "Structured outputs",
        href: "/docs/inference/structured-outputs",
        description: "JSON mode and how to get reliably parseable answers.",
      },
      {
        title: "Caching",
        href: "/docs/inference/caching",
        description: "The exact-match response cache: when it applies, how to control it, what it costs.",
      },
      {
        title: "Guardrails",
        href: "/docs/inference/guardrails",
        description: "Prompt-injection detection: warn, block, or off, per request.",
      },
      {
        title: "Presets",
        href: "/docs/inference/presets",
        description: "Named model defaults you can switch without redeploying.",
      },
    ],
  },
  {
    label: "Account",
    items: [
      {
        title: "Rate limits & spend caps",
        href: "/docs/inference/limits",
        description: "Requests per minute, burst, monthly hard caps, and the responses when you hit them.",
      },
      {
        title: "Pricing & usage",
        href: "/docs/inference/pricing",
        description: "How a request is priced, what a usage row records, and where to see it.",
      },
      {
        title: "Privacy & data retention",
        href: "/docs/inference/privacy",
        description: "What is stored per request, zero data retention keys, and encryption at rest.",
      },
    ],
  },
];

/** Every page in reading order, for previous/next links and the sitemap. */
export function flattenDocs(groups: DocsNavGroup[] = INFERENCE_DOCS): DocsNavItem[] {
  return groups.flatMap((g) => g.items);
}

export function findDoc(href: string): DocsNavItem | undefined {
  return flattenDocs().find((d) => d.href === href);
}
