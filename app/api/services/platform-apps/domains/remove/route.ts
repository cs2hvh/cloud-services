/**
 * Custom Domain API - Remove a domain
 * POST /api/services/platform-apps/domains/remove
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { CustomDomainService } from "@/lib/services/custom-domain";
import { z } from "zod";

const removeDomainSchema = z.object({
  domain_id: z.string().uuid('Invalid domain ID'),
});

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const body = await req.json();
    
    // Validate input
    const validation = removeDomainSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.errors },
        { status: 400 }
      );
    }

    const { domain_id } = validation.data;

    // Remove the domain
    const result = await CustomDomainService.removeDomain(domain_id, auth.user!.id);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Domain removed successfully. Your app continues to be accessible via the platform domain.',
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API] Error removing domain:', errorMessage);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
