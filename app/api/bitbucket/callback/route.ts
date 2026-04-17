import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createHmac, timingSafeEqual } from "crypto";
import { encryptOAuthToken } from "@/lib/security/token-crypto";
import { getAppBaseUrl } from "@/lib/api/get-app-base-url";
import { getOAuthStateSecret, sanitizeReturnTo } from "@/lib/api/oauth-state";

/**
 * Bitbucket OAuth callback handler
 * Exchanges the authorization code for access and refresh tokens
 * 
 * Bitbucket token response format:
 * {
 *   "access_token": "...",
 *   "token_type": "bearer",
 *   "expires_in": 3600,  // 1 hour
 *   "refresh_token": "...",
 *   "scopes": "repository account"
 * }
 */

type ParsedState = {
  userId: string;
  returnTo: string;
  issuedAt: number;
};
type ParsedStateResult =
  | { ok: true; data: ParsedState }
  | {
      ok: false;
      reason:
        | "missing_secret"
        | "format"
        | "invalid_signature"
        | "invalid_payload"
        | "expired";
    };

function getStateSecret(): string {
  return getOAuthStateSecret(process.env.BITBUCKET_STATE_SECRET, "Bitbucket", "BITBUCKET_STATE_SECRET");
}

function safeReturnPath(path: string | undefined): string {
  return sanitizeReturnTo(path);
}

function parseSignedState(state: string): ParsedStateResult {
  const secret = getStateSecret();
  if (!secret) {
    return { ok: false, reason: "missing_secret" };
  }

  const [payloadB64, signatureB64] = state.split(".");
  if (!payloadB64 || !signatureB64) {
    return { ok: false, reason: "format" };
  }

  try {
    const expectedSignature = createHmac("sha256", secret)
      .update(payloadB64)
      .digest();
    const receivedSignature = Buffer.from(signatureB64, "base64url");

    if (
      expectedSignature.length !== receivedSignature.length ||
      !timingSafeEqual(expectedSignature, receivedSignature)
    ) {
      return { ok: false, reason: "invalid_signature" };
    }

    const payloadRaw = Buffer.from(payloadB64, "base64url").toString("utf8");
    const payload = JSON.parse(payloadRaw) as {
      userId?: string;
      returnTo?: string;
      issuedAt?: number;
    };

    if (!payload.userId || typeof payload.userId !== "string") {
      return { ok: false, reason: "invalid_payload" };
    }

    const issuedAt =
      typeof payload.issuedAt === "number" && Number.isFinite(payload.issuedAt)
        ? payload.issuedAt
        : 0;

    // State is valid for 30 minutes
    if (!issuedAt || Date.now() - issuedAt > 30 * 60 * 1000) {
      return { ok: false, reason: "expired" };
    }

    return {
      ok: true,
      data: {
        userId: payload.userId,
        returnTo: safeReturnPath(payload.returnTo),
        issuedAt,
      },
    };
  } catch {
    return { ok: false, reason: "invalid_payload" };
  }
}

function readReturnToFromSignedPayloadUnsafe(state: string): string {
  try {
    const [payloadB64] = state.split(".");
    if (!payloadB64) return "/dashboard/settings";
    const payloadRaw = Buffer.from(payloadB64, "base64url").toString("utf8");
    const payload = JSON.parse(payloadRaw) as { returnTo?: string };
    return safeReturnPath(payload.returnTo);
  } catch {
    return "/dashboard/settings";
  }
}

