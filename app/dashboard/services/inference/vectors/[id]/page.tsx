import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

import { requireAuthProfile } from "@/lib/supabase/auth";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import {
  VectorCollectionDetail,
  type VectorCollectionRecord,
} from "@/components/dashboard/inference/vector-detail";

export const dynamic = "force-dynamic";

export default async function VectorCollectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAuthProfile();
  const org = await getOrBootstrapOrgForUser(user.id, user.email ?? "");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data } = await supabase
    .schema("inference")
    .from("vector_collections")
    .select(
      "id, name, description, dimensions, distance_metric, embedding_model_id, index_type, row_count, size_bytes, created_at, updated_at"
    )
    .eq("id", id)
    .eq("org_id", org.org_id)
    .maybeSingle<VectorCollectionRecord>();

  if (!data) notFound();

  return <VectorCollectionDetail collection={data} orgName={org.org_name} canMutate={org.role !== "viewer"} />;
}
