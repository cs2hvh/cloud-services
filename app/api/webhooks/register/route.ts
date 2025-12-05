/**
 * Webhook Test/Admin Endpoint
 * Use this to manually register webhooks for existing apps
 * 
 * POST /api/webhooks/register
 * Body: { app_id: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase/auth';
import { Platform_Apps, Platform_App_Webhooks } from '@/lib/supabase/queries';
import { WebhookManager } from '@/lib/services/webhook-manager';

export async function POST(req: NextRequest) {
  try {
    // 1. Verify user is authenticated
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get app_id from body
    const body = await req.json();
    const { app_id } = body;

    if (!app_id) {
      return NextResponse.json({ error: 'app_id is required' }, { status: 400 });
    }

    // 3. Get app details
    const appResult = await Platform_Apps.get(app_id);
    if (!appResult.success || !appResult.data) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 });
    }

    const app = appResult.data;

    // 4. Verify ownership
    if (app.user_id !== user.id) {
      return NextResponse.json({ error: 'Not your app' }, { status: 403 });
    }

    // 5. Only support GitHub for now
    if (app.git_provider !== 'github') {
      return NextResponse.json({ 
        error: `Provider ${app.git_provider} not yet supported for auto-deploy` 
      }, { status: 400 });
    }

    // 6. Parse repository owner/name from URL or repository_name
    // repository_url could be: https://github.com/owner/repo.git
    // repository_name could be: owner/repo
    let repoOwner: string;
    let repoName: string;

    if (app.repository_name.includes('/')) {
      [repoOwner, repoName] = app.repository_name.split('/');
    } else {
      // Try to parse from URL
      const urlMatch = app.repository_url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
      if (urlMatch) {
        repoOwner = urlMatch[1];
        repoName = urlMatch[2];
      } else {
        return NextResponse.json({ 
          error: 'Could not parse repository owner/name' 
        }, { status: 400 });
      }
    }

    console.log(`[Webhook Register] Registering webhook for ${repoOwner}/${repoName} (app: ${app.name})`);

    // 7. Register webhook
    const result = await WebhookManager.registerGitHubWebhook(
      app_id,
      user.id,
      repoOwner,
      repoName,
      app.repository_id
    );

    if (!result.success) {
      return NextResponse.json({ 
        error: result.error,
        hint: 'Make sure you have admin access to the repository'
      }, { status: 400 });
    }

    // 8. Update app to enable auto-deploy
    await Platform_Apps.update(app_id, {
      auto_deploy: true,
      deploy_branch: app.branch,
    });

    return NextResponse.json({
      success: true,
      message: `Webhook registered for ${app.name}`,
      webhook_id: result.webhook_id,
      webhook_url: `${process.env.DOMAIN}/api/webhooks/git/github`,
      deploy_branch: app.branch,
    });

  } catch (error: any) {
    console.error('[Webhook Register] Error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}

// GET - List webhooks for user's apps
export async function GET(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get app_id from query params (optional)
    const { searchParams } = new URL(req.url);
    const app_id = searchParams.get('app_id');

    if (app_id) {
      // Get webhooks for specific app
      const appResult = await Platform_Apps.get(app_id);
      if (!appResult.success || appResult.data?.user_id !== user.id) {
        return NextResponse.json({ error: 'App not found' }, { status: 404 });
      }

      const webhooks = await Platform_App_Webhooks.get_by_app(app_id);
      return NextResponse.json({
        app: appResult.data.name,
        webhooks: webhooks.data || [],
      });
    }

    // Get all user's apps with webhook status
    const apps = await Platform_Apps.list_by_owner(user.id);
    
    const appsWithWebhooks = await Promise.all(
      apps.map(async (app: any) => {
        const webhooks = await Platform_App_Webhooks.get_by_app(app.id);
        return {
          id: app.id,
          name: app.name,
          git_provider: app.git_provider,
          branch: app.branch,
          auto_deploy: app.auto_deploy,
          has_webhook: (webhooks.data?.length || 0) > 0,
          webhook_count: webhooks.data?.length || 0,
        };
      })
    );

    return NextResponse.json({ apps: appsWithWebhooks });

  } catch (error: any) {
    console.error('[Webhook List] Error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}

// DELETE - Remove webhook from an app
export async function DELETE(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const app_id = searchParams.get('app_id');

    if (!app_id) {
      return NextResponse.json({ error: 'app_id is required' }, { status: 400 });
    }

    const appResult = await Platform_Apps.get(app_id);
    if (!appResult.success || !appResult.data) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 });
    }

    const app = appResult.data;
    if (app.user_id !== user.id) {
      return NextResponse.json({ error: 'Not your app' }, { status: 403 });
    }

    // Parse repo info
    let repoOwner: string;
    let repoName: string;

    if (app.repository_name.includes('/')) {
      [repoOwner, repoName] = app.repository_name.split('/');
    } else {
      const urlMatch = app.repository_url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
      if (urlMatch) {
        repoOwner = urlMatch[1];
        repoName = urlMatch[2];
      } else {
        // Just delete from database
        await Platform_App_Webhooks.delete(app_id, 'github');
        return NextResponse.json({ success: true, message: 'Webhook removed from database' });
      }
    }

    await WebhookManager.deleteGitHubWebhook(user.id, repoOwner, repoName, app_id);

    // Disable auto-deploy
    await Platform_Apps.update(app_id, { auto_deploy: false });

    return NextResponse.json({ 
      success: true, 
      message: `Webhook removed for ${app.name}` 
    });

  } catch (error: any) {
    console.error('[Webhook Delete] Error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}
