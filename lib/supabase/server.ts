import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as clientWorker } from "@supabase/supabase-js";


import { Database } from "./types";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    },
  );
}


export async function createSSRClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    },
  );
}

export async function createServiceClient() {
  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          // This is intentionally empty
        },
      },
    },
  );
}

// export const supabase = await clientWorker(
//       process.env.SUPABASE_URL!,
//       process.env.SUPABASE_SERVICE_ROLE_KEY!,
//       { auth: { persistSession: false, autoRefreshToken: false } }
//     );

export async function createWorkerClient() {
  return clientWorker<Database>(
  process.env.SUPABASE_URL!, // or SUPABASE_URL
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // service role for server-side writes
  { auth: {  persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false } }
);
}
