/**
 * Custom Domain API - Verify domain ownership
 * POST /api/services/platform-apps/domains/verify
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { CustomDomainService } from "@/lib/services/custom-domain";
import { limitByUser } from "@/lib/cooldown/userbased";
import { z } from "zod";

const verifyDomainSchema = z.object({
  domain_id: z.string().uuid('Invalid domain ID'),
});

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    // Rate limiting (DNS lookups can be expensive)
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:verify-domain",
      limit: 20,
      windowMs: 60_000, // 20 verifications per minute
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too Many Requests", message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    const body = await req.json();
    
    // Validate input
    const validation = verifyDomainSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.errors },
        { status: 400 }
      );
    }

    const { domain_id } = validation.data;

    // Verify the domain
    const result = await CustomDomainService.verifyDomain(domain_id, auth.user!.id);

    if (!result.verified) {
      return NextResponse.json({
        success: false,
        verified: false,
        error: result.error,
        records_found: result.records_found || [],
      });
    }

    // Get updated domain info
    const domain = await CustomDomainService.getDomain(domain_id, auth.user!.id);

    return NextResponse.json({
      success: true,
      verified: true,
      domain,
      message: 'Domain verified successfully! You can now activate it to enable routing and SSL.',
      records_found: result.records_found,
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] Error verifying domain:', errorMessage);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
