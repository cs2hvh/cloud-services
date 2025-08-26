"use client";

import * as React from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { NavProjects } from "./nav/projects";
import { NavSecondary } from "./nav/secondary";
import { User } from "@supabase/supabase-js";
import { Tables } from "@/lib/supabase/types";
import { NavServices } from "./nav/services";

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  user: User;
  projects: Tables<"projects">[];
  // sidebar: SidebarItemGroup[];
};

export function AppSidebar({ projects, ...props }: AppSidebarProps) {
  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenuButton size="lg" className="justify-center">
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
  );
}
