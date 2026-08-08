import { Suspense } from "react";
import { SidebarLayout } from "@/components/dashboard/sidebar/layout";
import { LoadingSpinner } from "@/components/dashboard/utils/loading";
import { ErrorMessage } from "@/components/dashboard/utils/error";
import ActivityPage from "@/components/dashboard/activity/page";
import type { ProjectLog } from "@/components/dashboard/activity/activity.types";
import { getUser } from "@/lib/supabase/auth";
import { notFound } from "next/navigation";
import { AuditLogService } from "@/lib/audit";
import type { AuditAction, AuditServiceType } from "@/lib/audit/types";

// Authenticated page — reads cookies via getUser(), so it must render per-request.
export const dynamic = "force-dynamic";

// Past-tense labels keep the word the timeline's getEventType() classifies on
// (create / update / delete) while reading cleanly as the colored event label.
const ACTION_LABEL: Record<AuditAction, string> = {
  create: "Created",
  update: "Updated",
  delete: "Deleted",
  login: "Signed in",
  logout: "Signed out",
  token_expired: "Token expired",
  token_refreshed: "Token refreshed",
  webhook_received: "Webhook",
  provider_connect: "Connected",
  provider_disconnect: "Disconnected",
  password_change: "Password changed",
  access: "Accessed",
};

const SERVICE_LABEL: Record<AuditServiceType, string> = {
  kubernetes: "Kubernetes",
  database: "Database",
  network_ddos: "DDoS protection",
  platform_apps: "App",
  object_storage: "Object storage",
  auth: "Account",
  git_webhook: "Git webhook",
  ai_agent: "AI agent",
  agentcore_agent: "Agent",
  knowledge_base: "Knowledge base",
  domain: "Domain",
  compute: "Compute",
};

const ActivitySuspense = async () => {
  try {
    const user = await getUser();
    if (!user) notFound();

    const entries = await AuditLogService.getRecentByUser(user.id, 200);
    const logs: ProjectLog[] = entries.map((entry) => {
      const action = ACTION_LABEL[entry.action] ?? entry.action;
      const service = SERVICE_LABEL[entry.service_type] ?? entry.service_type;
      return {
        id: entry.id,
        event: `${action} ${service}`.trim(),
        text: entry.service_name || entry.user_email || "—",
        created_at: entry.created_at,
      };
    });

    return <ActivityPage logs={logs} />;
  } catch (error) {
    console.error("Error loading activity logs:", error);
    return (
      <ErrorMessage message="Unable to load activity. Please try again later." />
    );
  }
};

const Activity = async () => {
  return (
    <SidebarLayout>
      <div className="relative min-h-full bg-[#08090b] text-white">
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <div
            className="absolute -top-[300px] -right-[200px] h-[800px] w-[800px] blur-[60px]"
            style={{
              background:
                "radial-gradient(circle, rgba(0,149,255,0.07), transparent 60%)",
            }}
          />
          <div
            className="absolute -bottom-[400px] -left-[200px] h-[700px] w-[700px] blur-[70px]"
            style={{
              background:
                "radial-gradient(circle, rgba(0,149,255,0.04), transparent 60%)",
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.018) 1px, transparent 0)",
              backgroundSize: "28px 28px",
            }}
          />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-6xl px-6 py-8 sm:px-10 sm:py-10">
          <Suspense fallback={<LoadingSpinner />}>
            <ActivitySuspense />
          </Suspense>
        </div>
      </div>
    </SidebarLayout>
  );
};

export default Activity;
