/**
 * Custom Domain API - Set primary domain
 * POST /api/services/platform-apps/domains/set-primary
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { CustomDomainService } from "@/lib/services/custom-domain";
import { z } from "zod";

const setPrimarySchema = z.object({
  domain_id: z.string().uuid('Invalid domain ID'),
});

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const body = await req.json();
    
    // Validate input
    const validation = setPrimarySchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.errors },
        { status: 400 }
      );
    }

    const { domain_id } = validation.data;

    // Set as primary
    const result = await CustomDomainService.setPrimaryDomain(domain_id, auth.user!.id);

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
      message: 'Primary domain set successfully.',
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] Error setting primary domain:', errorMessage);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
