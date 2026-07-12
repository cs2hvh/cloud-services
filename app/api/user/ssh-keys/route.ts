/**
 * SSH Keys Management Endpoints
 * GET  /api/user/ssh-keys - List the user's SSH public keys
 * POST /api/user/ssh-keys - Add a new SSH public key
 *
 * Keys are injected as authorized_keys at instance create/rebuild time.
 * RLS on user_ssh_keys scopes every query to the session user.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { createClient } from "@/lib/supabase/server";
import { isSshKeyParseError, parseSshPublicKey } from "@/lib/compute/ssh-keys";

const MAX_KEYS_PER_USER = 25;

export async function GET() {
    const auth = await authenticateUser();
    if (!auth.authenticated) return auth.response;

    const supabase = await createClient();
    const { data, error } = await supabase
        .from("user_ssh_keys")
        .select("id, label, key_type, fingerprint_sha256, created_at, last_used_at")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("[SSH Keys GET] Error:", error.message);
        return NextResponse.json({ ok: false, error: "Failed to fetch SSH keys" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: data ?? [] });
}

export async function POST(req: NextRequest) {
    const auth = await authenticateUser();
    if (!auth.authenticated) return auth.response;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const label = String(body.label ?? "").trim();
    const rawKey = String(body.public_key ?? "");

    if (!label) {
        return NextResponse.json({ ok: false, error: "Label is required" }, { status: 400 });
    }
    if (label.length > 64) {
        return NextResponse.json(
            { ok: false, error: "Label must be 64 characters or less" },
            { status: 400 }
        );
    }

    const parsed = parseSshPublicKey(rawKey);
    if (isSshKeyParseError(parsed)) {
        return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
    }

    const supabase = await createClient();

    const { count } = await supabase
        .from("user_ssh_keys")
        .select("id", { count: "exact", head: true });
    if ((count ?? 0) >= MAX_KEYS_PER_USER) {
        return NextResponse.json(
            { ok: false, error: `You can store at most ${MAX_KEYS_PER_USER} SSH keys.` },
            { status: 429 }
        );
    }

    const { data, error } = await supabase
        .from("user_ssh_keys")
        .insert({
            user_id: auth.user!.id,
            label,
            public_key: parsed.publicKey,
            key_type: parsed.keyType,
            fingerprint_sha256: parsed.fingerprint,
        })
        .select("id, label, key_type, fingerprint_sha256, created_at")
        .single();

    if (error) {
        if (error.code === "23505") {
            return NextResponse.json(
                { ok: false, error: "This SSH key is already saved on your account." },
                { status: 409 }
            );
        }
        console.error("[SSH Keys POST] Error:", error.message);
        return NextResponse.json({ ok: false, error: "Failed to save SSH key" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data }, { status: 201 });
}
