/**
 * What a customer is allowed to be told when something fails.
 *
 * THE RULE IS AN ALLOWLIST, NOT A DENYLIST. Only an error explicitly
 * constructed as customer-facing keeps its text; everything else becomes a
 * generic message and a reference. A denylist — scrubbing "linode", "r2",
 * "cloudflare" out of arbitrary strings — leaks the first vendor nobody thought
 * to add to the list, and the list is never complete. The build-log sanitiser
 * in this codebase reached the same conclusion for the same reason: it drops
 * whole stages rather than redacting line by line.
 *
 * WHAT THIS IS PROTECTING AGAINST, concretely. These are real strings this
 * platform can produce, and every one of them could reach a customer's screen
 * through `deployments.error_message`:
 *
 *   [cloudflare] POST /zones/abc/custom_hostnames -> 403: 10000 Authentication error
 *   [r2] PUT builds/dpl-x/image.tar -> 403: SignatureDoesNotMatch
 *   [k8s] /etc/ahura/kubeconfig is not a recognised LKE kubeconfig (server=true token=false ca=true)
 *   LinodeError: POST /linode/instances: Account limit reached
 *
 * Each names a vendor, an internal path, an account state or a credential
 * problem. None of them is the customer's business, none is actionable by them,
 * and together they map our infrastructure for anyone who can trigger a
 * failure — which, on a platform that builds arbitrary repositories, is anyone.
 *
 * WHAT THIS IS NOT PROTECTING AGAINST, deliberately. A customer's own build
 * failing is the customer's business, and telling them plainly is the product
 * working. "This repository has no lockfile" and "no framework was detected"
 * are CustomerErrors on purpose. Turning those into "something went wrong"
 * would make the platform unusable for the case it exists to serve.
 */

/**
 * An error whose message is written FOR a customer and may be shown to one.
 *
 * Constructing this is a deliberate act: it is the author saying "I have read
 * this string and it is safe and useful to display". Nothing else passes.
 */
export class CustomerError extends Error {
  readonly code: string;
  /** True on the instance so the check survives a structuredClone or a rethrow. */
  readonly customerFacing = true as const;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CustomerError";
    this.code = code;
  }
}

/** Shorthand at the throw site. */
export function customerError(code: string, message: string): CustomerError {
  return new CustomerError(code, message);
}

/**
 * Instanceof alone is not enough.
 *
 * The deploy path crosses module boundaries and, in the sweeps, process
 * boundaries — an error serialised and rehydrated is no longer an instance of
 * anything. The duck-typed check is the one that survives that; the instanceof
 * is the fast path.
 */
export function isCustomerError(err: unknown): err is CustomerError {
  if (err instanceof CustomerError) return true;
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { customerFacing?: unknown }).customerFacing === true &&
    typeof (err as { message?: unknown }).message === "string"
  );
}

/**
 * The generic messages. Kept in one object so the voice stays consistent — a
 * platform that says "Something went wrong." in one place and "An unexpected
 * error occurred while processing your request." in another reads as two
 * products stitched together.
 *
 * Every one of these says three things: that it is ours and not theirs, what to
 * do next, and — through the reference — how to get a human to look at it.
 */
export const GENERIC: Record<string, string> = {
  build:
    "We could not finish building this app. This is a problem on our side, not with your code. " +
    "Try deploying again in a few minutes, and contact support if it keeps happening.",
  deploy:
    "We could not finish deploying this app. Nothing has been changed. " +
    "Try again in a few minutes, and contact support if it keeps happening.",
  read: "We could not load this right now. Please refresh, and try again in a few minutes.",
  write: "We could not save that. Nothing has been changed. Please try again in a few minutes.",
  domain:
    "We could not set up that domain right now. Your DNS records are unaffected. " +
    "Please try again in a few minutes.",
  network: "We could not reach the server. Check your connection and try again.",
  default: "Something went wrong on our side. Please try again in a few minutes.",
};

export type GenericKind = keyof typeof GENERIC | string;

