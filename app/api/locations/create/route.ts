//create api to create Location in supabase
import { Locations } from "@/lib/supabase/queries";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();

  const supabase_data = await Locations.create(body);

  if (supabase_data.success === false) {
    return NextResponse.json({ error: supabase_data.error }, { status: 500 });
  }

  return NextResponse.json(supabase_data.data, { status: 201 });
}
