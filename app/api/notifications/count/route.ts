import { NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { NotificationService } from "@/lib/notifications/service";

export async function GET() {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const count = await NotificationService.getUnreadCount(auth.user!.id);
  return NextResponse.json({ count });
}
