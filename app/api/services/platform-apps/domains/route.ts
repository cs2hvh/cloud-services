/**
 * Custom Domain API - List domains for an app
 * GET /api/services/platform-apps/domains?app_id=xxx
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { CustomDomainService } from "@/lib/services/custom-domain";

export async function GET(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const appId = searchParams.get('app_id');

    if (!appId) {
      return NextResponse.json(
        { error: 'Missing app_id parameter' },
        { status: 400 }
      );
    }

    const domains = await CustomDomainService.listDomains(appId, auth.user!.id);

    return NextResponse.json({
      success: true,
      domains,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] Error listing domains:', errorMessage);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
