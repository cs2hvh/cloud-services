/**
 * GitHub App authentication.
 *
 * This is the security spine of the build tier. A build VM must never hold a
 * broad, long-lived credential. So:
 *
 *   - The App JWT (below) is minted from the private key, lives 10 minutes, and
 *     never leaves the control plane. It authenticates AS THE APP, not as a
 *     user, and can only enumerate installations.
 *   - An INSTALLATION TOKEN is minted per build: it lasts 1 hour, is scoped to
 *     a single repository, and is granted only `contents: read`. That — and
 *     nothing else — is what a build VM receives to clone the source.
 *
 * v1 baked a broad, non-expiring user OAuth token into the pipeline. This is
 * the deliberate opposite.
 */

import { createSign } from "node:crypto";
import { paasConfig } from "../config.ts";

const GH_API = "https://api.github.com";
const UA = "ahurasense-deploy-v2";

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/**
 * Mint a short-lived App JWT (RS256). Backdated 60s to tolerate clock skew,
 * expires in 10 minutes (GitHub's maximum). Never hand this to a build.
 */
export function mintAppJwt(now = Math.floor(Date.now() / 1000)): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({ iat: now - 60, exp: now + 540, iss: paasConfig.github.appId() }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const signature = base64url(signer.sign(paasConfig.github.privateKey()));
  return `${header}.${payload}.${signature}`;
}

async function ghAppRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GH_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${mintAppJwt()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": UA,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[github/app] ${init?.method ?? "GET"} ${path} -> ${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export interface AppMetadata {
  id: number;
  slug: string;
  name: string;
  owner: { login: string } | null;
  permissions: Record<string, string>;
  events: string[];
  installations_count?: number;
}

/** Read the App's own metadata — used by the health check to prove the key works. */
export function getAppMetadata(): Promise<AppMetadata> {
  return ghAppRequest<AppMetadata>("/app");
}

export interface Installation {
  id: number;
  account: { login: string; type: string } | null;
  repository_selection: "all" | "selected";
}

export function listInstallations(): Promise<Installation[]> {
  return ghAppRequest<Installation[]>("/app/installations?per_page=100");
}

export interface InstallationToken {
  token: string;
  expires_at: string;
  permissions: Record<string, string>;
}

/**
 * Mint a 1-hour installation token, optionally narrowed to a single repository
 * and to read-only contents. The build controller ALWAYS narrows: one repo,
 * `contents: read`, nothing else. A leak from the build VM is then bounded to
 * read access to one repo for at most one hour.
 */
export function mintInstallationToken(
  installationId: number,
  opts?: { repositoryIds?: number[]; readContentsOnly?: boolean },
): Promise<InstallationToken> {
  const body: Record<string, unknown> = {};
  if (opts?.repositoryIds?.length) body.repository_ids = opts.repositoryIds;
  if (opts?.readContentsOnly) body.permissions = { contents: "read" };
  return ghAppRequest<InstallationToken>(`/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
