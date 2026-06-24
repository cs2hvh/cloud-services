import { createClient } from "@supabase/supabase-js";

import { requireAuthProfile } from "@/lib/supabase/auth";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import {
  type PlaygroundModel,
  type PlaygroundPreset,
  type ServiceModel,
} from "@/components/dashboard/inference/playground";
import { PlaygroundShell } from "@/components/dashboard/inference/playground-shell";

export const dynamic = "force-dynamic";

const SERVICE_MODALITIES = ["image", "video", "music", "tts", "stt", "rerank", "moderation", "ocr"] as const;
type ServiceModality = (typeof SERVICE_MODALITIES)[number];

interface RawModelRow {
  model_id: string;
  display_name: string;
  modality: string;
  capabilities: Record<string, unknown> | null;
  pricing: Record<string, unknown> | null;
  is_featured: boolean;
  sort_order: number;
  org_id: string | null;
}

interface RawPresetRow {
  id: string;
  name: string;
  description: string | null;
  config: Record<string, unknown> | null;
}

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function loadPresets(orgId: string): Promise<PlaygroundPreset[]> {
  const { data } = await makeSupabase()
    .schema("inference")
    .from("model_presets")
    .select("id, name, description, config")
    .eq("org_id", orgId)
    .order("name", { ascending: true })
    .returns<RawPresetRow[]>();
  return (data ?? []).map((p) => {
    const cfg = (p.config ?? {}) as Record<string, unknown>;
    const models = Array.isArray(cfg.models)
      ? (cfg.models as unknown[]).filter((m): m is string => typeof m === "string")
      : [];
    return { id: p.id, name: p.name, description: p.description, fallback_models: models };
  });
}

async function loadChatModels(orgId: string): Promise<PlaygroundModel[]> {
  const { data } = await makeSupabase()
    .schema("inference")
    .from("models")
    .select("model_id, display_name, modality, capabilities, pricing, is_featured, sort_order, org_id")
    .eq("is_active", true)
    .eq("modality", "chat")
    .or(`org_id.is.null,org_id.eq.${orgId}`)
    .order("is_featured", { ascending: false })
    .order("sort_order", { ascending: true })
    .returns<RawModelRow[]>();

  return (data ?? []).map((row) => {
    const caps    = (row.capabilities ?? {}) as Record<string, unknown>;
    const pricing = (row.pricing ?? {}) as Record<string, unknown>;
    return {
      model_id:             row.model_id,
      display_name:         row.display_name,
      provider:             row.model_id.split("/")[0] ?? "custom",
      is_featured:          row.is_featured,
      supports_streaming:   !!caps.streaming,
      supports_tools:       !!caps.tools,
      supports_vision:      !!caps.vision,
      context_window:       typeof caps.context_window === "number" ? caps.context_window : null,
      max_output:           typeof caps.max_output === "number" ? caps.max_output : null,
      input_price_per_mtok: typeof pricing.input_cents_per_mtok === "number" ? pricing.input_cents_per_mtok : null,
      output_price_per_mtok: typeof pricing.output_cents_per_mtok === "number" ? pricing.output_cents_per_mtok : null,
    };
  });
}

async function loadServiceModels(
  orgId: string
): Promise<Record<ServiceModality, ServiceModel[]>> {
  const { data } = await makeSupabase()
    .schema("inference")
    .from("models")
    .select("model_id, display_name, modality, capabilities, is_featured, sort_order, org_id")
    .eq("is_active", true)
    .in("modality", SERVICE_MODALITIES as unknown as string[])
    .or(`org_id.is.null,org_id.eq.${orgId}`)
    .order("is_featured", { ascending: false })
    .order("sort_order", { ascending: true })
    .returns<RawModelRow[]>();

  const grouped: Record<ServiceModality, ServiceModel[]> = {
    image: [], video: [], music: [], tts: [], stt: [], rerank: [], moderation: [], ocr: [],
  };

  for (const row of data ?? []) {
    const modality = row.modality as ServiceModality;
    if (!(modality in grouped)) continue;
    const caps = (row.capabilities ?? {}) as Record<string, unknown>;
    grouped[modality].push({
      model_id:     row.model_id,
      display_name: row.display_name,
      is_featured:  row.is_featured,
      tier:         typeof caps.tier === "string" ? caps.tier : null,
      capabilities: row.capabilities ?? null,
    });
  }

  return grouped;
}

export default async function PlaygroundPage() {
  const user = await requireAuthProfile();
  const org  = await getOrBootstrapOrgForUser(user.id, user.email ?? "");

  const [chatModels, serviceModels, presets] = await Promise.all([
    loadChatModels(org.org_id),
    loadServiceModels(org.org_id),
    loadPresets(org.org_id),
  ]);

  const apiBase = process.env.NEXT_PUBLIC_INFERENCE_API_BASE ?? "https://api.ahurasense.com/v1";

  return (
    <PlaygroundShell
      models={chatModels}
      serviceModels={serviceModels}
      presets={presets}
      apiBase={apiBase}
      orgName={org.org_name}
    />
  );
}
