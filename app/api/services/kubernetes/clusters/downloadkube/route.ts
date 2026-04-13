// app/api/clusters/[id]/kubeconfig/route.ts
import { authenticateUser } from "@/lib/auth/server-auth";
import { NextRequest, NextResponse } from "next/server";
import { createSSRClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { rateLimit } from "@/lib/rate-limit";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";
// import { readFile } from "node:fs/promises";
// import path from "node:path";
// import fs from "node:fs/promises";

// const KUBECONFIG_DIR = process.env.KUBECONFIG_DIR || "/srv/kubeconfigs";

export async function POST(req: Request) {
  // Basic rate limiting per IP/token
  const limiter = rateLimit({ interval: 60_000, uniqueTokenPerInterval: 500 });
  try {
    await limiter.check(req as NextRequest, 15);
  } catch {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));

  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const supabase = await createSSRClient();
    const adminCheck = await requireAdmin();
    const isAdmin = !!adminCheck.ok;

    // Preferred secure path: fetch kubeconfig by cluster_id and authorize
    if (body.cluster_id && typeof body.cluster_id === "string") {
      const query = supabase
        .from("clusters")
        .select("kubeconfig, owner_id")
        .eq("cluster_id", body.cluster_id);

      const { data, error } = isAdmin
        ? await query.single()
        : await query.eq("owner_id", auth.user.id).single();

      if (error) {
        logError("services/kubernetes/clusters/downloadkube", error);
        return NextResponse.json(
          { success: false, error: "Failed to fetch cluster configuration" },
          { status: 400 }
        );
      }
      if (!data || !data.kubeconfig) {
        return NextResponse.json(
          { success: false, error: "Kubeconfig not found" },
          { status: 404 }
        );
      }

      // kubeconfig stored as Buffer-like JSON { data: number[] } — normalize
      let yamlStr: string = "";
      try {
        const bufferData = typeof data.kubeconfig === "string"
          ? JSON.parse(data.kubeconfig)
          : data.kubeconfig;
        yamlStr = String.fromCharCode(...bufferData.data);
      } catch {
        // If already a string, return as-is
        yamlStr = String(data.kubeconfig);
      }

      return NextResponse.json({ success: true, data: yamlStr });
    }

    // Backward compatibility: fall back to previous behavior using body.kubeconfig
    if (body.kubeconfig) {
      const bufferData = JSON.parse(body.kubeconfig);
      const str = String.fromCharCode(...bufferData.data);
      return NextResponse.json({ success: true, data: str });
    }

    return NextResponse.json(
      { success: false, error: "cluster_id or kubeconfig required" },
      { status: 400 }
    );
  } catch (err: unknown) {
    logError("services/kubernetes/clusters/downloadkube", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
