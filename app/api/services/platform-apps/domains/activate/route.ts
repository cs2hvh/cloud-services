/**
 * Custom Domain API - Activate a verified domain
 * POST /api/services/platform-apps/domains/activate
 * 
 * This adds the domain to Kubernetes Ingress and triggers SSL certificate issuance
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { CustomDomainService } from "@/lib/services/custom-domain";
import { limitByUser } from "@/lib/cooldown/userbased";
import { z } from "zod";

const activateDomainSchema = z.object({
  domain_id: z.string().uuid('Invalid domain ID'),
});

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    // Rate limiting (activation involves K8s operations)
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:activate-domain",
      limit: 5,
      windowMs: 60_000, // 5 activations per minute
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too Many Requests", message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    const body = await req.json();
    
    // Validate input
    const validation = activateDomainSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.errors },
        { status: 400 }
      );
    }

    const { domain_id } = validation.data;

    // Activate the domain
    const result = await CustomDomainService.activateDomain(domain_id, auth.user!.id);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    // Get updated domain info
    const domain = await CustomDomainService.getDomain(domain_id, auth.user!.id);

    return NextResponse.json({
      success: true,
      domain,
      message: 'Domain activated successfully! SSL certificate is being issued. Your custom domain should be accessible within a few minutes.',
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] Error activating domain:', errorMessage);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
