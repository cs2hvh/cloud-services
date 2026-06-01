import { createClient } from "@supabase/supabase-js";

import { requireAuthProfile } from "@/lib/supabase/auth";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import { ModelCatalog, type CatalogModel } from "@/components/dashboard/inference/model-catalog";

export const dynamic = "force-dynamic";

interface RawModelRow {
  model_id: string;
  display_name: string;
  description: string | null;
  modality: string;
  serving_type: string;
  capabilities: Record<string, unknown> | null;
  pricing: Record<string, unknown> | null;
  off_peak: Record<string, unknown> | null;
  is_featured: boolean;
  sort_order: number;
  org_id: string | null;
}

async function loadCatalog(orgId: string): Promise<CatalogModel[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .schema("inference")
    .from("models")
    .select(
      "model_id, display_name, description, modality, serving_type, capabilities, pricing, off_peak, is_featured, sort_order, org_id"
    )
    .eq("is_active", true)
    .or(`org_id.is.null,org_id.eq.${orgId}`)
    .order("sort_order", { ascending: true })
    .returns<RawModelRow[]>();

    console.log(data,".....................22");

  if (error || !data) {
    console.error("[Inference Catalog] fetch failed", error);
    return [];
  }

  return data.map((row) => {
    // Provider parsed from model_id prefix ("anthropic/claude-opus-4.7" -> "anthropic")
    const provider = row.model_id.split("/")[0] ?? "custom";
    const caps = (row.capabilities ?? {}) as Record<string, unknown>;
    const pricing = (row.pricing ?? {}) as Record<string, unknown>;
    return {
      model_id: row.model_id,
      display_name: row.display_name,
      description: row.description,
      modality: row.modality,
      provider,
      is_featured: row.is_featured,
      is_private: row.org_id !== null,
      capabilities: {
        streaming: !!caps.streaming,
        tools: !!caps.tools,
        json_mode: !!caps.json_mode,
        vision: !!caps.vision,
        audio_in: !!caps.audio_in,
        thinking: !!caps.thinking,
        web_search: !!caps.web_search,
        context_window:
          typeof caps.context_window === "number" ? caps.context_window : null,
        max_output:
          typeof caps.max_output === "number" ? caps.max_output : null,
      },
      pricing: {
        input_cents_per_mtok:
          typeof pricing.input_cents_per_mtok === "number"
            ? pricing.input_cents_per_mtok
            : null,
        output_cents_per_mtok:
          typeof pricing.output_cents_per_mtok === "number"
            ? pricing.output_cents_per_mtok
            : null,
        cached_cents_per_mtok:
          typeof pricing.cached_cents_per_mtok === "number"
            ? pricing.cached_cents_per_mtok
            : null,
      },
      off_peak: row.off_peak as { window_utc?: string; discount_pct?: number } | null,
    };
  });
}

export default async function ModelsCatalogPage() {
  const user = await requireAuthProfile();
  const org = await getOrBootstrapOrgForUser(user.id, user.email ?? "");
  const models = await loadCatalog(org.org_id);

  return <ModelCatalog models={models} orgName={org.org_name} />;
}
