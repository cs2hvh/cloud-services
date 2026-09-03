"use client";

// Responsive shell: static sidebar on lg+, slide-over drawer below it.
// Client because the drawer needs state; auth stays in the server layout.

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "@admin/components/sidebar";
import { SignOutButton } from "@admin/components/sign-out-button";

export function PanelChrome({
  email,
  children,
}: {
  email: string | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          {/* Tapping any nav link closes the drawer — delegation beats
              threading a callback through every sidebar item. */}
          <div
            className="bg-[#0b0c0f] shadow-2xl"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("a")) setOpen(false);
            }}
          >
            <Sidebar />
          </div>
          <div
            className="flex-1 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-black/20 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setOpen(true)}
              className="-ml-1 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-300">
              Production data
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white"
                style={{
                  background: "linear-gradient(135deg, #3987e5 0%, #9085e9 100%)",
                }}
              >
                {(email || "?").slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden text-sm text-muted-foreground md:block">{email}</span>
            </div>
            <SignOutButton />
          </div>
        </header>
        <main className="custom-scrollbar flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
