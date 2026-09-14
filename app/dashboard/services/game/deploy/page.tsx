import GameDeployWizard from "@/components/dashboard/game/deploy-wizard";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

// Game Servers are hidden from customers (hv, 2026-09-14).
// Nothing about the service has been deleted — the components, the API routes,
// the database and the billing all still exist and still work. This route simply
// returns 404 so there is no way in from the browser.
// To bring it back: delete the notFound() call below and restore the sidebar entry
// in components/dashboard/sidebar/index.tsx.
export default function GameDeployPage() {
  notFound();
  return (
    <div className="relative min-h-full bg-[#08090b] text-white">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div
          className="absolute -top-[300px] -right-[200px] h-[800px] w-[800px] blur-[60px]"
          style={{ background: "radial-gradient(circle, rgba(0,149,255,0.07), transparent 60%)" }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.018) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>
      <div className="relative z-10 px-6 py-7 sm:px-10 sm:py-9">
        <GameDeployWizard />
      </div>
    </div>
  );
}
