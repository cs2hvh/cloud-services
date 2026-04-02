import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

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
 * Authenticate user from Authorization header token
 * Supports both cookie-based and token-based authentication
 * 
 * @param req - Next.js request object
 * @returns Object containing authenticated user or error response
 */
export async function authenticateUserFromHeader(req: NextRequest) {
  // Try to get token from Authorization header
  const authHeader = req.headers.get("authorization");
  let token: string | null = null;

  if (authHeader) {
    // Extract token from "Bearer TOKEN" format
    const parts = authHeader.split(" ");
    if (parts.length === 2 && parts[0] === "Bearer") {
      token = parts[1];
    }
  }

  // If token is provided in header, use it for authentication
  if (token) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return {
        authenticated: false as const,
        user: null,
        response: NextResponse.json(
          { message: "Server configuration error" },
          { status: 500 }
        ),
      };
    }

    // Create a Supabase client with the provided token
    const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.warn("Header token auth failed:", userError?.message || "Unknown auth error");
      return {
        authenticated: false as const,
        user: null,
        response: NextResponse.json(
          { message: "Invalid or expired token" },
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

  // Fall back to cookie-based authentication
  return authenticateUser();
}

/**
 * Type guard to check authentication result
 */
export type AuthResult = Awaited<ReturnType<typeof authenticateUser>>;
