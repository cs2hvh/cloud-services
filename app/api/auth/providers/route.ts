// app/api/auth/providers/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";


export const revalidate = 0; // no caching for auth-sensitive data

export async function GET(request: Request) {
  const supabase = await createClient();

  // Try to get user from cookies
  let { data: { user }, error } = await supabase.auth.getUser();

  // Fallback: try bearer token
  if (!user) {
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
        console.log("18")
      const token = authHeader.replace("Bearer ", "");
     // console.log(token,"20")
      const {
        data: { user: tokenUser },
      } = await supabase.auth.getUser(token);
      user = tokenUser ?? null;
    }
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }


const allProviders = ["github", "google", "gitlab", "bitbucket", "email"];

 
const lastLoginProvider = user.app_metadata?.provider ?? null;


const linkedProviders = (user.identities ?? []).map((i) => i.provider);

// Build the array of { provider, status }
const providers = allProviders.map((provider) => ({
  provider,
  // status true if this provider was actually linked
  status: linkedProviders.includes(provider),
  // optional: add isCurrent if you want to flag the one used for this session
  //isCurrent: provider === lastLoginProvider,
}));


  return NextResponse.json({
    user_id: user.id,
    providers: providers,
    identities: user.identities ?? [],
  });
}