/**
 * A short reference the customer can quote and support can grep for.
 *
 * NOT a hash of the message — two different failures must not collapse to one
 * reference, or support gets a ticket that matches a thousand log lines. Random
 * per occurrence, which is exactly what makes it useful: it identifies THIS
 * failure at THIS moment.
 */
function reference(): string {
  const bytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface CustomerFacing {
  /** Safe to display. */
  message: string;
  /** Stable, machine-readable, and never a vendor name. */
  code: string;
  /** Present only when the detail was withheld — quote it to support. */
  reference?: string;
}

/**
 * Translate anything at all into something a customer may see.
 *
 * THE FULL ERROR IS LOGGED, not discarded. Hiding a failure from the operator
 * as well as the customer would trade one problem for a worse one — the whole
 * point is that the detail goes somewhere a human can find it, keyed by the
 * reference the customer was given.
 */
export function toCustomerFacing(
  err: unknown,
  kind: GenericKind = "default",
  logPrefix = "[paas]",
): CustomerFacing {
  if (isCustomerError(err)) {
    return { message: err.message, code: err.code };
  }

  const ref = reference();
  const detail =
    err instanceof Error
      ? `${err.name}: ${err.message}`
      : typeof err === "string"
        ? err
        : JSON.stringify(err);

  // Server-side only. This is the half the customer does not get.
  console.error(`${logPrefix} ref=${ref} withheld from customer: ${detail}`);

  return {
    message: `${GENERIC[kind] ?? GENERIC.default} Reference: ${ref}`,
    code: "internal_error",
    reference: ref,
  };
}

/**
 * Build-VM failures, mapped for display.
 *
 * The VM reports a small fixed set of strings — it does not echo arbitrary
 * command output into this field, so this is a translation table rather than a
 * sanitiser. The split is by WHO CAN ACT: a clone that failed or a Dockerfile
 * that is missing is the customer's to fix, and saying so is the product
 * working. Apt, buildkit and the image upload are ours, and naming them tells
 * the customer nothing they can use while describing our build image to
 * anyone who can trigger a failure.
 *
 * Unknown values fall through to the generic branch, so a new `fail` message
 * added to the VM script is withheld until somebody decides it is safe. That is
 * the allowlist doing its job — a new string is not trusted because it is new.
 */
const BUILD_FAILURES: Record<string, string> = {
  "git clone failed":
    "We could not check out your repository. Confirm the branch still exists and that we have " +
    "access to it, then deploy again.",
  "requested commit could not be fetched":
    "We could not find that commit in your repository. It may have been removed by a force-push.",
  "requested commit could not be checked out":
    "We could not check out that commit in your repository. It may have been removed by a force-push.",
  "root directory not found in repository":
    "The root directory set for this app does not exist in your repository. Update it in Settings " +
    "and deploy again.",
  "repository was detected as Dockerfile-based but none was found":
    "We expected a Dockerfile in your repository and could not find one. Add one, or change the " +
    "root directory in Settings.",
  "image build failed":
    "Your build failed. The build log above shows what your build command reported.",
  "build produced no image":
    "Your build finished without producing an application to run. Check that your build command " +
    "writes its output where the framework expects.",
};

export function buildFailureMessage(raw: string | null | undefined): CustomerFacing {
  const key = (raw ?? "").trim().toLowerCase();
  const known = BUILD_FAILURES[key];
  if (known) return { message: known, code: "build_failed" };

  if (!key) {
    return {
      message:
        "This build did not finish in time. Try deploying again, and contact support if it keeps " +
        "happening.",
      code: "build_timeout",
    };
  }

  // Ours, or unrecognised. Either way the customer gets the generic form and
  // the operator gets the detail.
  const ref = reference();
  console.error(`[paas/build] ref=${ref} withheld from customer: ${raw}`);
  return {
    message: `${GENERIC.build} Reference: ${ref}`,
    code: "build_failed",
    reference: ref,
  };
}
