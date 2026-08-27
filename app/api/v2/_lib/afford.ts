/**
 * Can this project's payer afford to run it?
 *
 * SHARED BECAUSE THERE ARE THREE DOORS. A deployment can be created by the
 * dashboard's Deploy button, by the trigger route, and by a GitHub push landing
 * on the webhook. A balance check written into one of them is a balance check
 * the other two walk past, and the next route somebody adds makes four.
 *
 * The real enforcement is `paas.payer_balance`, which both an RLS-scoped client
 * and the service role can call — so the webhook (which has no session) and a
 * dashboard request (which has one) get the same answer from the same place.
 *
 * WHAT IS DELIBERATELY NOT DONE HERE: reserving or holding funds. A build costs
 * nothing until a pod runs, and the hour is charged by the metering sweep from
 * the pod actually being up. Refusing a deploy is about not starting something
 * that cannot be paid for; it is not a payment.
 */

export type AffordState = "ok" | "short" | "no-record" | "no-payer" | "unknown";

export interface Affordability {
  state: AffordState;
  balance: number | null;
  /** What one hour of this project costs, for the message the customer sees. */
  hourly: number;
  reason: string;
}

interface RpcClient {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
}

/**
 * `no-record` is allowed through, and that is a POLICY CHOICE rather than an
 * oversight.
 *
 * On this database 24 of 37 accounts have no `billing.user_credits` row — every
 * user who predates credit billing. Treating a missing row as a zero balance
 * would lock all of them out of a platform they are already paying for, to close
 * a leak they are not causing. Treating a genuinely spent balance as fine would
 * be free compute forever.
 *
 * So the two are answered differently: `short` refuses, `no-record` is allowed
 * and REPORTED, so the gap shows up in logs and in the metering sweep rather
 * than being silently absorbed. Flipping it to a refusal is one branch here,
 * once every account has a record.
 */
export function decide(state: string, balance: number | null, hourly: number): Affordability {
  switch (state) {
    case "no-payer":
      return {
        state: "no-payer",
        balance: null,
        hourly,
        reason: "This project has no billable owner. Contact support — it is running at our expense.",
      };
    case "no-record":
      return {
        state: "no-record",
        balance: null,
        hourly,
        reason: "No credit account yet. Allowed, and reported.",
      };
    case "ok":
      if (balance !== null && balance < hourly) {
        return {
          state: "short",
          balance,
          hourly,
          reason: `Not enough credit: $${balance.toFixed(2)} available, $${hourly.toFixed(6)} needed for the first hour.`,
        };
      }
      return { state: "ok", balance, hourly, reason: "Sufficient credit." };
    default:
      // An unrecognised state is NOT treated as ok. A future value added to the
      // function would otherwise be waved through by an older deployment of this
      // file, which is how a billing guard stops guarding without anyone
      // touching it.
      return {
        state: "unknown",
        balance,
        hourly,
        reason: `Could not establish billing state (${state}).`,
      };
  }
}

/** True when a deploy should be REFUSED. Unknown refuses — see `decide`. */
export function shouldRefuse(a: Affordability): boolean {
  return a.state === "short" || a.state === "no-payer" || a.state === "unknown";
}

export async function affordability(
  client: RpcClient,
  projectId: string,
  hourly: number,
): Promise<Affordability> {
  const { data, error } = await client.rpc("payer_balance", { p_project_id: projectId });

  if (error) {
    // A failed lookup is `unknown`, which refuses. The alternative — assuming
    // solvency when the balance cannot be read — turns a database blip into
    // unbounded free compute.
    return { state: "unknown", balance: null, hourly, reason: "Could not read the billing account." };
  }

  const row = Array.isArray(data) ? (data[0] as { state?: string; balance?: string | number } | undefined) : undefined;
  if (!row?.state) {
    return { state: "unknown", balance: null, hourly, reason: "Billing account lookup returned nothing." };
  }

  const balance = row.balance === null || row.balance === undefined ? null : Number(row.balance);
  return decide(row.state, Number.isFinite(balance as number) ? (balance as number) : null, hourly);
}
