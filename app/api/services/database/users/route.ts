import { NextResponse } from "next/server";

// Placeholder - database users endpoint not yet implemented
export async function GET() {
  return NextResponse.json(
    { error: "Endpoint not yet implemented" },
    { status: 501 }
  );
}
