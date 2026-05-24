import { createClient } from "@supabase/supabase-js";

import { requireAuthProfile } from "@/lib/supabase/auth";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import {
  Deployments,
  type Deployment,
} from "@/components/dashboard/inference/deployments";

export const dynamic = "force-dynamic";

async function loadDeployments(orgId: string): Promise<Deployment[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data } = await supabase
    .schema("inference")
    .from("deployments")
    .select(
      "id, name, source, source_ref, source_revision, gpu_sku, autoscale, status, runpod_endpoint_id, image_uri, model_id, error_message, deployed_at, created_at, updated_at"
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<Deployment[]>();

  return data ?? [];
}

export default async function DeploymentsPage() {
  const user = await requireAuthProfile();
  const org = await getOrBootstrapOrgForUser(user.id, user.email ?? "");
  const items = await loadDeployments(org.org_id);

  return <Deployments initial={items} orgName={org.org_name} />;
}
