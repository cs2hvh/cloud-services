import { NavbarClient } from "./navbar-client";

// Auth state for the marketing navbar is resolved on the CLIENT: NavbarClient
// seeds from the browser session and subscribes to onAuthStateChange.
//
// We intentionally do NOT call getUser() here. Reading the session server-side
// touched cookies during render, which forced EVERY marketing page to be
// dynamically server-rendered (ƒ) and added a Supabase Auth round-trip to TTFB.
// With no server-side auth read, the marketing pages can be statically
// generated and CDN-cached. A logged-in visitor briefly sees the signed-out
// navbar until the client session hydrates — an acceptable trade for public
// marketing pages (the dashboard is unaffected; it does not use this navbar).
export function Navbar() {
  return <NavbarClient initialUser={null} />;
}
