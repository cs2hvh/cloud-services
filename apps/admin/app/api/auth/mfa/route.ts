import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkLoginThrottle } from "@admin/lib/auth-throttle";

export const dynamic = "force-dynamic";

/** The TOTP factor a password-only session still owes, or null. */
async function pendingFactor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<string | null> {
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!(aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2")) return null;
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp =
    factors?.totp?.find((f: { status: string }) => f.status === "verified") ??
    factors?.totp?.[0];
  return totp?.id ?? null;
}

/**
 * GET — does the current session still owe a second factor?
 * Used when the middleware bounces a password-only session to /signin.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    return NextResponse.json({ ok: true, factorId: await pendingFactor(supabase) });
  } catch {
    return NextResponse.json({ ok: false, factorId: null }, { status: 502 });
  }
}

/** POST — verify a TOTP code server-side and upgrade the session to aal2. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    factorId?: string;
    code?: string;
  };
  const factorId = String(body.factorId ?? "").trim();
  const code = String(body.code ?? "").trim();

  if (!factorId || !/^\d{6}$/.test(code)) {
    return NextResponse.json(
      { ok: false, error: "A six-digit authenticator code is required" },
      { status: 400 },
    );
  }

  // Codes are guessable by brute force — throttle them like passwords. The
  // session's own email is not known here without a round trip, so the IP
  // window carries this one.
  const throttle = checkLoginThrottle(request, "");
  if (throttle.limited) {
    return NextResponse.json(
      {
        ok: false,
        error: `Too many attempts. Try again in ${Math.ceil(throttle.retryAfterSec / 60)} minute(s).`,
      },
      { status: 429, headers: { "Retry-After": String(throttle.retryAfterSec) } },
    );
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 401 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin auth] MFA verify failed:", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "The panel could not reach the authentication service. This is a server-side fault, not your code.",
      },
      { status: 502 },
    );
  }
}
