import { getUser } from "@/lib/supabase/auth";
import { NavbarClient } from "./navbar-client";

export async function Navbar() {
  const user = await getUser();

  return <NavbarClient initialUser={user} />;
}
