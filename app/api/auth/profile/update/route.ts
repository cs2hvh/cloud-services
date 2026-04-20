import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizeAuthError, sanitizeError, logError } from "@/lib/api/error-sanitizer";

// Shape of accepted payload
type UpdateBody = {
  displayName?: string;
  userName?: string;
  profilePic?: string;
  phone?: string;
  password?: string;
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

    const body: UpdateBody = await req.json();

    const { displayName, userName, profilePic, phone, password } = body;

    // Build update payload
    // (user_metadata lives under `data` in updateUser)
    const metadata: Record<string, unknown> = {};
    if (typeof displayName === "string") metadata.display_name = displayName;
    if (typeof userName === "string") metadata.username = userName;
    if (typeof profilePic === "string") metadata.avatar_url = profilePic;

    // Nothing to update?
    const hasMetadata = Object.keys(metadata).length > 0;
    const hasPassword = typeof password === "string" && password.length > 0;
    const hasPhone = typeof phone === "string" && phone.length > 0;

    if (!hasMetadata && !hasPassword && !hasPhone) {
      return NextResponse.json(
        { error: "No valid fields to update." },
        { status: 400 },
      );
    }

    // Compose attributes for a single updateUser call
    const attrs: {
      data?: Record<string, unknown>;
      password?: string;
      phone?: string;
    } = {};

    if (hasMetadata) attrs.data = metadata;
    if (hasPassword) attrs.password = password;
    if (hasPhone) attrs.phone = phone;

    const { data: updated, error: updErr } =
      await supabase.auth.updateUser(attrs);

    if (updErr) {
      // Common causes:
      // - Password change may require AAL2 (MFA) session
      // - Phone change triggers OTP and may need verification
      logError("auth/profile/update", updErr);
      return NextResponse.json({ error: sanitizeAuthError(updErr) }, { status: 400 });
    }

    // If phone was supplied, Supabase will send/require an OTP to confirm the change.
    // You should complete it on the client by calling `verifyOtp` with type 'phone_change'.
    const notes: string[] = [];
    if (hasPhone) {
      notes.push(
        "Phone update initiated. A verification code may be required to confirm the change.",
      );
    }

    return NextResponse.json(
      {
        success: true,
        user: {
          id: updated?.user?.id ?? user.id,
          email: updated?.user?.email ?? user.email,
          phone: updated?.user?.phone ?? phone ?? user.phone,
          user_metadata: updated?.user?.user_metadata ?? {
            ...user.user_metadata,
            ...metadata,
          },
        },
        notes,
      },
      { status: 200 },
    );
  } catch (e: unknown) {
    logError("auth/profile/update", e);
    return NextResponse.json({ error: sanitizeError(e, "server_error") }, { status: 500 });
  }
}
