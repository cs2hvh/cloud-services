import { NextResponse } from "next/server";
import { createSSRClient } from "@/lib/supabase/server"; // your server-side helper
import { authenticateUser } from "@/lib/auth/server-auth";

export const dynamic = "force-dynamic"; // avoid caching

export async function POST(
//   req: Request



) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  const supabase = await createSSRClient();

  const { data, error } = await supabase
    .from("clusters")
    .select("*")
    .match({ owner_id: auth.user.id })
    ;
    console.log({ owner_id: auth.user.id });
   

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { success: false, error: "Cluster not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    data: data
  });
}

// export async function GET(_req: Request) {
//   const supabase = await createSSRClient();

//   const { data, error } = await supabase
//     .from("clusters")
//     .select("*");

//   if (error) {
//     return NextResponse.json(
//       { success: false, error: error.message },
//       { status: 400 }
//     );
//   }

//   if (!data) {
//     return NextResponse.json(
//       { success: false, error: "Cluster not found" },
//       { status: 404 }
//     );
//   }

//   return NextResponse.json({
//     success: true,
//     data: data
//   });
// }
