import { Suspense } from "react";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { requireAdmin } from "@/lib/supabase/auth";
import { notFound } from "next/navigation";
import AdminAIAgents from "@/components/admin/ai-agents/admin-ai-agents";
import { PlatformModels } from "@/lib/supabase/queries/ai_agents";

export const dynamic = "force-dynamic";

const AdminAIAgentsSuspense = async () => {
  const checkAdmin = await requireAdmin();

  if (!checkAdmin.ok) {
    notFound();
  }

  const models = await PlatformModels.list_all();

  return <AdminAIAgents initialModels={models} />;
};

const AdminAIAgentsPage = async () => {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner />
        </div>
      }
    >
      <AdminAIAgentsSuspense />
    </Suspense>
  );
};

export default AdminAIAgentsPage;
