/**
 * May this caller claim this installation?
 *
 * Separated from the callback route so the rule can be tested directly. It is
 * the only thing standing between a signed-in stranger and another account's
 * repositories, and it used to not exist: the route checked that the
 * installation was one of ours and took the team from the caller, which means
 * a real but unclaimed id bound somebody else's GitHub account to whoever
 * asked first.
 *
 * The identity comes from Supabase — what GitHub asserted when the user signed
 * in — and NOT from the request. That is the whole point: an installation id
 * can be typed into a URL, a signed-in identity cannot.
 */

export type OwnershipVerdict =
  /** The caller signs in as the account the installation is on. */
  | { proven: true }
  /** Everything else. Never bind; send them through the connect flow. */
  | { proven: false; code: "no-github-identity" | "unknown-account" | "different-account"; reason: string };

/**
 * `githubLogin` is the caller's GitHub username from their signed-in identity.
 * `installedOn` is `installation.account.login` as GitHub reports it.
 *
 * Both absent-or-blank cases refuse. An unknown account is not a matching one,
 * and this is the exact shape of bug this codebase keeps finding: two blanks
 * comparing equal would let a caller with no GitHub identity claim an
 * installation whose account GitHub did not name.
 */
export function provesInstallationOwnership(
  githubLogin: string | null | undefined,
  installedOn: string | null | undefined,
): OwnershipVerdict {
  const caller = typeof githubLogin === "string" ? githubLogin.trim() : "";
  const account = typeof installedOn === "string" ? installedOn.trim() : "";

  if (!caller) {
    return {
      proven: false,
      code: "no-github-identity",
      reason: "You are not signed in with GitHub, so we cannot tell whether this installation is yours.",
    };
  }
  if (!account) {
    return {
      proven: false,
      code: "unknown-account",
      reason: "GitHub did not say which account this installation is on, so ownership cannot be established.",
    };
  }

  // GitHub logins are case-insensitive. Comparing exactly would refuse the
  // legitimate owner over a capital letter, for a reason nobody could see.
  if (caller.toLowerCase() !== account.toLowerCase()) {
    return {
      proven: false,
      code: "different-account",
      reason: `This installation is on ${account}, and you signed in as ${caller}.`,
    };
  }

  return { proven: true };
}
