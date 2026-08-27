/**
 * Print the stored build log for one deployment.
 *
 * A batch tells you a build failed; it cannot tell you whose fault that was.
 * Reading the log is the difference between "the platform cannot build pnpm
 * monorepos" and "this repository pins a Node version that no longer exists",
 * and every wrong call in this sweep so far came from guessing instead.
 *
 *   node --experimental-strip-types --env-file=.env --env-file=.env.local \
 *     scripts/v2/build-log.ts dpl-8207defe011a [--tail 60]
 */

import { getObject, r2Keys } from "../../lib/paas/build/r2.ts";

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const ref = args.find((a) => !a.startsWith("--"));
  if (!ref) {
    console.error("usage: build-log.ts <deployment-ref> [--tail N]");
    return 2;
  }

  const tailFlag = args.indexOf("--tail");
  const tail = tailFlag >= 0 ? Number(args[tailFlag + 1]) : 0;

  const body = await getObject(r2Keys.buildLog(ref));
  if (!body) {
    // An absent log and an empty one are different answers, and saying "no
    // output" for a log that was never written has sent me looking in the
    // wrong place before.
    console.error(`no build log stored for ${ref} — the builder may have died before its first upload`);
    return 1;
  }

  const text = new TextDecoder().decode(body);
  const lines = text.split("\n");
  console.log(tail > 0 ? lines.slice(-tail).join("\n") : text);
  return 0;
}

main().then(
  (c) => process.exit(c),
  (e) => {
    console.error(`build-log failed: ${(e as Error).message}`);
    process.exit(2);
  },
);
