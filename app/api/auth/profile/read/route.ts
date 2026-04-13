import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server"; // use your own configured supabase helper
import { logError, sanitizeError } from "@/lib/api/error-sanitizer";

type AuthProfile = {
  id: string;
  email: string | undefined;
  phone: string | undefined;
  profilePic: string | undefined;
  displayName: string | undefined;
  userName: string | undefined;
  created_at?: string;
  updated_at?: string;
};

export async function GET() {
  try {
    const supabase = await createClient();

    // Must be logged in
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const u = user;
    const payload: AuthProfile = {
      id: u.id,
      email: u.email,
      phone: u.phone,
      profilePic: u.user_metadata?.avatar_url ?? undefined,
      displayName: u.user_metadata?.display_name ?? undefined,
      userName: u.user_metadata?.username ?? undefined,
      created_at: u.created_at,
      updated_at: (u as { updated_at?: string }).updated_at,
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (e: unknown) {
    logError("GET /api/auth/profile/read", e);
    return NextResponse.json({ error: sanitizeError(e) }, { status: 500 });
  }
}
