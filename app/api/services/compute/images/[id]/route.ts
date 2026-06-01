import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { limitByUser } from "@/lib/cooldown/userbased";
import { deleteCustomImage } from "@/lib/services/compute/custom-images";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * DELETE /api/services/compute/images/[id] — delete a custom image. Destroys the
 * per‑host template VMs, removes the catalog row + storage meter. Servers already
 * cloned from it are independent and keep running.
 */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!id) {
    return Response.json({ ok: false, error: "Invalid image ID" }, { status: 400 });
  }

  const supabaseAuth = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();
  if (authError || !user) {
    return Response.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const rl = await limitByUser(user.id, { prefix: "rl:image-delete", limit: 20, windowMs: 3600_000 });
  if (!rl.allowed) {
    return Response.json(
      { ok: false, error: "Too many requests. Try again later.", retryAfterSec: rl.retryAfterSec },
      { status: 429 }
    );
  }

  try {
    await deleteCustomImage({ imageId: id, ownerId: user.id });
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete image";
    const notFound = msg.toLowerCase().includes("not found");
    return Response.json({ ok: false, error: notFound ? "Image not found" : "Failed to delete image" }, {
      status: notFound ? 404 : 500,
    });
  }
}
