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
  // Minimal retry/tolerance for transient network/fetch failures.
  // If Supabase returns a retryable/network error, return 503 (service unavailable)
  // so callers treat it as a temporary server issue instead of an auth failure.
  function isRetryableAuthError(err: any) {
    if (!err) return false;
    const msg = String(err?.message || "").toLowerCase();
    const name = String(err?.name || "").toLowerCase();
    const causeCode = String(err?.cause?.code || "").toLowerCase();
    return (
      name === "authretryablefetcherror" ||
      msg.includes("fetch failed") ||
      msg.includes("timeout") ||
      causeCode.includes("und_err_connect_timeout") ||
      causeCode.includes("connect_timeout")
    );
  }

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError) {
      if (isRetryableAuthError(userError)) {
        console.error('[authenticateUser] Transient auth error:', userError.message || userError);
        return {
          authenticated: false as const,
          user: null,
          response: NextResponse.json(
            { message: 'Authentication service unavailable' },
            { status: 503 }
          ),
        };
      }

      console.error('[authenticateUser] Auth error:', userError.message || userError);
      return {
        authenticated: false as const,
        user: null,
        response: NextResponse.json(
          { message: 'Authentication required' },
          { status: 401 }
        ),
      };
    }

    if (!user) {
      return {
        authenticated: false as const,
        user: null,
        response: NextResponse.json(
          { message: 'Authentication required' },
          { status: 401 }
        ),
      };
    }

    return {
      authenticated: true as const,
      user,
      response: null,
    };
  } catch (err: any) {
    if (isRetryableAuthError(err)) {
      console.error('[authenticateUser] Transient fetch error:', err);
      return {
        authenticated: false as const,
        user: null,
        response: NextResponse.json(
          { message: 'Authentication service unavailable' },
          { status: 503 }
        ),
      };
    }

    console.error('[authenticateUser] Unexpected error:', err);
    return {
      authenticated: false as const,
      user: null,
      response: NextResponse.json(
        { message: 'Authentication required' },
        { status: 401 }
      ),
    };
  }
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

   // const Buffer.from(base64String, "base64").toString("utf8")

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
   // console.log("reached here with token:", token);
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

   // console.log("Supabase client created with header token", supabase.auth);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.log("User error during header auth:", userError?.cause);
      return {
        userError:userError?.message,
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
