import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authenticateUser } from "@/lib/auth/server-auth";

export async function GET() {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const supabase = await createClient();

    // Fetch all available database types with their versions
    const { data: databaseTypes, error } = await supabase
      .from("database_types")
      .select("*")
      .eq("available", true)
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching database types:", error);
      return NextResponse.json(
        { error: "Failed to fetch database types" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: databaseTypes,
    });
  } catch (error) {
    console.error("Error in database-types API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
