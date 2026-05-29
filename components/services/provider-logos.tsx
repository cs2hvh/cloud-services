import type { ComponentType } from "react";

import {
  SiAnthropic,
  SiGooglegemini,
  SiMeta,
  SiMistralai,
  SiOpenai,
  SiPerplexity,
} from "react-icons/si";

import { FaMicrosoft } from "react-icons/fa6";

import { DeepseekIcon, QwenIcon,GrokIcon } from "hugeicons-react";

type LogoComponent = ComponentType<Record<string, unknown>>;

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
};

export function ProviderLogo({
  provider,
  size = 16,
  className,
}: {
  provider: string;
  size?: number;
  className?: string;
}) {
  const Logo = PROVIDER_LOGOS[provider];

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
    <span aria-hidden className={className}>
      {provider.slice(0, 2).toUpperCase()}
    </span>
  );
}