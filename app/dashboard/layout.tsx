import { AppSidebar } from "@/components/dashboard/sidebar";
import { requireAuthProfile } from "@/lib/supabase/auth";
import { SessionProvider } from "./provider";
import { Projects } from "@/lib/supabase/queries/projects";
import { NotificationBell } from "@/components/dashboard/notifications";
import { BadgeDollarSign, BanknoteArrowUp, CreditCardIcon, DollarSign } from "lucide-react";
import Link from "next/link";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default async function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  const user = await requireAuthProfile();
  const projects = await Projects.get_all_by_user(user.id);
  // const clusters = await Clusters.get_by_id(user.id);

  return (
    <SessionProvider initialUser={user} initialProjects={projects}>
      <div className="flex h-screen bg-black">
        <AppSidebar projects={projects} user={user}  />
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Dashboard Header with Notifications */}
          <header className="h-14 gap-2 border-b border-slate-800/50 flex items-center justify-end px-4 sm:px-6 bg-black/50 backdrop-blur-sm">
            <NotificationBell />
             <Link href="/dashboard/nav/billing"><BadgeDollarSign /></Link>
          </header>
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </SessionProvider>
  );
}
