"use client";

/**
 * PlaygroundShell — top-level tab switcher for the Playground page.
 *
 * Adding a new service tab:
 *   1. Add a key to TopTab and an entry to TABS
 *   2. Import the service component from services/
 *   3. Add a case in the render switch below, passing serviceModels[key]
 */

import { useState } from "react";
import { Braces, FileSearch, ImageIcon, ListOrdered, MessageSquare, Mic, ShieldCheck, Volume2 } from "lucide-react";
import {
  Playground,
  type PlaygroundModel,
  type PlaygroundPreset,
  type ServiceModel,
} from "@/components/dashboard/inference/playground";
import { RerankService } from "@/components/dashboard/inference/services/rerank";
import { ModerationService } from "@/components/dashboard/inference/services/moderation";
import { EmbeddingsService } from "@/components/dashboard/inference/services/embeddings";
import { ImagesService } from "@/components/dashboard/inference/services/images";
import { TtsService } from "@/components/dashboard/inference/services/tts";
import { SttService } from "@/components/dashboard/inference/services/stt";
import { OcrService } from "@/components/dashboard/inference/services/ocr";
import { MONO } from "@/components/dashboard/inference/chrome";

type TopTab = "chat" | "embeddings" | "rerank" | "moderation" | "images" | "tts" | "stt" | "ocr";

const TABS: Array<{ key: TopTab; label: string; Icon: React.ElementType }> = [
  { key: "chat",       label: "Chat",       Icon: MessageSquare },
  { key: "embeddings", label: "Embeddings", Icon: Braces        },
  { key: "rerank",     label: "Rerank",     Icon: ListOrdered   },
  { key: "moderation", label: "Moderation", Icon: ShieldCheck   },
  { key: "images",     label: "Images",     Icon: ImageIcon     },
  { key: "tts",        label: "TTS",        Icon: Volume2       },
  { key: "stt",        label: "STT",        Icon: Mic           },
  { key: "ocr",        label: "OCR",        Icon: FileSearch    },
];

function TabBar({ tab, onChange }: { tab: TopTab; onChange: (t: TopTab) => void }) {
  return (
    <div className="inline-flex max-w-full overflow-x-auto rounded-[5px] border border-white/[0.08] bg-white/[0.02] p-0.5">
      {TABS.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`${MONO} h-8 shrink-0 inline-flex items-center gap-1.5 px-3 text-[10.5px] uppercase tracking-[0.12em] font-semibold rounded-[4px] transition-colors ${
            tab === key
              ? "bg-[#0095FF]/15 text-white shadow-[0_0_12px_rgba(0,149,255,0.18)_inset]"
              : "text-white/55 hover:text-white"
          }`}
        >
          <Icon className="h-3 w-3" />
          {label}
        </button>
      ))}
    </div>
  );
}

export type ServiceModels = Partial<Record<"image" | "tts" | "stt" | "rerank" | "moderation" | "ocr", ServiceModel[]>>;

export function PlaygroundShell({
  models,
  serviceModels,
  presets,
  apiBase,
  orgName,
}: {
  models: PlaygroundModel[];
  serviceModels: ServiceModels;
  presets: PlaygroundPreset[];
  apiBase: string;
  orgName: string;
}) {
  const [tab, setTab] = useState<TopTab>("chat");
  const tabBar = <TabBar tab={tab} onChange={setTab} />;

  switch (tab) {
    case "embeddings":
      return <EmbeddingsService apiBase={apiBase} tabBar={tabBar} />;
    case "rerank":
      return <RerankService apiBase={apiBase} models={serviceModels.rerank ?? []} tabBar={tabBar} />;
    case "moderation":
      return <ModerationService apiBase={apiBase} models={serviceModels.moderation ?? []} tabBar={tabBar} />;
    case "images":
      return <ImagesService apiBase={apiBase} models={serviceModels.image ?? []} tabBar={tabBar} />;
    case "tts":
      return <TtsService apiBase={apiBase} models={serviceModels.tts ?? []} tabBar={tabBar} />;
    case "stt":
      return <SttService apiBase={apiBase} models={serviceModels.stt ?? []} tabBar={tabBar} />;
    case "ocr":
      return <OcrService apiBase={apiBase} models={serviceModels.ocr ?? []} tabBar={tabBar} />;
    default:
      return (
        <Playground
          models={models}
          presets={presets}
          apiBase={apiBase}
          orgName={orgName}
          tabBar={tabBar}
        />
      );
  }
}
