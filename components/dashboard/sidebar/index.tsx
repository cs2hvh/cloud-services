"use client";

import * as React from "react"
import { Frame, LifeBuoy, Map, Minus, PieChart, Plus, Send } from "lucide-react"

import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
    SidebarRail,
} from "@/components/ui/sidebar"
import { NavProjects } from "./nav/projects";
import { NavSecondary } from "./nav/secondary";
import { NavUser } from "./nav/user";
import { User } from "@supabase/supabase-js";
import { usePathname } from "next/navigation";
import { Tables } from "@/lib/supabase/types";
import { NavServices } from "./nav/services";

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
    user: User
    projects: Tables<'projects'>[]
    // sidebar: SidebarItemGroup[];
};

export function AppSidebar({ user, projects, ...props }: AppSidebarProps) {

    const pathName = usePathname()

    return (
        <Sidebar {...props}>
            <SidebarHeader>
                <SidebarMenuButton
                    size="lg"
                    className="justify-center"
                >
                    <div className="z-10 font-medium text-xl tracking-wider select-none">
                        AhuraSense Cloud
                    </div>
                    {/* <ChevronsUpDown className="ml-auto" /> */}
                </SidebarMenuButton>
            </SidebarHeader>
            <SidebarContent>
                {/* <NavMain items={data.navMain} /> */}
                <NavProjects projects={projects} />
                <NavServices />
                <NavSecondary />
            </SidebarContent>
        </Sidebar>
    )
}
