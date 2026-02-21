import { AppSidebar } from "@/components/dashboard/sidebar";
import { requireAuthProfile } from "@/lib/supabase/auth";
import { SessionProvider } from "./provider";
import { Projects } from "@/lib/supabase/queries/projects";
import { NotificationBell } from "@/components/dashboard/notifications";
import { BadgeDollarSign, Search, User } from "lucide-react";
import Link from "next/link";

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
      <div className="flex h-screen dashboard-bg">
        <AppSidebar projects={projects} user={user} />
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Glass Header */}
          <header className="h-12 flex items-center justify-between px-6 flex-shrink-0 border-b border-white/[0.06] bg-black/30 backdrop-blur-xl">
            {/* Breadcrumb area */}
            <div className="flex items-center gap-2 text-[13px] text-white/55 font-medium">
              <span className="text-white/70">⊙</span>
              <span>Dashboard</span>
            </div>
            {/* Right actions */}
            <div className="flex items-center gap-1">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.05] border border-white/[0.08] mr-2">
                <Search className="w-3.5 h-3.5 text-white/40" />
                <span className="text-[12px] text-white/35 hidden sm:inline">Search...</span>
              </div>
              <NotificationBell />
              <Link
                href="/dashboard/nav/billing"
                className="p-2 text-white/50 hover:text-white/80 hover:bg-white/[0.05] transition-all"
              >
                <BadgeDollarSign className="w-4 h-4" />
              </Link>
              <Link
                href="/dashboard/nav/profile"
                className="p-2 text-white/50 hover:text-white/80 hover:bg-white/[0.05] transition-all"
              >
                <User className="w-4 h-4" />
              </Link>
            </div>
          </header>
          <main className="flex-1 overflow-y-auto custom-scrollbar">
            {children}
          </main>
        </div>
      </div>
    </SessionProvider>
  );
}
