import React from "react";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { NavUser } from "./nav/user";

export interface SidebarLayoutProps {
  children: React.ReactNode;
}

export const SidebarLayout: React.FC<SidebarLayoutProps> = ({ children }) => {
  return (
    <SidebarInset>
      <header className="flex sticky top-0 bg-background h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <div className="flex flex-row w-full justify-between items-center">
          <div>search</div>
          <NavUser />
        </div>
      </header>
      <main className="container max-w-screen-2xl px-4 sm:px-14 mx-auto pb-4">
        {children}
      </main>
    </SidebarInset>
  );
};
