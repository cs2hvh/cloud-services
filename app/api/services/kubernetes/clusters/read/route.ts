import { NextResponse } from "next/server";
import { createSSRClient } from "@/lib/supabase/server"; // your server-side helper

export const dynamic = "force-dynamic"; // avoid caching

export async function POST(
//   req: Request
) {
  const supabase = await createSSRClient();

  const { data, error } = await supabase
    .from("clusters")
    .select("*");
    console.log(data,"...............data 22222");
   

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
