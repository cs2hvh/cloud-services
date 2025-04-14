import * as React from "react"
import { type LucideIcon } from "lucide-react"
import * as Icons from "lucide-react";
import {
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "@/components/ui/sidebar"
import { cloudServices } from "@/config/services";

export function NavServices() {
    return (
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel>Services</SidebarGroupLabel>
            <SidebarGroupContent>
                <SidebarMenu>
                    {cloudServices.map((item) => {
                        const IconComponent = Icons[item.icon as keyof typeof Icons] as LucideIcon || Icons.HelpCircle;
                        return (
                            <SidebarMenuItem key={item.name}>
                                <SidebarMenuButton asChild>
                                    <a href={`/dashboard/services/${item.id}`}>
                                        <IconComponent className="w-5 h-5" />
                                        <span>{item.name}</span>
                                    </a>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        )
                    })}
                </SidebarMenu>
            </SidebarGroupContent>
        </SidebarGroup>
    )
}