export async function GET(request: NextRequest) {
  const domain = getAppBaseUrl(request);
  
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    
    if (!code || !state) {
      return NextResponse.redirect(`${domain}/dashboard/settings?error=missing_code`);
    }

    // Decode state to extract userId and returnTo path
    let userId = "";
    let returnTo = "/dashboard/settings";
    let usedLegacyState = false;
    const hasSignedFormat = state.includes(".");
    const parsedState: ParsedStateResult = hasSignedFormat ? parseSignedState(state) : { ok: false, reason: "format" as const };

    if (parsedState.ok) {
      userId = parsedState.data.userId;
      returnTo = parsedState.data.returnTo;
    } else if (hasSignedFormat) {
      // Signed state present but invalid (signature/expiry/secret mismatch).
      // Do not fall back to legacy parsing for security.
      returnTo = readReturnToFromSignedPayloadUnsafe(state);
      return NextResponse.redirect(`${domain}${returnTo}?error=invalid_state`);
    } else {
      usedLegacyState = true;
      // Backward compatibility with old state format
      try {
        const decoded = Buffer.from(state, "base64").toString("utf-8");
        const parts = decoded.split("|");
        userId = parts[0] || "";
        returnTo = safeReturnPath(parts[2]);
      } catch {
        userId = state.split("-")[0] || "";
      }
    }

    if (!userId) {
      return NextResponse.redirect(`${domain}${returnTo}?error=invalid_state`);
    }
    
    const supabase = await createClient();
    
    // Check active session (if present). Signed state remains source of truth.
    const { data: { user } } = await supabase.auth.getUser();

    // Legacy unsigned state is only accepted when an authenticated session matches.
    // Signed state can continue even if session cookies are stale or belong to a different tab/account.
    if (usedLegacyState && (!user || user.id !== userId)) {
      return NextResponse.redirect(`${domain}${returnTo}?error=invalid_user`);
    }

    const clientId = process.env.BITBUCKET_CLIENT_ID;
    const clientSecret = process.env.BITBUCKET_CLIENT_SECRET;
    const explicitRedirectUri = process.env.BITBUCKET_REDIRECT_URI?.trim();

    if (!clientId || !clientSecret) {
      console.error('Bitbucket OAuth credentials not configured');
      return NextResponse.redirect(`${domain}${returnTo}?error=config_error`);
    }

    // Create Basic Auth header (Bitbucket requires Basic Auth for token exchange)
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    // Exchange code for access token
    // If redirect_uri was provided during authorization, it must be provided here as well.
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
    });

    if (explicitRedirectUri) {
      tokenParams.set('redirect_uri', explicitRedirectUri);
    }

    const tokenResponse = await fetch('https://bitbucket.org/site/oauth2/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`,
      },
      body: tokenParams,
    });

    if (!tokenResponse.ok) {
      console.error('Bitbucket token exchange failed with status:', tokenResponse.status);
      return NextResponse.redirect(`${domain}${returnTo}?error=token_exchange_failed`);
    }

    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      console.error('Bitbucket token error:', tokenData.error);
      return NextResponse.redirect(`${domain}${returnTo}?error=token_exchange_failed`);
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in || 3600; // Default 1 hour
    
    if (!accessToken) {
      console.error('No access token received from Bitbucket');
      return NextResponse.redirect(`${domain}${returnTo}?error=no_token`);
    }

    // Get Bitbucket user info to store username
    const userResponse = await fetch('https://api.bitbucket.org/2.0/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      }
    });

    if (!userResponse.ok) {
      console.error('Failed to get Bitbucket user info');
      return NextResponse.redirect(`${domain}${returnTo}?error=user_info_failed`);
    }

    const bitbucketUser = await userResponse.json();

    // Calculate expiration time
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Store the Bitbucket access token in database
    // IMPORTANT: auth_source='direct' means we issued this token with OUR OAuth credentials
    // and can refresh it ourselves (unlike Supabase-sourced tokens)
    const serviceSupabase = await createServiceClient();
    const { error: insertError } = await serviceSupabase
      .from('bitbucket_tokens')
      .upsert({
        user_id: userId,
        access_token: encryptOAuthToken(accessToken),
        bitbucket_username: bitbucketUser.username || bitbucketUser.nickname,
        bitbucket_user_id: bitbucketUser.account_id || bitbucketUser.uuid,
        scopes: 'repository account',
        refresh_token: encryptOAuthToken(refreshToken), // Critical for Bitbucket - tokens expire in 1 hour!
        expires_at: expiresAt,
        auth_source: 'direct', // Mark as direct OAuth - we can refresh this!
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (insertError) {
      console.error('Failed to store Bitbucket token:', insertError);
      return NextResponse.redirect(`${domain}${returnTo}?error=token_storage_failed`);
    }

    if (!refreshToken) {
      console.warn('Warning: No refresh token received from Bitbucket. Token will expire in 1 hour.');
    }

    // Redirect back to the page where the user initiated the connection
    return NextResponse.redirect(`${domain}${returnTo}?bitbucket_connected=true`);

  } catch (error) {
    console.error("[Bitbucket Callback] Error:", error);
    const returnTo = '/dashboard/settings'; // Default fallback
    return NextResponse.redirect(`${domain}${returnTo}?error=unknown`);
  }
}
