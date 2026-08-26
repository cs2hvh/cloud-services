/**
 * Print replica state per project — the operator view of lib/paas/replicas.ts.
 *
 *   node --env-file=.env --env-file=.env.local scripts/v2/replica-check.ts
 *
 * This reads tenant tables with the service role, which is correct HERE and
 * wrong in a route: this is an operator tool with no requesting user, so there
 * is no authorization decision to elevate past. A dashboard route must read
 * paas.deployments under RLS and pass the rows in.
 */

import { projects, deployments, aliases } from "../../lib/paas/db.ts";
import { replicaStates } from "../../lib/paas/replicas.ts";

const all = await projects.list();
console.log(`\n${all.length} project(s)\n` + "═".repeat(78));

for (const p of all) {
  const [rows, als] = await Promise.all([
    deployments.forProject(p.id, 20),
    aliases.forProject(p.id),
  ]);

  const prod = als.find((a) => a.kind === "production") ?? als[0];
  const servingRef = prod?.deployment_id
    ? (rows.find((d) => d.id === prod.deployment_id)?.ref ?? null)
    : null;

  const states = await replicaStates(
    p.ref,
    rows.map((d) => ({ ref: d.ref, state: d.state, image_digest: d.image_digest, scaled_to_zero_at: d.scaled_to_zero_at })),
    { servingRef, kubeconfigPath: process.env.V2_KUBECONFIG ?? "C:/ahura-secrets/kubeconfig-v2-dev.yaml" },
  );

  console.log(`\n${p.ref}  ${prod?.hostname ?? "(no hostname)"}`);
  if (states.length === 0) console.log("  (no deployments)");
  for (const s of states) {
    const n = s.replicas === null ? "?/?" : `${s.readyReplicas}/${s.replicas}`;
    const flag = s.ref === servingRef ? "→" : " ";
    console.log(
      `  ${flag} ${s.ref.padEnd(22)} ${s.status.padEnd(17)} ${n.padEnd(6)} ${s.rollable ? "rollable" : ""}`,
    );
  }
}

console.log("\n" + "═".repeat(78));
console.log("→ marks the deployment the production alias points at.");
console.log("running-unrouted costs money and serves nothing. unknown means we could not look.");
