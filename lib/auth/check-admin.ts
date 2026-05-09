import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/auth";

/**
 * Utility function to check if user has admin role
 * @returns {Promise<{authorized: boolean, user: any}>}
 */
export async function checkAdminAuth() {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return { authorized: false, user: null };
  }

  const supabase = await createClient();
  
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { authorized: false, user: null };
  }
  return { authorized: true, user };
}
