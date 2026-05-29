import { NextRequest, after } from "next/server";
import { createClient, createWorkerClient } from "@/lib/supabase/server";
import { limitByUser } from "@/lib/cooldown/userbased";
import { runSnapshotExport } from "@/lib/services/compute/custom-images";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const MAX_IMAGES_PER_USER = 25;

/** Derive an OS family + default login user from a server's OS label. */
function deriveOs(os: string): { family: string; user: string } {
  const n = (os || "").toLowerCase();
  if (n.includes("ubuntu")) return { family: "ubuntu", user: "ubuntu" };
  if (n.includes("debian")) return { family: "debian", user: "debian" };
  if (n.includes("centos")) return { family: "centos", user: "centos" };
  if (n.includes("alma")) return { family: "almalinux", user: "almalinux" };
  if (n.includes("rocky")) return { family: "rocky", user: "rocky" };
  if (n.includes("windows")) return { family: "windows", user: "admin" };
  return { family: "custom", user: "root" };
}

/**
 * POST /api/services/compute/vms/[id]/snapshot-image  { name }
 *
 * Capture a STOPPED server's disk as a reusable custom image. Exports the disk
 * to R2 in the background (status importing -> available); once ready it shows
 * in the deploy picker and can be launched in any region.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const serverId = Number(id);
  if (!serverId || isNaN(serverId)) {
    return Response.json({ ok: false, error: "Invalid server ID" }, { status: 400 });
  }

  const supabaseAuth = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();
  if (authError || !user) {
    return Response.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const rl = await limitByUser(user.id, { prefix: "rl:vm-snapshot", limit: 5, windowMs: 3600_000 });
  if (!rl.allowed) {
    return Response.json(
      { ok: false, error: "Too many snapshots. Try again later.", retryAfterSec: rl.retryAfterSec },
      { status: 429 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const name = (body.name ?? "").trim();
  if (!name || !/^[a-zA-Z0-9]([a-zA-Z0-9 ._-]{0,61}[a-zA-Z0-9])?$/.test(name)) {
    return Response.json(
      { ok: false, error: "Name must be 1–63 characters (letters, numbers, spaces, . _ -)." },
      { status: 400 }
    );
  }

  const supabase = await createWorkerClient();
  const { data: server } = await supabase
    .from("servers")
    .select("id, vmid, location, owner_id, status, os")
    .eq("id", serverId)
    .maybeSingle();

  if (!server) return Response.json({ ok: false, error: "Server not found" }, { status: 404 });
  if (server.owner_id !== user.id) {
    return Response.json({ ok: false, error: "Not authorized" }, { status: 403 });
  }
  if (server.status !== "stopped") {
    return Response.json(
      { ok: false, error: "Power off the server before creating an image from it." },
      { status: 409 }
    );
  }
  if (!server.vmid || !server.location) {
    return Response.json({ ok: false, error: "Server is not fully provisioned." }, { status: 422 });
  }

  // Quota + no duplicate names.
  const { count } = await supabase
    .from("custom_images")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", user.id);
  if ((count ?? 0) >= MAX_IMAGES_PER_USER) {
    return Response.json(
      { ok: false, error: `You can store at most ${MAX_IMAGES_PER_USER} custom images.` },
      { status: 409 }
    );
  }
  const { data: dup } = await supabase
    .from("custom_images")
    .select("id")
    .eq("owner_id", user.id)
    .eq("name", name)
    .maybeSingle();
  if (dup) {
    return Response.json({ ok: false, error: "You already have an image with that name." }, { status: 409 });
  }

  const os = deriveOs(String(server.os || ""));
  const { data: image, error } = await supabase
    .from("custom_images")
    .insert({
      owner_id: user.id,
      name,
      source_type: "snapshot",
      source_ref: null,
      os_family: os.family,
      default_user: os.user,
      cloud_init: true,
      status: "importing",
    })
    .select("id")
    .single();

  if (error || !image) {
    console.error("[snapshot] create failed:", error?.message);
    return Response.json({ ok: false, error: "Unable to start the snapshot." }, { status: 500 });
  }

  // Background: export the disk to R2 and finalize the image.
  after(async () => {
    await runSnapshotExport({ imageId: String(image.id), serverId });
  });

  return Response.json({ ok: true, imageId: image.id, status: "importing" }, { status: 202 });
}
