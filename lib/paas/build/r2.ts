/**
 * R2 object storage with AWS SigV4, including presigned URLs.
 *
 * Presigning is the mechanism that keeps credentials out of the build VM. The
 * control plane signs exactly one URL, for exactly one object key, valid for a
 * short window. The VM can PUT that one object and nothing else — it never
 * receives an access key, so a compromised build cannot read or delete another
 * tenant's artifacts.
 *
 * v1 by contrast wrote Docker Hub push credentials into ~/.docker/config.json
 * inside the build container, giving any build write access to every other
 * app's image repository.
 */

import { createHash, createHmac } from "node:crypto";
import { paasConfig } from "../config.ts";

const SERVICE = "s3";
const REGION = "auto";
const ALGO = "AWS4-HMAC-SHA256";

const sha256Hex = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest();

function amzDate(now: Date): { amz: string; date: string } {
  const amz = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amz, date: amz.slice(0, 8) };
}

function signingKey(secret: string, date: string): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, date), REGION), SERVICE), "aws4_request");
}

function rfc3986(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

function encodeKey(key: string): string {
  return key.split("/").map(rfc3986).join("/");
}

interface R2Ctx {
  endpoint: string;
  host: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

function ctx(): R2Ctx {
  const endpoint = paasConfig.r2.endpoint().replace(/\/+$/, "");
  return {
    endpoint,
    host: new URL(endpoint).host,
    bucket: paasConfig.r2.bucket(),
    accessKeyId: paasConfig.r2.accessKeyId(),
    secretAccessKey: paasConfig.r2.secretAccessKey(),
  };
}

/**
 * Presign a URL. `expiresIn` is capped deliberately: a build VM's upload URL
 * should outlive the build but not the day.
 */
export function presign(
  method: "PUT" | "GET" | "DELETE",
  key: string,
  expiresIn = 3600,
  now = new Date(),
): string {
  const c = ctx();
  const { amz, date } = amzDate(now);
  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`;
  const path = `/${c.bucket}/${encodeKey(key)}`;

  const query = [
    `X-Amz-Algorithm=${ALGO}`,
    `X-Amz-Credential=${rfc3986(`${c.accessKeyId}/${scope}`)}`,
    `X-Amz-Date=${amz}`,
    `X-Amz-Expires=${Math.min(expiresIn, 86400)}`,
    `X-Amz-SignedHeaders=host`,
  ]
    .sort()
    .join("&");

  const canonical = [method, path, query, `host:${c.host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = [ALGO, amz, scope, sha256Hex(canonical)].join("\n");
  const signature = createHmac("sha256", signingKey(c.secretAccessKey, date)).update(toSign).digest("hex");

  return `${c.endpoint}${path}?${query}&X-Amz-Signature=${signature}`;
}

function signedHeaders(
  method: string,
  key: string,
  payload: Buffer | string,
  now = new Date(),
): Record<string, string> {
  const c = ctx();
  const { amz, date } = amzDate(now);
  const hash = sha256Hex(payload);
  const path = `/${c.bucket}${key ? `/${encodeKey(key)}` : ""}`;
  const canonicalHeaders = `host:${c.host}\nx-amz-content-sha256:${hash}\nx-amz-date:${amz}\n`;
  const signed = "host;x-amz-content-sha256;x-amz-date";
  const canonical = [method, path, "", canonicalHeaders, signed, hash].join("\n");
  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`;
  const toSign = [ALGO, amz, scope, sha256Hex(canonical)].join("\n");
  const signature = createHmac("sha256", signingKey(c.secretAccessKey, date)).update(toSign).digest("hex");
  return {
    Authorization: `${ALGO} Credential=${c.accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${signature}`,
    "x-amz-content-sha256": hash,
    "x-amz-date": amz,
  };
}

export async function putObject(key: string, body: Buffer | string, contentType?: string): Promise<void> {
  const c = ctx();
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const res = await fetch(`${c.endpoint}/${c.bucket}/${encodeKey(key)}`, {
    method: "PUT",
    headers: {
      ...signedHeaders("PUT", key, payload),
      ...(contentType ? { "Content-Type": contentType } : {}),
    },
    body: payload,
  });
  if (!res.ok) throw new Error(`[r2] PUT ${key} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export async function getObject(key: string): Promise<Buffer | null> {
  const c = ctx();
  const res = await fetch(`${c.endpoint}/${c.bucket}/${encodeKey(key)}`, {
    headers: signedHeaders("GET", key, ""),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`[r2] GET ${key} -> ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function deleteObject(key: string): Promise<void> {
  const c = ctx();
  const res = await fetch(`${c.endpoint}/${c.bucket}/${encodeKey(key)}`, {
    method: "DELETE",
    headers: signedHeaders("DELETE", key, ""),
  });
  if (!res.ok && res.status !== 404) throw new Error(`[r2] DELETE ${key} -> ${res.status}`);
}

/**
 * Prove the bucket is reachable with these credentials.
 *
 * Deliberately signs a bare `GET /{bucket}` with no query string: SigV4 signs
 * the canonical query, so adding `?list-type=2` here without including it in
 * the signature produces a valid-looking request that always 403s.
 */
export async function headBucket(): Promise<boolean> {
  const c = ctx();
  const res = await fetch(`${c.endpoint}/${c.bucket}`, {
    headers: signedHeaders("GET", "", ""),
  });
  return res.ok;
}

/** Object key layout. Namespaced by deployment so nothing collides. */
export const r2Keys = {
  buildLog: (deploymentRef: string) => `builds/${deploymentRef}/build.log`,
  imageTar: (deploymentRef: string) => `builds/${deploymentRef}/image.tar`,
  buildMeta: (deploymentRef: string) => `builds/${deploymentRef}/meta.json`,
  cachePrefix: (teamRef: string, projectRef: string) => `cache/${teamRef}/${projectRef}`,
};
