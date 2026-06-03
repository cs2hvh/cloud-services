import { AppSidebar } from "@/components/dashboard/sidebar";
import { requireAuthProfile } from "@/lib/supabase/auth";
import { SessionProvider } from "./provider";
import { Projects } from "@/lib/supabase/queries/projects";
import { NotificationBell } from "@/components/dashboard/notifications";
import { DashboardHeader } from "@/components/dashboard/header";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const user = await requireAuthProfile();
  const projects = await Projects.get_all_by_user(user.id);

  return (
    <SessionProvider initialUser={user} initialProjects={projects}>
      {/*
        Palette:
          page bg  #0c0d11 — very dark slate, not pure black so surfaces above it can stack
          card bg  #15171c — visible elevation when stacked on page
          border   white/[0.07] — present but subtle
      */}
      <div className="flex h-screen bg-[#0c0d11] text-white [&_a]:cursor-pointer [&_button:not(:disabled)]:cursor-pointer [&_button:disabled]:cursor-not-allowed [&_[role=button]]:cursor-pointer [&_[role=tab]]:cursor-pointer [&_[role=menuitem]]:cursor-pointer [&_[role=switch]]:cursor-pointer [&_summary]:cursor-pointer [&_select]:cursor-pointer [&_label[for]]:cursor-pointer">
        <AppSidebar projects={projects} user={user} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <DashboardHeader>
            <NotificationBell />
          </DashboardHeader>
          <main className="flex-1 overflow-y-auto custom-scrollbar bg-[#0c0d11]">
            {children}
          </main>
        </div>
      </div>
    </SessionProvider>
  );
}
