/**
 * Tear down one project by ref.
 *
 * The probe cleans up after itself, but `--keep` exists precisely so a project
 * can outlive it — to set environment variables and redeploy, which is the only
 * way to test a build that needs configuration. Something then has to remove it,
 * and doing that by hand across three places is how a namespace gets left
 * routing to nothing.
 *
 *   node --experimental-strip-types --env-file=.env --env-file=.env.local \
 *     scripts/v2/drop-project.ts prj-45112eeb7722
 *
 * SAME ORDER AS project-teardown: soft-delete the project, release its aliases,
 * then delete the namespace. Releasing names before the workload goes means
 * nothing can claim a hostname that still routes.
 */

import { projects, db } from "../../lib/paas/db.ts";
import { kube, loadKubeconfig } from "../../lib/paas/k8s/client.ts";

const KUBECONFIG = process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml";

async function main(): Promise<number> {
  const ref = process.argv[2];
  if (!ref || !ref.startsWith("prj-")) {
    console.error("usage: drop-project.ts <prj-ref>");
    return 2;
  }

  const p = await projects.byRef(ref);
  if (!p) {
    console.error(`no project ${ref}`);
    return 1;
  }
  if (p.deleted_at) {
    console.log(`${ref} was already soft-deleted at ${p.deleted_at}; removing what is left`);
  }

  await db.update("projects", `id=eq.${p.id}`, { deleted_at: new Date().toISOString() });
  await db.update("aliases", `project_id=eq.${p.id}&released_at=is.null`, {
    released_at: new Date().toISOString(),
  });

  const k = kube(loadKubeconfig(KUBECONFIG));
  const ns = `app-${p.ref}`;
  await k.delete(`/api/v1/namespaces/${ns}`, true);

  console.log(`dropped ${p.ref} (${p.name}) — aliases released, namespace ${ns} deleted`);
  return 0;
}

main().then(
  (c) => process.exit(c),
  (e) => {
    console.error(`drop-project failed: ${(e as Error).message}`);
    console.error("Left as-is rather than half-removed.");
    process.exit(2);
  },
);
