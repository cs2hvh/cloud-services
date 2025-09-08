"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  ChevronDown,
  Plus,
  LogOut,
  Circle
} from "lucide-react";
import { Tables } from "@/lib/supabase/types";
import { useRouter } from "next/navigation";
import { useState } from "react";

type AppSidebarProps = {
  user: any;
  projects: Tables<"projects">[];
};

export function AppSidebar({ projects, user }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [projectsExpanded, setProjectsExpanded] = useState(true);

  const handleSignOut = async () => {
    await fetch("/api/auth/signout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    router.push("/signin");
  };

  const navigation = [
    {
      name: "Dashboard",
      href: "/dashboard",
      current: pathname === "/dashboard",
    },
    {
      name: "Activity",
      href: "/dashboard/activity",
      current: pathname === "/dashboard/activity",
    },
    {
      name: "Analytics",
      href: "/dashboard/analytics",
      current: pathname === "/dashboard/analytics",
    },
  ];

  const services = [
    {
      name: "Game Servers",
      href: "/dashboard/services/game",
      current: pathname.includes("/services/game"),
    },
    {
      name: "Databases",
      href: "/dashboard/services/database",
      current: pathname.includes("/services/database"),
    },
    {
      name: "Applications",
      href: "/dashboard/services/apps",
      current: pathname.includes("/services/apps"),
    },
  ];

  return (
    <div className="flex h-screen w-72 flex-col bg-black border-r border-slate-800/50">
      {/* Logo Header */}
      <div className="h-16 flex items-center px-6 border-b border-slate-800/50 bg-slate-900/20">
        <Link href="/dashboard" className="flex items-center">
          <span className="text-xl font-bold text-white">
            AhuraSense
          </span>
        </Link>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-4 py-6 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
        {/* Primary Nav */}
        <div className="space-y-1.5">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={`
                block px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200
                ${item.current
                  ? "bg-white text-black shadow-sm"
                  : "text-slate-300 hover:text-white hover:bg-slate-800/50"
                }
              `}
            >
              {item.name}
            </Link>
          ))}
        </div>

        {/* Projects Section */}
        <div className="mt-10">
          <div className="flex items-center justify-between mb-3 px-1">
            <button
              onClick={() => setProjectsExpanded(!projectsExpanded)}
              className="flex items-center text-xs font-bold text-white/70 uppercase tracking-widest hover:text-white transition-colors"
            >
              Projects
              <ChevronDown className={`ml-1 h-3 w-3 transition-transform ${projectsExpanded ? "" : "-rotate-90"}`} />
            </button>
            <Link
              href="/dashboard/projects/new"
              className="text-white/60 hover:text-white transition-colors p-1 hover:bg-slate-800/30 rounded"
              title="New Project"
            >
              <Plus className="h-4 w-4" />
            </Link>
          </div>
          
          {projectsExpanded && (
            <div className="space-y-1">
              {projects.length > 0 ? (
                <>
                  {projects.slice(0, 5).map((project) => (
                    <Link
                      key={project.id}
                      href={`/dashboard/projects/${project.id}`}
                      className={`
                        flex items-center px-4 py-2.5 text-sm rounded-lg transition-all duration-200
                        ${pathname.includes(`/projects/${project.id}`)
                          ? "bg-white text-black font-medium"
                          : "text-white/60 hover:text-white hover:bg-slate-800/30"
                        }
                      `}
                    >
                      <Circle className="w-2 h-2 mr-3 fill-current opacity-60" />
                      <span className="truncate">{project.name}</span>
                    </Link>
                  ))}
                  {projects.length > 5 && (
                    <Link
                      href="/dashboard/projects"
                      className="block px-4 py-2.5 text-sm text-blue-400 hover:text-blue-300 font-medium"
                    >
                      View all →
                    </Link>
                  )}
                </>
              ) : (
                <p className="px-4 py-2.5 text-sm text-white/40">
                  No projects yet
                </p>
              )}
            </div>
          )}
        </div>

        {/* Services Section */}
        <div className="mt-10">
          <h3 className="px-1 mb-3 text-xs font-bold text-white/70 uppercase tracking-widest">
            Services
          </h3>
          <div className="space-y-1">
            {services.map((service) => (
              <Link
                key={service.name}
                href={service.href}
                className={`
                  block px-3 py-2.5 text-sm font-medium rounded-md transition-all duration-150
                  ${service.current
                    ? "bg-white text-black"
                    : "text-slate-300 hover:text-white hover:bg-slate-800/50"
                  }
                `}
              >
                {service.name}
              </Link>
            ))}
          </div>
        </div>

        {/* Support Section */}
        <div className="mt-8">
          <h3 className="px-1 mb-3 text-xs font-bold text-white/70 uppercase tracking-widest">
            Support
          </h3>
          <div className="space-y-1">
            <Link
              href="/dashboard/settings"
              className={`
                block px-3 py-2.5 text-sm font-medium rounded-md transition-all duration-150
                ${pathname.includes("/settings")
                  ? "bg-white text-black"
                  : "text-slate-300 hover:text-white hover:bg-slate-800/50"
                }
              `}
            >
              Settings
            </Link>
            <Link
              href="/docs"
              className="block px-3 py-2.5 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/50 rounded-md transition-all duration-150"
            >
              Documentation
            </Link>
            <Link
              href="/support"
              className="block px-3 py-2.5 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/50 rounded-md transition-all duration-150"
            >
              Help Center
            </Link>
          </div>
        </div>
      </nav>

      {/* User Section */}
      <div className="border-t border-slate-800/50 p-4 bg-slate-900/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center min-w-0">
            <div className="w-9 h-9 bg-gradient-to-br from-slate-700 to-slate-800 rounded-full flex items-center justify-center text-sm font-medium text-white">
              {user?.email?.charAt(0).toUpperCase() || "U"}
            </div>
            <div className="ml-3 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user?.user_metadata?.full_name || user?.email?.split("@")[0]}
              </p>
              <p className="text-xs text-slate-400 truncate">
                {user?.email}
              </p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="ml-3 p-1.5 text-slate-400 hover:text-white hover:bg-slate-800/50 rounded transition-all duration-150"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}