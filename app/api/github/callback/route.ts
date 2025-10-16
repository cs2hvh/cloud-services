import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    
    if (!code || !state) {
      return NextResponse.redirect(`${process.env.DOMAIN}/dashboard/services/apps/new?error=missing_code`);
    }

    // Extract user ID from state
    const userId = state.split('-')[0];
    
    const supabase = await createClient();
    
    // Verify the user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user || user.id !== userId) {
      return NextResponse.redirect(`${process.env.DOMAIN}/dashboard/services/apps/new?error=invalid_user`);
    }

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

    // Store the GitHub access token in your database
    // You'll need to create a table for storing these tokens
    const { error: insertError } = await supabase
      .from('github_tokens')
      .upsert({
        user_id: user.id,
        access_token: accessToken,
        github_username: githubUser.login,
        github_user_id: githubUser.id,
        scopes: tokenData.scope,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (insertError) {
      console.error('Failed to store GitHub token:', insertError);
      return NextResponse.redirect(`${process.env.DOMAIN}/dashboard/services/apps/new?error=token_storage_failed`);
    }

    console.log('Successfully stored GitHub access token for user:', user.id);

    // Redirect back to the app deployment page with success
    return NextResponse.redirect(`${process.env.DOMAIN}/dashboard/services/apps/new?github_connected=true`);

  } catch (error) {
    console.error("[GitHub Callback] Error:", error);
    return NextResponse.redirect(`${process.env.DOMAIN}/dashboard/services/apps/new?error=callback_failed`);
  }
}
