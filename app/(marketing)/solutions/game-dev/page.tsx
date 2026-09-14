import { GameDevLanding } from "@/components/solutions/game-dev/landing";
import { notFound } from "next/navigation";

// Hidden with Game Servers (hv, 2026-09-14). The page and its components are
// untouched; this route simply 404s so it cannot be reached or indexed.
export default function GameDevPage() {
  notFound();
    return <GameDevLanding />;
}
