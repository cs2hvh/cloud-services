import type { ComponentType } from "react";

import {
  SiAnthropic,
  SiBytedance,
  SiGooglegemini,
  SiMeta,
  SiMistralai,
  SiOpenai,
  SiPerplexity,
  SiXiaomi,
} from "react-icons/si";

import { FaMicrosoft } from "react-icons/fa6";

import { DeepseekIcon, QwenIcon, GrokIcon } from "hugeicons-react";

type LogoComponent = ComponentType<Record<string, unknown>>;

/**
 * The namespace in a catalog id (`anthropic/claude-opus-5`) → the vendor's
 * display name. The dashboard derives its provider from the id, the
 * marketing cards carry the display name; both resolve to the same mark.
 */
export const PROVIDER_BY_NAMESPACE: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  "x-ai": "xAI",
  xai: "xAI",
  moonshotai: "Moonshot",
  zhipu: "Zhipu",
  deepseek: "DeepSeek",
  minimax: "MiniMax",
  bytedance: "ByteDance",
  qwen: "Qwen",
  tencent: "Tencent",
  xiaomi: "Xiaomi",
  cursor: "Cursor",
  meta: "Meta",
  "meta-llama": "Meta",
  mistral: "Mistral",
  mistralai: "Mistral",
  perplexity: "Perplexity",
  microsoft: "Microsoft",
  ahura: "AhuraSense",
};

/** Display name for a namespace, a display name, or a full catalog id. */
export function providerName(nsOrId: string): string {
  const ns = nsOrId.includes("/") ? nsOrId.split("/")[0]! : nsOrId;
  return PROVIDER_BY_NAMESPACE[ns.toLowerCase()] ?? ns;
}

// Vendors without a mark in either icon pack (Moonshot, Zhipu, MiniMax,
// Tencent, Cursor) fall back to a monogram below. Initials beat a wrong logo.
const PROVIDER_LOGOS: Record<string, LogoComponent> = {
  OpenAI: SiOpenai,
  Anthropic: SiAnthropic,
  Google: SiGooglegemini,
  Meta: SiMeta,
  Mistral: SiMistralai,
  Perplexity: SiPerplexity,
  DeepSeek: DeepseekIcon,
  Qwen: QwenIcon,
  xAI: GrokIcon,
  Microsoft: FaMicrosoft,
  ByteDance: SiBytedance,
  Xiaomi: SiXiaomi,
};

export function ProviderLogo({
  provider,
  size = 16,
  className,
}: {
  /** A display name ("OpenAI"), a namespace ("x-ai") or a catalog id. */
  provider: string;
  size?: number;
  className?: string;
}) {
  const name = providerName(provider);
  const Logo = PROVIDER_LOGOS[name];

  if (Logo) {
    return (
      <Logo
        size={size}
        width={size}
        height={size}
        className={className}
        aria-hidden
        focusable={false}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={className}
      style={{ fontSize: Math.round(size * 0.55), lineHeight: `${size}px`, letterSpacing: "0.04em" }}
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}
