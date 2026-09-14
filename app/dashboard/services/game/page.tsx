import GameDashboard from "@/components/dashboard/game/game-dashboard";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

// Game Servers are hidden from customers (hv, 2026-09-14).
// Nothing about the service has been deleted — the components, the API routes,
// the database and the billing all still exist and still work. This route simply
// returns 404 so there is no way in from the browser.
// To bring it back: delete the notFound() call below and restore the sidebar entry
// in components/dashboard/sidebar/index.tsx.
export default function GameServersPage() {
  notFound();
  return <GameDashboard />;
}
