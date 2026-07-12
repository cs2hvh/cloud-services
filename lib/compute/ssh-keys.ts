// OpenSSH public-key parsing + fingerprinting for the user_ssh_keys vault.
// Server-side validation before a key is stored or forwarded as
// authorized_keys to the provisioning provider.

import { createHash } from "crypto";

const ALLOWED_KEY_TYPES = new Set([
    "ssh-ed25519",
    "ssh-rsa",
    "ecdsa-sha2-nistp256",
    "ecdsa-sha2-nistp384",
    "ecdsa-sha2-nistp521",
    "sk-ssh-ed25519@openssh.com",
    "sk-ecdsa-sha2-nistp256@openssh.com",
]);

export interface ParsedSshKey {
    /** Normalized single-line `type base64 [comment]`. */
    publicKey: string;
    keyType: string;
    /** `SHA256:<base64-no-pad>` — the standard OpenSSH fingerprint format. */
    fingerprint: string;
    comment: string | null;
}

export interface SshKeyParseError {
    error: string;
}

/** Read the first RFC4251 length-prefixed string from the decoded key blob. */
function readBlobType(blob: Buffer): string | null {
    if (blob.length < 4) return null;
    const len = blob.readUInt32BE(0);
    if (len <= 0 || len > 64 || blob.length < 4 + len) return null;
    return blob.subarray(4, 4 + len).toString("ascii");
}

export function parseSshPublicKey(raw: string): ParsedSshKey | SshKeyParseError {
    const line = raw.trim().replace(/[\r\n]+/g, " ");
    if (!line) return { error: "SSH key is empty." };
    if (line.length > 16_384) return { error: "SSH key is too long." };
    if (/^-----BEGIN/.test(line)) {
        return { error: "This looks like a PRIVATE key. Paste the PUBLIC key (e.g. id_ed25519.pub) instead." };
    }

    const parts = line.split(/\s+/);
    if (parts.length < 2) {
        return { error: "Invalid SSH public key. Expected format: <type> <base64-key> [comment]." };
    }

    const [keyType, b64, ...commentParts] = parts;
    if (!ALLOWED_KEY_TYPES.has(keyType)) {
        return { error: `Unsupported key type "${keyType}". Use ed25519, RSA, or ECDSA keys.` };
    }

    let blob: Buffer;
    try {
        blob = Buffer.from(b64, "base64");
        // Reject inputs that survive base64 decode only by dropping characters.
        if (blob.length === 0 || blob.toString("base64").replace(/=+$/, "") !== b64.replace(/=+$/, "")) {
            return { error: "Invalid SSH public key: key data is not valid base64." };
        }
    } catch {
        return { error: "Invalid SSH public key: key data is not valid base64." };
    }

    const blobType = readBlobType(blob);
    if (blobType !== keyType) {
        return { error: "Invalid SSH public key: key data does not match its declared type." };
    }

    // Basic sanity floor: ed25519 blobs are 51 bytes; RSA-2048 ~279.
    if (keyType === "ssh-rsa" && blob.length < 260) {
        return { error: "RSA keys must be at least 2048 bits." };
    }

    const digest = createHash("sha256").update(blob).digest("base64").replace(/=+$/, "");
    const comment = commentParts.join(" ").trim() || null;

    return {
        publicKey: comment ? `${keyType} ${b64} ${comment}` : `${keyType} ${b64}`,
        keyType,
        fingerprint: `SHA256:${digest}`,
        comment,
    };
}

export function isSshKeyParseError(
    value: ParsedSshKey | SshKeyParseError
): value is SshKeyParseError {
    return "error" in value;
}
