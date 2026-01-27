import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { AuditLogService, getAuditContext } from "@/lib/audit";

// Shape of accepted payload
type ChangePasswordBody = {
  currentPassword: string;
  newPassword: string;
};

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Must be logged in
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: ChangePasswordBody = await req.json();
    const { currentPassword, newPassword } = body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { message: "Current password and new password are required" },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { message: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    // Use service client to verify current password by attempting to sign in
    // This is the most reliable way to verify a password without affecting the user's session
    const supabaseService = await createServiceClient();
    
    const { error: signInError } = await supabaseService.auth.signInWithPassword({
      email: user.email!,
      password: currentPassword
    });

    if (signInError) {
      return NextResponse.json(
        { message: "Current password is incorrect" },
        { status: 400 }
      );
    }

    // IMPORTANT: We don't sign out here because we're using the service client
    // which doesn't persist sessions. This avoids session conflicts.

    // Update user password using the user's own session to preserve login
    // This is the key change - we use the user's session instead of admin methods
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (updateError) {
      return NextResponse.json(
        { message: updateError.message || "Failed to update password" },
        { status: 400 }
      );
    }

    // Audit log: password changed
    const auditContext = getAuditContext(req);
    await AuditLogService.create({
      user_id: user.id,
      user_role: 'user',
      user_email: user.email,
      action: 'password_change',
      service_type: 'auth',
      service_id: `password_${user.id}`,
      service_name: 'Password Change',
      metadata: { 
        status: 'success',
      },
      ip_address: auditContext.ipAddress,
      user_agent: auditContext.userAgent,
      request_id: auditContext.requestId,
    });

    return NextResponse.json(
      { message: "Password changed successfully" },
      { status: 200 }
    );
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Failed to change password.";
    return NextResponse.json({ message: message }, { status: 500 });
  }
}