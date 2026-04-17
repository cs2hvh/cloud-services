import { createHash, timingSafeEqual } from "node:crypto";

function safeCompare(left: string, right: string): boolean {
  try {
    const leftHash = createHash("sha256").update(left).digest();
    const rightHash = createHash("sha256").update(right).digest();
    return timingSafeEqual(leftHash, rightHash);
  } catch {
    return false;
  }
}

export function hasValidCronBearerToken(req: Request): boolean {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) return false;

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;

  return safeCompare(token, expectedSecret);
}
