import { Encryption, EncryptedData } from "@/config/functions";

const TOKEN_PREFIX = "enc:v1:";

function getEncryptionKey(): string | null {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    console.warn("[TokenCrypto] ENCRYPTION_KEY is not set; using backward-compatible plaintext fallback.");
    return null;
  }
  return key;
}

function decodeEncryptedPayload(value: string): EncryptedData | null {
  if (!value) return null;

  // Preferred format: enc:v1:<base64url(JSON)>
  if (value.startsWith(TOKEN_PREFIX)) {
    const payload = value.slice(TOKEN_PREFIX.length);
    try {
      const json = Buffer.from(payload, "base64url").toString("utf8");
      return JSON.parse(json) as EncryptedData;
    } catch {
      return null;
    }
  }

  // Backward-compat format: raw JSON string
  const trimmed = value.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      return JSON.parse(trimmed) as EncryptedData;
    } catch {
      return null;
    }
  }

  return null;
}

export function encryptOAuthToken(token: string | null | undefined): string | null {
  if (!token) return null;

  const key = getEncryptionKey();
  if (!key) {
    return token;
  }

  try {
    const encrypted = Encryption.encrypt(token, key);
    return `${TOKEN_PREFIX}${Buffer.from(JSON.stringify(encrypted), "utf8").toString("base64url")}`;
  } catch (err) {
    console.warn("[TokenCrypto] Failed to encrypt token, falling back to plaintext for compatibility:", err);
    return token;
  }
}

export function decryptOAuthToken(value: string | null | undefined): string | null {
  if (!value) return null;

  const key = getEncryptionKey();
  if (!key) {
    return value;
  }

  const payload = decodeEncryptedPayload(value);
  if (!payload) {
    // Treat as legacy plaintext.
    return value;
  }

  try {
    return Encryption.decrypt(payload, key);
  } catch {
    // If decryption fails, keep backward-compatible behavior.
    return value;
  }
}

