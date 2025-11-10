import { createClient, createSSRClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { name, description } = await req.json();
    const supabase = await createSSRClient();

    // Get the current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("projects")
      .insert({
        name,
        description,
        owner: user.id,
        users: [user.id],
      })
      .select("id")
      .single();

    if (error) {
      console.error("[POST /projects]", error);
      return NextResponse.json({ message: error.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        message: "Project created successfully",
        id: data.id,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[POST /projects]", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}
