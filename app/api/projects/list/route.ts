import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = await createClient();

    // Get the current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" }, 
        { status: 401 }
      );
    }

    // Get projects where user is owner or member
    const { data: projects, error } = await supabase
      .from("projects")
      .select("id, name")
      .or(`owner.eq.${user.id},users.cs.["${user.id}"]`)
      .order("name");

    if (error) {
      console.error("[GET /projects/list]", error);
      return NextResponse.json(
        { success: false, error: error.message }, 
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: projects || []
    });
  } catch (error) {
    console.error("[GET /projects/list]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}