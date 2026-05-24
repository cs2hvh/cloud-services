import { createClient } from "@supabase/supabase-js";

import { requireAuthProfile } from "@/lib/supabase/auth";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import {
  FineTuning,
  type FineTuneJob,
  type FineTuneBaseModel,
} from "@/components/dashboard/inference/fine-tuning";

export const dynamic = "force-dynamic";

const ALLOWED_BASES = [
  "meta-llama/llama-4-scout",
  "meta-llama/llama-4-maverick",
  "meta-llama/llama-3.3-70b-instruct",
  "meta-llama/llama-3.3-8b-instruct",
  "deepseek/deepseek-v3.2",
  "qwen/qwen-3-235b-instruct",
  "qwen/qwen-3-32b-instruct",
  "qwen/qwen-3-14b-instruct",
  "qwen/qwen-3-8b-instruct",
  "mistralai/mistral-large-3",
  "mistralai/mistral-nemo",
  "microsoft/phi-4",
  "google/gemma-4-27b-it",
];

async function loadBases(orgId: string): Promise<FineTuneBaseModel[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data } = await supabase
    .schema("inference")
    .from("models")
    .select("model_id, display_name, capabilities, pricing")
    .in("model_id", ALLOWED_BASES)
    .eq("is_active", true)
    .or(`org_id.is.null,org_id.eq.${orgId}`);

  return (data ?? []).map((m) => {
    const caps = (m.capabilities ?? {}) as Record<string, unknown>;
    const pricing = (m.pricing ?? {}) as Record<string, unknown>;
    return {
      model_id: m.model_id as string,
      display_name: m.display_name as string,
      context_window:
        typeof caps.context_window === "number" ? caps.context_window : null,
      input_cents_per_mtok:
        typeof pricing.input_cents_per_mtok === "number" ? pricing.input_cents_per_mtok : null,
    };
  });
}

async function loadJobs(orgId: string): Promise<FineTuneJob[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data } = await supabase
    .schema("inference")
    .from("finetunes")
    .select(
      "id, name, base_model_id, method, status, gpu_sku, training_seconds, cost_cents, queued_at, started_at, completed_at, output_model_id, error_message, created_at"
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<FineTuneJob[]>();

  return data ?? [];
}

export default async function FineTuningPage() {
  const user = await requireAuthProfile();
  const org = await getOrBootstrapOrgForUser(user.id, user.email ?? "");
  const [bases, jobs] = await Promise.all([loadBases(org.org_id), loadJobs(org.org_id)]);

  return <FineTuning bases={bases} initial={jobs} orgName={org.org_name} />;
}
