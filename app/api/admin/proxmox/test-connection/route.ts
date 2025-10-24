import { NextRequest, NextResponse } from "next/server";
import { createWorkerClient } from "@/lib/supabase/server";
import { Agent as UndiciAgent } from "undici";

export const dynamic = "force-dynamic";

function withTimeout<T>(p: Promise<T>, ms = 10000): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    ),
  ]);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const hostId = searchParams.get('hostId');

    if (!hostId) {
      return NextResponse.json(
        { ok: false, error: "hostId parameter required" },
        { status: 400 }
      );
    }

    const supabase = await createWorkerClient();

    // Get host configuration
    const { data: host, error: hostErr } = await supabase
      .from("proxmox_hosts")
      .select("*")
      .eq("id", hostId)
      .maybeSingle();

    if (hostErr || !host) {
      return NextResponse.json(
        { ok: false, error: "Host not found", details: hostErr?.message },
        { status: 404 }
      );
    }

    const apiBase = (host.host_url as string).replace(/\/$/, '');
    const allowInsecure = !!(host.allow_insecure_tls);
    const dispatcher = allowInsecure
      ? new UndiciAgent({ connect: { rejectUnauthorized: false } })
      : undefined;

    const result: any = {
      ok: false,
      host: {
        id: host.id,
        name: host.name,
        url: apiBase,
        allow_insecure_tls: allowInsecure,
        node: host.node,
      },
      auth: {
        method: null as string | null,
        hasTokenId: !!(host.token_id),
        hasTokenSecret: !!(host.token_secret),
        hasUsername: !!(host.username),
        hasPassword: !!(host.password),
        tokenId: host.token_id || null,
      },
      tests: [] as any[],
    };

    // Test 1: Token Authentication
    if (host.token_id && host.token_secret) {
      result.auth.method = 'token';
      const testResult: any = {
        name: 'Token Authentication',
        url: `${apiBase}/api2/json/version`,
        authHeader: `PVEAPIToken=${host.token_id}=${(host.token_secret as string).substring(0, 10)}...`,
      };

      try {
        const res = await withTimeout(
          fetch(`${apiBase}/api2/json/version`, {
            method: 'GET',
            headers: {
              Authorization: `PVEAPIToken=${host.token_id}=${host.token_secret}`,
            },
            dispatcher,
          } as any)
        );

        testResult.status = res.status;
        testResult.statusText = res.statusText;
        testResult.ok = res.ok;

        if (res.ok) {
          const data = await res.json();
          testResult.response = data;
          result.ok = true;
        } else {
          const errorText = await res.text().catch(() => res.statusText);
          testResult.errorText = errorText;
        }
      } catch (err: any) {
        testResult.error = err.message;
        testResult.stack = err.stack;
      }

      result.tests.push(testResult);

      // Test 2: List nodes
      if (testResult.ok) {
        const nodesTest: any = {
          name: 'List Nodes',
          url: `${apiBase}/api2/json/nodes`,
        };

        try {
          const res = await withTimeout(
            fetch(`${apiBase}/api2/json/nodes`, {
              method: 'GET',
              headers: {
                Authorization: `PVEAPIToken=${host.token_id}=${host.token_secret}`,
              },
              dispatcher,
            } as any)
          );

          nodesTest.status = res.status;
          nodesTest.ok = res.ok;

          if (res.ok) {
            const data = await res.json();
            nodesTest.nodes = data?.data || data;
          } else {
            nodesTest.errorText = await res.text().catch(() => res.statusText);
          }
        } catch (err: any) {
          nodesTest.error = err.message;
        }

        result.tests.push(nodesTest);
      }
    }

    // Test 3: Password Authentication (fallback)
    if ((!result.ok) && host.username && host.password) {
      result.auth.method = 'password';
      const testResult: any = {
        name: 'Password Authentication',
        url: `${apiBase}/api2/json/access/ticket`,
        username: host.username,
      };

      try {
        const formData = new URLSearchParams();
        formData.append('username', host.username as string);
        formData.append('password', host.password as string);

        const res = await withTimeout(
          fetch(`${apiBase}/api2/json/access/ticket`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData,
            dispatcher,
          } as any)
        );

        testResult.status = res.status;
        testResult.ok = res.ok;

        if (res.ok) {
          const data = await res.json();
          testResult.hasTicket = !!(data?.data?.ticket);
          testResult.hasCSRF = !!(data?.data?.CSRFPreventionToken);
          result.ok = true;
        } else {
          testResult.errorText = await res.text().catch(() => res.statusText);
        }
      } catch (err: any) {
        testResult.error = err.message;
      }

      result.tests.push(testResult);
    }

    return NextResponse.json(result);

  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    return NextResponse.json(
      {
        ok: false,
        error: err.message,
        stack: err.stack,
      },
      { status: 500 }
    );
  }
}
