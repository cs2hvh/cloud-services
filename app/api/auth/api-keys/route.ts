/**
 * API Keys Management Endpoints
 * GET /api/auth/api-keys - List user's API keys
 * POST /api/auth/api-keys - Create new API key
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { ApiKeys } from "@/lib/supabase/queries/api_keys";

/**
 * GET /api/auth/api-keys
 * List all API keys for the authenticated user
 */
export async function GET() {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const keys = await ApiKeys.list(auth.user!.id);

    return NextResponse.json({
      data: keys.map((key) => ({
        id: key.id,
        name: key.name,
        key_prefix: key.key_prefix,
        plan: key.plan,
        last_used_at: key.last_used_at,
        expires_at: key.expires_at,
        created_at: key.created_at,
      })),
    });
  } catch (error) {
    console.error("[API Keys GET] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch API keys" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/auth/api-keys
 * Create a new API key
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const body = await req.json();
    const { name, expires_at } = body;

    // Validation
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    if (name.length > 100) {
      return NextResponse.json(
        { error: "Name must be 100 characters or less" },
        { status: 400 }
      );
    }

    // TODO: Get user's actual plan from subscription/billing table
    // For now, everyone gets free tier (server-controlled, not client input)
    const userPlan = "free";

    // Create key (DB enforces 10-key limit atomically)
    const result = await ApiKeys.create({
      user_id: auth.user!.id,
      name: name.trim(),
      plan: userPlan,
      expires_at: expires_at || null,
    });

    if (!result.success) {
      // Check if it's a limit error vs server error
      const isLimitError = result.error?.includes("10 API keys") || result.error?.includes("Maximum");
      return NextResponse.json(
        { error: result.error },
        { status: isLimitError ? 400 : 500 }
      );
    }

    // Return the key ONCE (never stored, never shown again)
    return NextResponse.json(
      {
        message: "API key created successfully",
        key: result.key,
        record: {
          id: result.record.id,
          name: result.record.name,
          key_prefix: result.record.key_prefix,
          plan: result.record.plan,
          created_at: result.record.created_at,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[API Keys POST] Error:", error);
    return NextResponse.json(
      { error: "Failed to create API key" },
      { status: 500 }
    );
  }
}
