/**
 * SSH Key item endpoints
 * PATCH  /api/user/ssh-keys/[keyId] - Rename a key
 * DELETE /api/user/ssh-keys/[keyId] - Remove a key
 *
 * RLS on user_ssh_keys scopes both operations to the session user.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ keyId: string }> }
) {
    const auth = await authenticateUser();
    if (!auth.authenticated) return auth.response;

    const { keyId } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const label = String(body.label ?? "").trim();

    if (!label || label.length > 64) {
        return NextResponse.json(
            { ok: false, error: "Label must be 1-64 characters" },
            { status: 400 }
        );
    }

    const supabase = await createClient();
    const { data, error } = await supabase
        .from("user_ssh_keys")
        .update({ label })
        .eq("id", keyId)
        .select("id, label, key_type, fingerprint_sha256, created_at, last_used_at")
        .maybeSingle();

    if (error) {
        console.error("[SSH Keys PATCH] Error:", error.message);
        return NextResponse.json({ ok: false, error: "Failed to update SSH key" }, { status: 500 });
    }
    if (!data) {
        return NextResponse.json({ ok: false, error: "SSH key not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data });
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ keyId: string }> }
) {
    const auth = await authenticateUser();
    if (!auth.authenticated) return auth.response;

    const { keyId } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
        .from("user_ssh_keys")
        .delete()
        .eq("id", keyId)
        .select("id")
        .maybeSingle();

    if (error) {
        console.error("[SSH Keys DELETE] Error:", error.message);
        return NextResponse.json({ ok: false, error: "Failed to delete SSH key" }, { status: 500 });
    }
    if (!data) {
        return NextResponse.json({ ok: false, error: "SSH key not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
}
