import { createServerClient } from "@supabase/ssr";
import { createClient as clientWorker } from "@supabase/supabase-js";

import { Database } from "./types";

export async function createClient() {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();

  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: true, // Enable auto-refresh to prevent session expiry
        persistSession: true,
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              // Extend cookie maxAge to match refresh token validity (7 days)
              const extendedOptions = {
                ...options,
                maxAge: options?.maxAge || 604800, // 7 days in seconds
              };
              cookieStore.set(name, value, extendedOptions);
            });
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
  const { cookies } = await import("next/headers");
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
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  // console.log('[createServiceClient] URL:', url);
  // console.log('[createServiceClient] Service key exists:', !!serviceKey);
  // console.log('[createServiceClient] Service key length:', serviceKey?.length);

  return createServerClient(
    url,
    serviceKey,
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

/**
 * Server-side Supabase client for API routes
 * Uses anon key with disabled cookies (like the original proxmox-vm)
 */
export function createServerSupabase(token?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!anon) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options: any = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  };

  // When we have a user token, use anon key with the user's JWT
  if (token) {
    options.global = {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
  }

  return clientWorker<Database>(url, anon, options);
}
