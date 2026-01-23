import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { AuditLogService } from "@/lib/audit";
import { getAuditContext } from "@/lib/audit/context";

export async function POST(request: Request) {
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
    return NextResponse.json({ error: error.message }, { status: 500 });
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
      console.error('Failed to log logout action:', auditError);
      // Don't fail logout if audit logging fails
    }
  }

  return NextResponse.json({ message: "Signed out successfully" });
}
