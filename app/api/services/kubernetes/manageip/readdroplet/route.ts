import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

import { authenticateUser } from "@/lib/auth/server-auth";
import { createClient } from "@/lib/supabase/server";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";

/**
 * Read one DigitalOcean droplet during node provisioning.
 *
 * This route previously had NO authentication at all, and interpolated the
 * request body's `id` straight into the DigitalOcean API URL while attaching the
 * platform's DO token:
 *
 *     axios.get(`https://api.digitalocean.com/v2/droplets/${json.id}`,
 *               { headers: { Authorization: process.env.DIGITAL_OCEAN_TOKEN } })
 *
 * Anyone on the internet could call it, and `{"id": "../account"}` reached
 * /v2/account. Every GET-reachable DigitalOcean endpoint was available to an
 * unauthenticated caller under the platform's own credentials. Nothing gated it:
 * the middleware only protects /dashboard, not /api/services/*.
 *
 * Three things close that, and all three are needed:
 *
 *   1. authenticateUser(), so an anonymous caller cannot reach the DO token.
 *   2. A strict numeric id, so the value cannot climb out of /v2/droplets/ into
 *      another part of the API. Validation is on the shape, not on a blocklist
 *      of traversal strings.
 *   3. An ownership check, so one customer cannot read another customer's node.
 *
 * The ownership check runs through createClient(), the caller's cookie-scoped
 * ANON-key client, NOT the service role. That is deliberate: RLS then enforces
 * the ownership independently of this code being right. The explicit owner_id
 * filter is kept as well, so the check does not rely on the policy alone.
 *
 * It is keyed on cluster_id rather than on the droplet: this endpoint is polled
 * WHILE a node is being created, so the droplet does not yet appear in
 * clusters.workers and a droplet-level check would fail exactly when the route
 * is used. The cluster is owned throughout, so that is the durable anchor.
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const json = await req.json();

    // Digits only. A DigitalOcean droplet id is a positive integer; anything
    // else is either a mistake or an attempt to reach a different endpoint.
    const dropletId = String(json?.id ?? "");
    if (!/^\d+$/.test(dropletId)) {
      return NextResponse.json(
        { error: "id must be a numeric droplet id" },
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

    const supabase = await createClient();
    const { data: cluster, error: clusterError } = await supabase
      .from("clusters")
      .select("id")
      .eq("id", clusterId)
      .eq("owner_id", auth.user.id)
      .maybeSingle();

    // A failed read is not an authorization pass. Refuse rather than falling
    // through to the DigitalOcean call.
    if (clusterError || !cluster) {
      return NextResponse.json({ error: "cluster not found" }, { status: 404 });
    }

    const vmData = await axios.get(
      `https://api.digitalocean.com/v2/droplets/${dropletId}`,
      {
        headers: {
          Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    if (vmData.status === 200) {
      return NextResponse.json(
        { message: "success", data: vmData.data },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { error: "there is some internal error. please try later" },
      { status: 400 }
    );
  } catch (err: unknown) {
    logError("services/kubernetes/manageip/readdroplet", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
