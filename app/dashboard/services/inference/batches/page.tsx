import { createClient } from "@supabase/supabase-js";

import { requireAuthProfile } from "@/lib/supabase/auth";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import {
  Batches,
  type BatchListItem,
  type BatchFileOption,
} from "@/components/dashboard/inference/batches";

export const dynamic = "force-dynamic";

interface BatchRowRaw {
  id: string;
  endpoint: string;
  status: string;
  input_file_id: string;
  output_file_id: string | null;
  error_file_id: string | null;
  request_counts: { total?: number; completed?: number; failed?: number } | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
  failed_at: string | null;
  cancelled_at: string | null;
  expires_at: string;
}

interface FileRowRaw {
  id: string;
  filename: string;
  bytes: number;
  purpose: string;
  created_at: string;
}

async function loadBatches(orgId: string): Promise<BatchListItem[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data } = await supabase
    .schema("inference")
    .from("batches")
    .select(
      "id, endpoint, status, input_file_id, output_file_id, error_file_id, request_counts, metadata, created_at, completed_at, failed_at, cancelled_at, expires_at"
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<BatchRowRaw[]>();
  return (data ?? []).map((b) => ({
    id: b.id,
    endpoint: b.endpoint,
    status: b.status as BatchListItem["status"],
    input_file_id: b.input_file_id,
    output_file_id: b.output_file_id,
    error_file_id: b.error_file_id,
    counts: {
      total: Number(b.request_counts?.total ?? 0),
      completed: Number(b.request_counts?.completed ?? 0),
      failed: Number(b.request_counts?.failed ?? 0),
    },
    metadata: (b.metadata ?? {}) as Record<string, string>,
    created_at: b.created_at,
    completed_at: b.completed_at,
    failed_at: b.failed_at,
    cancelled_at: b.cancelled_at,
    expires_at: b.expires_at,
  }));
}

async function loadInputFiles(orgId: string): Promise<BatchFileOption[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data } = await supabase
    .schema("inference")
    .from("files")
    .select("id, filename, bytes, purpose, created_at")
    .eq("org_id", orgId)
    .eq("purpose", "batch")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<FileRowRaw[]>();
  return (data ?? []).map((f) => ({
    id: f.id,
    filename: f.filename,
    bytes: Number(f.bytes),
    created_at: f.created_at,
  }));
}

export default async function BatchesPage() {
  const user = await requireAuthProfile();
  const org = await getOrBootstrapOrgForUser(user.id, user.email ?? "");
  const [batches, files] = await Promise.all([
    loadBatches(org.org_id),
    loadInputFiles(org.org_id),
  ]);
  return <Batches initialBatches={batches} initialFiles={files} orgName={org.org_name} />;
}
