/**
 * Set environment variables on a project, from the command line.
 *
 * The API route for this exists and is the right thing for a customer to use.
 * This is for proving platform behaviour end to end: a build that needs
 * DATABASE_URL cannot be tested without a project that HAS a DATABASE_URL, and
 * there is no other way to get one there from a script.
 *
 *   node --experimental-strip-types --env-file=.env --env-file=.env.local \
 *     scripts/v2/set-env.ts prj-abc123 DATABASE_URL=postgres://... NEXTAUTH_SECRET=x
 *
 * A key starting with NEXT_PUBLIC_, VITE_ or PUBLIC_ is stored as public, which
 * is what decides whether it becomes a build arg or a mounted secret.
 */

import { projects, environments, envVars } from "../../lib/paas/db.ts";
import { encryptEnvValue, bytesToPgHex } from "../../lib/paas/secrets.ts";
import { isPublicEnvKey } from "../../lib/paas/build/dockerfile.ts";

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const ref = args[0];
  const pairs = args.slice(1);

  if (!ref || !ref.startsWith("prj-") || pairs.length === 0) {
    console.error("usage: set-env.ts <prj-ref> KEY=VALUE [KEY=VALUE ...]");
    return 2;
  }

  const project = await projects.byRef(ref);
  if (!project) {
    console.error(`no project ${ref}`);
    return 1;
  }

  // Production, because that is what a deployment from the default branch uses.
  const envs = await environments.forProject(project.id);
  const production = envs.find((e) => e.name === "production") ?? envs[0];
  if (!production) {
    console.error(`project ${ref} has no environment`);
    return 1;
  }

  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq <= 0) {
      console.error(`not a KEY=VALUE pair: ${pair}`);
      return 2;
    }
    const key = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    const { valueCt, dekId } = encryptEnvValue(project.ref, key, value);

    await envVars.upsert({
      projectId: project.id,
      environmentId: production.id,
      key,
      valueCtHex: bytesToPgHex(valueCt),
      dekId,
      isPublic: isPublicEnvKey(key),
    });
    // The VALUE is never printed. This script exists to put secrets somewhere;
    // echoing them into a terminal scrollback would undo the point of it.
    console.log(`  ${key} = (${value.length} chars, ${isPublicEnvKey(key) ? "public" : "secret"})`);
  }

  console.log(`set ${pairs.length} variable(s) on ${ref}/${production.name}`);
  return 0;
}

main().then(
  (c) => process.exit(c),
  (e) => {
    console.error(`set-env failed: ${(e as Error).message}`);
    process.exit(2);
  },
);
