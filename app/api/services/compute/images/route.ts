import { NextRequest } from "next/server";
import { createClient, createWorkerClient } from "@/lib/supabase/server";
import { limitByUser } from "@/lib/cooldown/userbased";

export const dynamic = "force-dynamic";

const MAX_IMAGES_PER_USER = 25;
const MAX_IMAGE_GB = 100; // reject obviously-too-large images up front

/** Reject non-https URLs and obvious internal/SSRF targets (the eventual host
 *  download is also on a Proxmox box, but we screen at submit time too). */
function isPublicHttpsUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  // Block literal private / link-local / loopback IPs.
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  if (host === "::1" || host.startsWith("fd") || host.startsWith("fe80")) return false;
  // Single-quote etc. would break the host-side shell command later.
  if (/['"`$\\\n\r;|&<>(){}]/.test(raw)) return false;
  return true;
}

/** GET /api/services/compute/images — list the caller's custom images. */
export async function GET() {
  const supabaseAuth = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();
  if (authError || !user) {
    return Response.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const supabase = await createWorkerClient();
  const { data, error } = await supabase
    .from("custom_images")
    .select(
      "id, name, description, source_type, os_family, default_user, size_gb, cloud_init, status, error, created_at"
    )
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[custom-images] list failed:", error.message);
    return Response.json({ ok: false, error: "Unable to load images" }, { status: 500 });
  }
  return Response.json({ ok: true, images: data ?? [] });
}

/**
 * POST /api/services/compute/images — register a custom image by URL import.
 * Body: { name, sourceUrl, osFamily?, defaultUser?, cloudInit?, description? }
 *
 * With lazy replication there's no build at import time — the image is recorded
 * as `available` and the per‑host template is built on first deploy. We probe
 * Content-Length best‑effort for an initial size (refined after the first build).
 */
export async function POST(req: NextRequest) {
  const supabaseAuth = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();
  if (authError || !user) {
    return Response.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const rl = await limitByUser(user.id, { prefix: "rl:image-import", limit: 10, windowMs: 3600_000 });
  if (!rl.allowed) {
    return Response.json(
      { ok: false, error: "Too many image imports. Try again later.", retryAfterSec: rl.retryAfterSec },
      { status: 429 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    sourceUrl?: string;
    osFamily?: string;
    defaultUser?: string;
    cloudInit?: boolean;
    description?: string;
  };

  const name = (body.name ?? "").trim();
  const sourceUrl = (body.sourceUrl ?? "").trim();

  if (!name || !/^[a-zA-Z0-9]([a-zA-Z0-9 ._-]{0,61}[a-zA-Z0-9])?$/.test(name)) {
    return Response.json(
      { ok: false, error: "Name must be 1–63 characters (letters, numbers, spaces, . _ -)." },
      { status: 400 }
    );
  }
  if (!isPublicHttpsUrl(sourceUrl)) {
    return Response.json(
      { ok: false, error: "Provide a public https URL to a cloud image (qcow2/raw)." },
      { status: 400 }
    );
  }

  const defaultUser = (body.defaultUser ?? "root").trim();
  if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(defaultUser)) {
    return Response.json({ ok: false, error: "Invalid default login user." }, { status: 400 });
  }
  const osFamily = (body.osFamily ?? "custom").trim().toLowerCase().slice(0, 32) || "custom";
  const cloudInit = body.cloudInit !== false; // default true

  const supabase = await createWorkerClient();

  // Per-user quota + no duplicate names.
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

  // Best-effort size probe (Content-Length). Don't fail the import if it's missing.
  let sizeGb = 0;
  try {
    const head = await fetch(sourceUrl, { method: "HEAD", redirect: "follow" });
    const len = Number(head.headers.get("content-length") || 0);
    if (len > 0) sizeGb = Math.round((len / 1024 ** 3) * 100) / 100;
  } catch {
    /* size refined after first build */
  }
  if (sizeGb > MAX_IMAGE_GB) {
    return Response.json(
      { ok: false, error: `Image is too large (max ${MAX_IMAGE_GB} GB).` },
      { status: 413 }
    );
  }

  const { data: image, error } = await supabase
    .from("custom_images")
    .insert({
      owner_id: user.id,
      name,
      description: (body.description ?? "").slice(0, 500) || null,
      source_type: "url",
      source_ref: sourceUrl,
      os_family: osFamily,
      default_user: defaultUser,
      size_gb: sizeGb,
      cloud_init: cloudInit,
      status: "available", // usable now; builds lazily on first deploy
    })
    .select("id, name, status, size_gb")
    .single();

  if (error) {
    console.error("[custom-images] import failed:", error.message);
    return Response.json({ ok: false, error: "Unable to register the image." }, { status: 500 });
  }

  return Response.json({ ok: true, image });
}
