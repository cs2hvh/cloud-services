import { NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { NotificationService } from "@/lib/notifications/service";

export async function GET(req: Request) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") || "20");
  const offset = parseInt(searchParams.get("offset") || "0");
  const unreadOnly = searchParams.get("unread") === "true";

  const notifications = await NotificationService.getByUserId(auth.user!.id, {
    limit: Math.min(limit, 100), // Cap at 100
    offset,
    unreadOnly,
  });

  return NextResponse.json({ notifications });
}
