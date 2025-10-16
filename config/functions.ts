import * as crypto from "crypto";

export const generateStrongPassword = () => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let password = "";

  for (let i = 0; i < 12; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    password += chars[randomIndex];
  }

  return password;
};

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

interface EncryptedData {
  encrypted: string;
  iv: string;
  tag: string;
  salt: string;
}

export class Encryption {
  private static getKey(password: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, "sha256");
  }

  static encrypt(text: string, secretKey: string): EncryptedData {
    const iv = crypto.randomBytes(IV_LENGTH);
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = this.getKey(secretKey, salt);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(text, "utf8"),
      cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    return {
      encrypted: encrypted.toString("hex"),
      iv: iv.toString("hex"),
      tag: tag.toString("hex"),
      salt: salt.toString("hex"),
    };
  }

  static decrypt(encryptedData: EncryptedData, secretKey: string): string {
    const { encrypted, iv, tag, salt } = encryptedData;
    const key = this.getKey(secretKey, Buffer.from(salt, "hex"));

    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(iv, "hex")
    );
    decipher.setAuthTag(Buffer.from(tag, "hex"));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encrypted, "hex")),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  }
}

export function timeRange(hrs: number) {
  const end = Math.floor(Date.now() / 1000);
  const start = end - hrs * 60 * 60;
  return { start, end };
}
