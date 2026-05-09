import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { SupportTickets } from "@/lib/supabase/queries/support_tickets";
import { getSupportTopicById } from "@/lib/support/catalog";
import { supportResourcesQuerySchema } from "@/lib/validation/support";

function tooManyRequestsResponse(retryAfterSec: number) {
  return NextResponse.json(
    { error: "Too Many Requests", message: `Retry after ${retryAfterSec}s` },
    { status: 429 }
  );
}

export async function GET(request: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user.id, {
    prefix: "rl:support-resources-list",
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return tooManyRequestsResponse(rl.retryAfterSec);
  }

  try {
    const url = new URL(request.url);
    const parsed = supportResourcesQuerySchema.safeParse({
      topic: url.searchParams.get("topic") || "",
    });

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json({ error: issue?.message || "Invalid topic" }, { status: 400 });
    }

    const topicId = parsed.data.topic;
    const topic = getSupportTopicById(topicId);
    if (!topic) {
      return NextResponse.json({ error: "Invalid topic" }, { status: 400 });
    }

    const resources = await SupportTickets.listAffectedResources(auth.user.id, topicId);
    return NextResponse.json({
      success: true,
      data: resources,
      topic: {
        id: topic.id,
        label: topic.label,
        resourceType: topic.resourceType,
      },
    });
  } catch (error) {
    console.error("[SupportResources API] GET failed:", error);
    return NextResponse.json({ error: "Failed to load affected resources" }, { status: 500 });
  }
}
