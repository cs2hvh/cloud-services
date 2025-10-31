import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Server-side authentication middleware utility
 * Checks if the user is authenticated via Supabase
 * 
 * @returns Object containing authenticated user or error response
 */
export async function authenticateUser() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();



  if (userError || !user) {
    return {
      authenticated: false as const,
      user: null,
      response: NextResponse.json(
        { message: "Unauthorized - please login" },
        { status: 401 }
      ),
    };
  }

  return {
    authenticated: true as const,
    user,
    response: null,
  };
}

/**
 * Type guard to check authentication result
 */
export type AuthResult = Awaited<ReturnType<typeof authenticateUser>>;
