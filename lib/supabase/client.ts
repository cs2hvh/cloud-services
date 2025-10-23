import { createBrowserClient } from "@supabase/ssr";

export function createClient() {

  //console.log("Creating Supabase client with URL:", process.env.SUPABASE_URL);
  //console.log("Creating Supabase client with ANON KEY:", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  );
}
