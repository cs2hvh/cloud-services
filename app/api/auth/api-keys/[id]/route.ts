/**
 * API Key Management - Single Key Operations
 * DELETE /api/auth/api-keys/[id] - Revoke an API key
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { emailService } from "@/lib/email";
import { ApiKeys } from "@/lib/supabase/queries/api_keys";

/**
 * DELETE /api/auth/api-keys/[id]
 * Revoke (delete) an API key
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const { id: keyId } = await params;

    if (!keyId) {
      return NextResponse.json(
        { error: "Key ID is required" },
        { status: 400 }
      );
    }

    const existingKey = await ApiKeys.get(keyId, auth.user!.id);

    const result = await ApiKeys.delete(keyId, auth.user!.id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to delete API key" },
        { status: 500 }
      );
    }

    const email = auth.user!.email;
    if (email && existingKey) {
      const emailResult = await emailService.sendTemplate({
        template: "apiKeyActivity",
        to: email,
        data: {
          username:
            auth.user!.user_metadata?.username ||
            auth.user!.user_metadata?.display_name ||
            email.split("@")[0],
          keyName: existingKey.name,
          action: "deleted",
          happenedAt: new Date().toISOString(),
        },
      });

      if (!emailResult.success) {
        console.error(
          "[API Keys DELETE] Failed to send API key deleted email:",
          emailResult.error,
        );
      }
    }

    return NextResponse.json({
      message: "API key revoked successfully",
    });
  } catch (error) {
    console.error("[API Keys DELETE] Error:", error);
    return NextResponse.json(
      { error: "Failed to delete API key" },
      { status: 500 }
    );
  }
}
