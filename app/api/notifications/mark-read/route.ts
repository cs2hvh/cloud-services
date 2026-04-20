import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { NotificationService } from "@/lib/notifications/service";
import { logError } from "@/lib/api/error-sanitizer";
import { z } from "zod";

const markReadSchema = z.object({
  id: z.string().uuid().optional(),
  all: z.boolean().optional(),
}).refine(data => data.id || data.all, {
  message: "Either 'id' or 'all' must be provided"
});

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const body = await req.json();
    const parsed = markReadSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { id, all } = parsed.data;

    if (all) {
      const success = await NotificationService.markAllAsRead(auth.user!.id);
      return NextResponse.json({ success });
    } else if (id) {
      const success = await NotificationService.markAsRead(id, auth.user!.id);
      return NextResponse.json({ success });
    }

    return NextResponse.json({ success: false, error: "No action taken" });
  } catch (error) {
    logError("notifications/mark-read", error);
    return NextResponse.json(
      { error: 'Failed to mark notification as read' },
      { status: 500 }
    );
  }
}
