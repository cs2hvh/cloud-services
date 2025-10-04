import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";




export async function POST(req: NextRequest) {

  const json = await req.json();
    
//console.log(json,".............29........");

  const supabase =await createClient();

  // Update only if the row belongs to the user (RLS enforces), and try to avoid races by ensuring it was free.
  const { data, error } = await supabase
  .from('vms')
  .update({ status: 'used' })
  .in('ip_address', json.ipAddress)   // <- match multiple rows by IP
  .eq('status', 'free')    // optional guard: only free -> used
  .select('id, ip_address, username, location, status, created_at');

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: 'Not found or already used' }, { status: 404 });

  return NextResponse.json({
    
    success:true,
    message:"IP status updated successfully",
  });
}
