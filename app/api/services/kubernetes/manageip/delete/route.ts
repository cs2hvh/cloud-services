import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

import { authenticateUser } from "@/lib/auth/server-auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Delete one DigitalOcean droplet backing a Kubernetes node.
 *
 * This route authenticated but never authorized. It took `droplet_id` from the
 * request body and passed it straight to the DigitalOcean delete endpoint with
 * the platform token, so any registered user could destroy any customer's node
 * by guessing or enumerating an id:
 *
 *     await axios.delete(`https://api.digitalocean.com/v2/droplets/${json.droplet_id}`, ...)
 *
 * Authentication answers "who is this"; it does not answer "may they touch this
 * object". The second question was never asked.
 *
 * The droplet is resolved to a cluster the caller owns before anything is
 * deleted. That is possible without changing the caller's contract because a
 * node being deleted already exists in the cluster row: clusters.control_plane
 * is {public_ip, private_ip, droplet_id} and clusters.workers is an array of the
 * same shape.
 *
 * The lookup uses createClient(), the caller's cookie-scoped ANON-key client,
 * NOT the service role, so RLS enforces the ownership independently of the
 * explicit owner_id filter below. Both are kept: the filter states the intent,
 * the policy enforces it.
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const json = await req.json();

    // Digits only, so the id cannot climb out of /v2/droplets/ the way the
    // readdroplet and dropletstatus routes allowed.
    const dropletId = String(json?.droplet_id ?? "");
    if (!/^\d+$/.test(dropletId)) {
      return NextResponse.json(
        { error: "droplet_id must be numeric" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: clusters, error: clustersError } = await supabase
      .from("clusters")
      .select("id, control_plane, workers")
      .eq("owner_id", auth.user.id)
      .neq("status", "deleted");

    // A failed read is not an authorization pass.
    if (clustersError) {
      return NextResponse.json(
        { error: "could not verify node ownership" },
        { status: 503 }
      );
    }

    const ownsDroplet = (clusters ?? []).some((c) => {
      const cp = c.control_plane as { droplet_id?: number | string } | null;
      if (cp && String(cp.droplet_id ?? "") === dropletId) return true;
      const workers = (c.workers ?? []) as Array<{ droplet_id?: number | string }>;
      return workers.some((w) => String(w?.droplet_id ?? "") === dropletId);
    });

    // Same response whether the droplet belongs to someone else or does not
    // exist, so this cannot be used to enumerate the platform's droplets.
    if (!ownsDroplet) {
      return NextResponse.json({ error: "node not found" }, { status: 404 });
    }

    const droplets = await axios.delete(
      `https://api.digitalocean.com/v2/droplets/${dropletId}`,
      {
        headers: {
          Authorization: process.env.DIGITAL_OCEAN_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    if (droplets.status === 204) {
      return NextResponse.json(
        { message: "Node deleted successfully" },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { message: "there is some internal error. please try later" },
      { status: 503 }
    );
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error("[ManageIP Delete] Error:", err.message);
      return NextResponse.json(
        { error: "Failed to delete droplet" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Unknown error occurred" },
      { status: 400 }
    );
  }
}
