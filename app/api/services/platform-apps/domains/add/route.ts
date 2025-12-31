/**
 * Custom Domain API - Add a new domain
 * POST /api/services/platform-apps/domains/add
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { CustomDomainService } from "@/lib/services/custom-domain";
import { limitByUser } from "@/lib/cooldown/userbased";
import { Platform_Apps } from "@/lib/supabase/queries";
import { z } from "zod";

const addDomainSchema = z.object({
  app_id: z.string().uuid('Invalid app ID'),
  domain: z.string().min(3, 'Domain is required').max(253, 'Domain too long'),
});

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    // Rate limiting
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:add-domain",
      limit: 10,
      windowMs: 60_000, // 10 domains per minute
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too Many Requests", message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    const body = await req.json();
    
    // Validate input
    const validation = addDomainSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.errors },
        { status: 400 }
      );
    }

    const { app_id, domain } = validation.data;

    // Verify app ownership
    const appResult = await Platform_Apps.get(app_id);
    if (!appResult.success || !appResult.data) {
      return NextResponse.json(
        { error: 'App not found' },
        { status: 404 }
      );
    }

    if (appResult.data.user_id !== auth.user!.id) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Check domain limit per app (max 5 custom domains)
    const existingDomains = await CustomDomainService.listDomains(app_id, auth.user!.id);
    if (existingDomains.length >= 5) {
      return NextResponse.json(
        { 
          error: 'Domain limit reached',
          message: 'Maximum 5 custom domains per app. Remove an existing domain to add a new one.',
        },
        { status: 403 }
      );
    }

    // Add the domain
    const result = await CustomDomainService.addDomain(app_id, auth.user!.id, domain);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      domain: result.domain,
      verification_instructions: result.verification_instructions,
      message: 'Domain added successfully. Please add the DNS TXT record to verify ownership.',
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] Error adding domain:', errorMessage);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
