import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

import { authenticateUser } from "@/lib/auth/server-auth";
import { createClient } from "@/lib/supabase/server";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";

/**
 * Poll one DigitalOcean action while a node is being provisioned.
 *
 * Same fault as the readdroplet route beside it, against /v2/actions/ instead of
 * /v2/droplets/: no authentication of any kind, and the body's `id` interpolated
 * into the DigitalOcean URL with the platform token attached. See that file for
 * the full account; the fix here is identical in shape.
 *
 * The console.log(json, ".....................26") that used to sit at the top of
 * this handler is removed with it. It logged the whole request body on every
 * poll, which is both noise and an avoidable disclosure once this route starts
 * carrying a user's cluster id.
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const json = await req.json();

    // Digits only, so the value cannot climb out of /v2/actions/.
    const actionId = String(json?.id ?? "");
    if (!/^\d+$/.test(actionId)) {
      return NextResponse.json(
        { error: "id must be a numeric action id" },
        { status: 400 }
      );
    }

    const clusterId = String(json?.cluster_id ?? "");
    if (!clusterId) {
      return NextResponse.json(
        { error: "cluster_id is required" },
        { status: 400 }
      );
    }

    // The caller's cookie-scoped ANON-key client, NOT the service role, so RLS
    // enforces the ownership independently of this check being written
    // correctly. The explicit owner_id filter is kept as well.
    const supabase = await createClient();
    const { data: cluster, error: clusterError } = await supabase
      .from("clusters")
      .select("id")
      .eq("id", clusterId)
      .eq("owner_id", auth.user.id)
      .maybeSingle();

    if (clusterError || !cluster) {
      return NextResponse.json({ error: "cluster not found" }, { status: 404 });
    }

    const checkStatus = await axios.get(
      `https://api.digitalocean.com/v2/actions/${actionId}`,
      {
        headers: {
          Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    if (checkStatus.status === 200) {
      return NextResponse.json(
        { message: "success", data: checkStatus.data },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { message: "there is some internal error. please try later" },
      { status: 400 }
    );
  } catch (err: unknown) {
    logError("services/kubernetes/manageip/dropletstatus", err);
    return NextResponse.json({ message: sanitizeError(err) }, { status: 500 });
  }
}
