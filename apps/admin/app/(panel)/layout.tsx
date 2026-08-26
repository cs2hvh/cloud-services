import { requireAdmin } from "@/lib/supabase/auth";
import { notFound } from "next/navigation";
import { ConfirmProvider } from "@/components/ui/confirm";
import { Sidebar } from "@admin/components/sidebar";
import { SignOutButton } from "@admin/components/sign-out-button";

export const dynamic = "force-dynamic";

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The middleware already gates every request; this is defense in depth so
  // the panel never renders for a non-admin even if the middleware matcher
  // misses a path.
  const admin = await requireAdmin();
  if (!admin.ok) {
    notFound();
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-black/20 px-6">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-300">
            Production data
          </span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white"
                style={{
                  background: "linear-gradient(135deg, #3987e5 0%, #9085e9 100%)",
                }}
              >
                {(admin.email || "?").slice(0, 1).toUpperCase()}
              </span>
              <span className="text-sm text-muted-foreground">{admin.email}</span>
            </div>
            <SignOutButton />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <ConfirmProvider>{children}</ConfirmProvider>
        </main>
      </div>
    </div>
  );
}
