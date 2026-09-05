import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { AuditLogService } from "@/lib/audit";
import { getAuditContext } from "@/lib/audit/context";
import { sanitizeAuthError, logError } from "@/lib/api/error-sanitizer";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  
  // Get current user before signing out
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;
  const userEmail = user?.email;
  
  // Get user profile for additional info
  let username: string | undefined;
  if (userId) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("username, roles")
      .eq("id", userId)
      .single();
    username = profile?.username;
  }
  
  const { error } = await supabase.auth.signOut();

  if (error) {
    logError("POST /api/auth/signout", error);
    return NextResponse.json({ error: sanitizeAuthError(error) }, { status: 500 });
  }

  // Log logout action if we had a user
  if (userId) {
    try {
      const context = getAuditContext(request);
      await AuditLogService.create({
        user_id: userId,
        user_role: 'user',
        user_email: userEmail,
        user_username: username,
        action: 'logout',
        service_type: 'auth',
        service_id: userId,
        service_name: 'User Logout',
        metadata: {
          logout_method: 'manual',
        },
        ...context,
      });
    } catch (auditError) {
      logError('POST /api/auth/signout audit', auditError);
      // Don't fail logout if audit logging fails
    }
  }

  return NextResponse.json({ message: "Signed out successfully" });
}

/**
 * GET: end the session and land on /signin with a reason.
 *
 * Used by server components that discover mid-render that the session must
 * not continue (a suspended account in requireAuthProfile). A layout cannot
 * clear auth cookies itself, and redirecting a signed-in user to /signin only
 * bounces them back to the dashboard, so the redirect comes here first. The
 * reason is constrained to a known set so this cannot become an open
 * message-injection point on the sign-in page.
 */
const SIGNOUT_REASONS = new Set(["account_suspended", "mfa_required", "session_expired"]);

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) logError("GET /api/auth/signout", error);
  const requested = request.nextUrl.searchParams.get("reason") ?? "";
  const reason = SIGNOUT_REASONS.has(requested) ? requested : "";
  const url = request.nextUrl.clone();
  url.pathname = "/signin";
  url.search = reason ? `?error=${reason}` : "";
  return NextResponse.redirect(url, { status: 303 });
}
