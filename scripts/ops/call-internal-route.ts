/**
 * Call one of the app's internal cron routes from a systemd timer.
 *
 *   node --experimental-strip-types --env-file=/root/cloud-services/.env \
 *        scripts/ops/call-internal-route.ts POST /api/internal/game/renewals
 *
 * WHY THIS EXISTS
 *
 * Five routes were driven by credit-system-cron/cron-worker.js, which was
 * deleted from `dev` and wiped off the host on 2026-08-24. Nothing replaced
 * it. Game renewals stopped: on 2026-09-03 three game servers were 29 days past
 * their paid period, still running, with auto_renew on. Domain renewals stopped
 * the same day.
 *
 * The routes authenticate with `Authorization: Bearer <CRON_SECRET>`. This
 * script reads CRON_SECRET the same way the billing sweep reads its keys —
 * node's --env-file — so the timer needs no shell quoting of a secret.
 *
 * Exit codes: 0 on a 2xx, 1 on any other status or a network failure, 2 on
 * bad usage or a missing secret. systemd records the exit in the journal and
 * marks the unit failed on non-zero, which is what we want: a renewal sweep
 * that cannot reach the app is a finding, not a skipped tick.
 */

const TIMEOUT_MS = 5 * 60 * 1000;

async function main(): Promise<number> {
  const [method, path] = process.argv.slice(2);
  if (!method || !path || !path.startsWith("/")) {
    console.error("usage: call-internal-route.ts <GET|POST> </api/...>");
    return 2;
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[internal-route] CRON_SECRET is not set in the environment");
    return 2;
  }

  const base = process.env.INTERNAL_APP_URL ?? `http://127.0.0.1:${process.env.PORT ?? "3000"}`;
  const url = base + path;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
        "user-agent": "ahura-internal-timer",
      },
      body: method === "POST" ? "{}" : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    console.error(`[internal-route] ${method} ${path} failed: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }

  const text = await res.text();
  console.log(`[internal-route] ${method} ${path} -> ${res.status}`);
  if (text) console.log(text.length > 4000 ? `${text.slice(0, 4000)}…` : text);
  return res.ok ? 0 : 1;
}

main()
  .then((code) => { process.exitCode = code; })
  .catch((e) => {
    console.error("[internal-route] fatal:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  });
