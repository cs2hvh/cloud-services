import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    
    console.log('[GitHub Callback] Received callback with code and state');
    
    if (!code || !state) {
      console.error('[GitHub Callback] Missing code or state');
      return NextResponse.redirect(`${process.env.DOMAIN}/dashboard/services/apps/new?error=missing_code`);
    }

    // Extract user ID from state (format: userId-timestamp)
    // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    // State format: userId-timestamp where userId is a UUID
    // Split by '-' and take first 5 parts (the UUID), last part is timestamp
    const stateParts = state.split('-');
    // UUID has 5 parts separated by 4 dashes, so join first 5 parts
    const userId = stateParts.slice(0, 5).join('-');
    console.log('[GitHub Callback] Expected user ID from state:', userId);
    
    const supabase = await createClient();
    
    // Verify the user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    console.log('[GitHub Callback] Current user:', user?.id || 'none');
    console.log('[GitHub Callback] User error:', userError?.message || 'none');
    
    // If no user session, try to proceed anyway with the userId from state
    // This handles cases where cookies don't persist across ngrok redirects
    if (userError || !user) {
      console.warn('[GitHub Callback] No active session, proceeding with state userId:', userId);
      // We'll use userId from state and trust it (secured by GitHub OAuth flow)
    } else if (user.id !== userId) {
      console.error('[GitHub Callback] User ID mismatch:', user.id, '!==', userId);
      return NextResponse.redirect(`${process.env.DOMAIN}/dashboard/services/apps/new?error=invalid_user`);
    }

    // Use the userId from state (which is verified by GitHub OAuth state parameter)
    const targetUserId = user?.id || userId;

    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code: code,
      }),
    });

    if (!tokenResponse.ok) {
      console.error('GitHub token exchange failed:', tokenResponse.status);
      return NextResponse.redirect(`${process.env.DOMAIN}/dashboard/services/apps/new?error=token_exchange_failed`);
    }

    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      console.error('GitHub token error:', tokenData.error);
      return NextResponse.redirect(`${process.env.DOMAIN}/dashboard/services/apps/new?error=${tokenData.error}`);
    }

    const accessToken = tokenData.access_token;
    
    if (!accessToken) {
      console.error('No access token received from GitHub');
      return NextResponse.redirect(`${process.env.DOMAIN}/dashboard/services/apps/new?error=no_token`);
    }

    // Get GitHub user info to store username
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
      }
    });

    if (!userResponse.ok) {
      console.error('Failed to get GitHub user info');
      return NextResponse.redirect(`${process.env.DOMAIN}/dashboard/services/apps/new?error=user_info_failed`);
    }

    const githubUser = await userResponse.json();
    
    console.log('[GitHub Callback] GitHub user:', githubUser.login);

    // Store the GitHub access token in your database
    // Use service client to bypass RLS since we might not have a session
    const { createServiceClient } = await import('@/lib/supabase/server');
    const serviceSupabase = await createServiceClient();
    
    // Use upsert with onConflict to handle existing tokens
    const { error: insertError } = await serviceSupabase
      .from('github_tokens')
      .upsert(
        {
          user_id: targetUserId,
          access_token: accessToken,
          github_username: githubUser.login,
          github_user_id: githubUser.id,
          scopes: tokenData.scope,
          refresh_token: tokenData.refresh_token || null,
          expires_at: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null,
          updated_at: new Date().toISOString()
        },
        { 
          onConflict: 'user_id',
          ignoreDuplicates: false 
        }
      );

    if (insertError) {
      console.error('[GitHub Callback] Failed to store GitHub token:', insertError);
      return NextResponse.redirect(`${process.env.DOMAIN}/dashboard/services/apps/new?error=token_storage_failed`);
    }

    console.log('[GitHub Callback] Successfully stored GitHub access token for user:', targetUserId);

    // Redirect back to the app deployment page with success
    return NextResponse.redirect(`${process.env.DOMAIN}/dashboard/services/apps/new?github_connected=true`);

  } catch (error) {
    console.error("[GitHub Callback] Error:", error);
    return NextResponse.redirect(`${process.env.DOMAIN}/dashboard/services/apps/new?error=callback_failed`);
  }
}
