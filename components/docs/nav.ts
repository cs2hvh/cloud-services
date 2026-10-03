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
        title: "Images",
        href: "/docs/inference/images",
        description: "POST /v1/images/generations: one image per request, returned as base64, billed per image.",
      },
      {
        title: "Videos",
        href: "/docs/inference/videos",
        description: "POST /v1/videos and the job lifecycle: submit, poll, download, billed per second on completion.",
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
        title: "Reasoning effort",
        href: "/docs/inference/reasoning",
        description: "How much a hosted model thinks before it answers, from none to unbounded, and what it costs.",
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

export const APP_DOCS: DocsNavGroup[] = [
  {
    label: "Get started",
    items: [
      {
        title: "Overview",
        href: "/docs/apps",
        description: "Deploy an app from a git repository: connect, create, push, and the ways to integrate.",
      },
    ],
  },
  {
    label: "Deploying",
    items: [
      {
        title: "Deployments",
        href: "/docs/apps/deployments",
        description: "Production and preview branches, the deployment lifecycle, logs and rollback.",
      },
      {
        title: "Deploy hooks",
        href: "/docs/apps/deploy-hooks",
        description: "A secret URL your CI calls to deploy, so a release waits for your own tests to pass.",
      },
      {
        title: "Build configuration",
        href: "/docs/apps/builds",
        description: "Supported frameworks, bringing your own Dockerfile, root directories and runtime versions.",
      },
    ],
  },
  {
    label: "Configure",
    items: [
      {
        title: "Environment variables",
        href: "/docs/apps/environment-variables",
        description: "Variables for the build and for the running app, and which ones reach the browser.",
      },
      {
        title: "Custom domains",
        href: "/docs/apps/domains",
        description: "Serve an app on your own domain: the DNS records to add and how the certificate is issued.",
      },
    ],
  },
  {
    label: "Reference",
    items: [
      {
        title: "Errors",
        href: "/docs/apps/errors",
        description: "Every reason a deployment can fail, what it means, and what to do about it.",
      },
    ],
  },
];

/**
 * A documented product: its own sidebar, its own reading order.
 *
 * Previous/next links stay inside a product — the last inference page must not
 * point at the first app-platform page as though they were one manual. The
 * sitemap and the docs home are the only places that read across products.
 */
export interface DocsProduct {
  id: "inference" | "apps";
  /** Breadcrumb and sidebar heading. */
  label: string;
  /** Section root; every page of the product lives under it. */
  base: string;
  groups: DocsNavGroup[];
}

export const DOCS_PRODUCTS: DocsProduct[] = [
  { id: "inference", label: "Inference API", base: "/docs/inference", groups: INFERENCE_DOCS },
  { id: "apps", label: "App Platform", base: "/docs/apps", groups: APP_DOCS },
];

/** The product a docs path belongs to, matched on its section root. */
export function productFor(path: string): DocsProduct | undefined {
  return DOCS_PRODUCTS.find((p) => path === p.base || path.startsWith(`${p.base}/`));
}

/**
 * Pages in reading order. Given groups, just those; given nothing, every page
 * of every product — which is what the sitemap wants.
 */
export function flattenDocs(groups?: DocsNavGroup[]): DocsNavItem[] {
  return (groups ?? DOCS_PRODUCTS.flatMap((p) => p.groups)).flatMap((g) => g.items);
}

export function findDoc(href: string): DocsNavItem | undefined {
  return flattenDocs().find((d) => d.href === href);
}
