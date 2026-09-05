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

  // SECOND FACTOR. Enrolling TOTP used to protect nothing on the server:
  // /api/auth/signin/email calls signInWithPassword, which mints a full aal1
  // session cookie, and then merely RETURNS whether the account has a verified
  // factor. The TOTP step was a client-side redirect, so anyone holding just the
  // password could skip it and use the session directly against every API route.
  // No server code checked assurance level anywhere except /api/auth/mfa/status,
  // which only reports it.
  //
  // nextLevel is what this account is entitled to reach: it is "aal2" only when
  // a verified factor exists. So this refuses precisely the accounts that
  // enrolled a factor and have not yet presented it, and leaves accounts without
  // MFA untouched.
  //
  // Deliberately fail-OPEN if the call itself throws. The assurance level is
  // read from the session JWT rather than fetched, so a throw here means
  // something is wrong with the library or the token shape, and turning that
  // into a platform-wide lockout of every MFA user is a worse outcome than the
  // window it leaves. A definite aal1-where-aal2-is-required is still refused.
  try {
    const { data: aal } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      return {
        authenticated: false as const,
        user: null,
        response: NextResponse.json(
          {
            message: "Two-factor authentication required",
            code: "mfa_required",
          },
          { status: 401 }
        ),
      };
    }
  } catch (aalError) {
    console.error(
      "[authenticateUser] assurance level unreadable, allowing:",
      aalError instanceof Error ? aalError.message : "unknown"
    );
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
