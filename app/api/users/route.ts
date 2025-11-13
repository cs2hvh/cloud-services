import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";

export async function GET(request: Request) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const usersParam = searchParams.get("ids");

  if (!usersParam) {
    return NextResponse.json({ error: "Missing users param" }, { status: 404 });
  }

  const userIds = usersParam
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);

  if (userIds.length === 0) {
    return NextResponse.json({ error: "Invalid users param" }, { status: 404 });
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("user_profiles")
      .select("id, username, avatar")
      .in("id", userIds)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Supabase] Error while getting users:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[Supabase] Error while getting users:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
