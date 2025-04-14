import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/sidebar";
import { validateRequest } from "@/lib/lucia/auth";
import { SessionProvider } from "./provider";
import { redirect } from "next/navigation";
import query from "@/lib/db/mysql";

interface DashboardLayoutProps {
    children: React.ReactNode;
}

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
    const { user, session } = await validateRequest();

    if (!user) {
        redirect("/signin")
    }

    const projects = await query.projects.get_all_by_user(user.id);

    return (
        <SessionProvider initialUser={user} initialSession={session} initialProjects={projects}>
            <SidebarProvider>
                <AppSidebar projects={projects} user={user} />
                {children}
            </SidebarProvider>
        </SessionProvider>
    );
}