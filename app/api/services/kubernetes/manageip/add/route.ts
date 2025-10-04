import { NextRequest, NextResponse } from "next/server";
import { vmCreateSchema } from "@/types/zod/vm";
import bcrypt from "bcryptjs";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parsed = vmCreateSchema.parse(json);


    console.log(parsed,".............12........");
    const supabase = await createServiceClient();
    const password_hash = await bcrypt.hash(parsed.password as string, 10);

    const { data, error } = await supabase
      .from("vms")
      .insert({
        ip_address: parsed.ipAddress,
        username: parsed.username,
        password_hash,
        location: parsed.location,
        status: parsed.status ?? "free",
        ram: parsed.ram,
        cpu: parsed.cpu,
        storage: parsed.storage,
      })
      .select(
        "id, ip_address, username, location, status,ram,cpu,storage, created_at"
      )
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json(
      {
        id: data.id,
        ipAddress: data.ip_address,
        username: data.username,
        location: data.location,
        status: data.status,
        ram: data.ram,
        cpu: data.cpu,
        storage: data.storage,
        createdAt: data.created_at,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    if (err instanceof Error) {
      return NextResponse.json(
        { error: err.message ?? "Invalid request" },
        { status: 400 }
      );
    } else {
      return NextResponse.json(
        { error: "Unknown error occurred" },
        { status: 400 }
      );
    }
  }
}
