import { SidebarProvider } from "@/components/ui/sidebar";
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
      <SidebarProvider>
        <AppSidebar projects={projects} user={user} />
        {children}
      </SidebarProvider>
    </SessionProvider>
  );
}
