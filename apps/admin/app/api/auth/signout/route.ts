import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Sign out server-side, clearing the session cookies. Public by design: an
 * admin whose session is refused still needs to be able to drop it, and a
 * request with no session is simply a no-op.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch (err) {
    // The cookies are cleared by the handler regardless; a failure to tell
    // Supabase must not strand someone on a session they asked to end.
    console.error("[admin auth] sign-out failed:", err);
  }
  return NextResponse.json({ ok: true });
}
