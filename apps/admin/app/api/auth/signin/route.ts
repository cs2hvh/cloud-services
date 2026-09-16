import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkLoginThrottle, clearEmailThrottle } from "@admin/lib/auth-throttle";

export const dynamic = "force-dynamic";

/**
 * Sign in against Supabase FROM THE SERVER.
 *
 * The browser used to call Supabase directly, which meant an administrator
 * could only reach this panel if their network also allowed the Supabase
 * domain. On 2026-09-15 that assumption failed for real: the login POST was
 * reset in transit (ERR_CONNECTION_RESET) on one machine while the panel
 * itself loaded fine, and an admin was locked out of the tool you need most
 * when something is wrong. Now the browser only ever talks to this origin.
 *
 * Session cookies are written by the SSR cookie handler on the client
 * returned by createClient(), so the middleware sees the session on the very
 * next request — no token is ever handed to the page.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");

  if (!email || !password) {
    return NextResponse.json(
      { ok: false, error: "Email and password are required" },
      { status: 400 },
    );
  }

  const throttle = checkLoginThrottle(request, email);
  if (throttle.limited) {
    return NextResponse.json(
      {
        ok: false,
        error: `Too many sign-in attempts. Try again in ${Math.ceil(throttle.retryAfterSec / 60)} minute(s).`,
      },
      { status: 429, headers: { "Retry-After": String(throttle.retryAfterSec) } },
    );
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      // Supabase's own wording is the useful one here ("Invalid login
      // credentials", "Email not confirmed"); it never names which half was
      // wrong, so passing it through leaks nothing.
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status && error.status < 500 ? 401 : 502 },
      );
    }

    clearEmailThrottle(email);

    // A password-only session on an enrolled account still owes a factor.
    // Report that here so the form can go straight to the code step.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp =
        factors?.totp?.find((f) => f.status === "verified") ?? factors?.totp?.[0];
      if (totp?.id) {
        return NextResponse.json({ ok: true, mfaRequired: true, factorId: totp.id });
      }
    }

    return NextResponse.json({ ok: true, mfaRequired: false });
  } catch (err) {
    // A failure HERE is the panel-to-Supabase hop — the one the browser used
    // to own. Name it plainly so it is never mistaken for a bad password.
    console.error("[admin auth] sign-in failed:", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "The panel could not reach the authentication service. This is a server-side fault, not your password.",
      },
      { status: 502 },
    );
  }
}
