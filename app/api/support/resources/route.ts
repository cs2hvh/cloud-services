import { NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { SupportTickets } from "@/lib/supabase/queries/support_tickets";
import { getSupportTopicById } from "@/lib/support/catalog";

export async function GET(request: Request) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const url = new URL(request.url);
    const topicId = url.searchParams.get("topic")?.trim() || "";

    if (!topicId) {
      return NextResponse.json({ error: "Topic is required" }, { status: 400 });
    }

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
