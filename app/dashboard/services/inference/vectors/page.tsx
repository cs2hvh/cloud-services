import { createClient } from "@supabase/supabase-js";

import { requireAuthProfile } from "@/lib/supabase/auth";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import { VectorCollections, type VectorCollection, type EmbeddingModelOption } from "@/components/dashboard/inference/vectors";

export const dynamic = "force-dynamic";

interface ModelRow {
  model_id: string;
  display_name: string;
  capabilities: Record<string, unknown> | null;
  pricing: Record<string, unknown> | null;
  is_featured: boolean;
  sort_order: number;
}

async function loadEmbeddingModels(orgId: string): Promise<EmbeddingModelOption[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data } = await supabase
    .schema("inference")
    .from("models")
    .select("model_id, display_name, capabilities, pricing, is_featured, sort_order")
    .eq("is_active", true)
    .eq("modality", "embedding")
    .or(`org_id.is.null,org_id.eq.${orgId}`)
    .order("is_featured", { ascending: false })
    .order("sort_order", { ascending: true })
    .returns<ModelRow[]>();

  return (data ?? []).map((m) => {
    const caps = (m.capabilities ?? {}) as Record<string, unknown>;
    const pricing = (m.pricing ?? {}) as Record<string, unknown>;
    return {
      model_id: m.model_id,
      display_name: m.display_name,
      dimensions: typeof caps.dimensions === "number" ? caps.dimensions : 1536,
      context_window: typeof caps.context_window === "number" ? caps.context_window : null,
      input_cents_per_mtok:
        typeof pricing.input_cents_per_mtok === "number" ? pricing.input_cents_per_mtok : null,
    };
  });
}

async function loadCollections(orgId: string): Promise<VectorCollection[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data } = await supabase
    .schema("inference")
    .from("vector_collections")
    .select(
      "id, name, description, dimensions, distance_metric, embedding_model_id, row_count, size_bytes, created_at"
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .returns<VectorCollection[]>();

  return data ?? [];
}

export default async function VectorsPage() {
  const user = await requireAuthProfile();
  const org = await getOrBootstrapOrgForUser(user.id, user.email ?? "");
  const [models, collections] = await Promise.all([
    loadEmbeddingModels(org.org_id),
    loadCollections(org.org_id),
  ]);

  return (
    <VectorCollections
      models={models}
      initial={collections}
      orgName={org.org_name}
    />
  );
}
