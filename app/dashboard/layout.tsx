import { AppSidebar } from "@/components/dashboard/sidebar";
import { requireAuthProfile } from "@/lib/supabase/auth";
import { SessionProvider } from "./provider";
import { Projects } from "@/lib/supabase/queries";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default async function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  const user = await requireAuthProfile();
  const projects = await Projects.get_all_by_user(user.id);

  return (
    <SessionProvider initialUser={user} initialProjects={projects}>
      <div className="flex h-screen bg-black">
        <AppSidebar projects={projects} user={user} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </SessionProvider>
  );
}
