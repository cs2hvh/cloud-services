import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Security Tests: Cryptographic Functions
 *
 * Tests that generateStrongPassword uses crypto.randomBytes (not Math.random)
 * and that AES-256-GCM encryption works correctly.
 */

describe('Security: Cryptographic Functions', () => {
  describe('generateStrongPassword', () => {
    it('SEC-CRYPTO-001: should use crypto.randomBytes instead of Math.random', async () => {
      // Read the source code to verify crypto.randomBytes is used
      const sourcePath = path.resolve(process.cwd(), 'config/functions.ts');
      const source = fs.readFileSync(sourcePath, 'utf-8');

      // Extract just the generateStrongPassword function
      const fnMatch = source.match(
        /export const generateStrongPassword[\s\S]*?^};/m
      );
      expect(fnMatch).not.toBeNull();

      const fnSource = fnMatch![0];
      expect(fnSource).toContain('crypto.randomBytes');
      expect(fnSource).not.toContain('Math.random');
    });

    it('SEC-CRYPTO-002: should generate password with default length of 16', async () => {
      const { generateStrongPassword } = await import('@/config/functions');
      const password = generateStrongPassword();
      expect(password.length).toBe(16);
    });

    it('SEC-CRYPTO-003: should generate password with custom length', async () => {
      const { generateStrongPassword } = await import('@/config/functions');
      const password = generateStrongPassword(24);
      expect(password.length).toBe(24);
    });

    it('SEC-CRYPTO-004: should include special characters in charset', async () => {
      const { generateStrongPassword } = await import('@/config/functions');
      // Generate many passwords to ensure special chars appear
      const passwords = Array.from({ length: 50 }, () => generateStrongPassword(32));
      const combined = passwords.join('');
      const hasSpecial = /[!@#$%^&*]/.test(combined);
      expect(hasSpecial).toBe(true);
    });

    it('SEC-CRYPTO-005: should generate unique passwords', async () => {
      const { generateStrongPassword } = await import('@/config/functions');
      const passwords = new Set(Array.from({ length: 100 }, () => generateStrongPassword()));
      // All 100 should be unique
      expect(passwords.size).toBe(100);
    });

    it('SEC-CRYPTO-006: should NOT use Math.random', async () => {
      const { generateStrongPassword } = await import('@/config/functions');
      const spy = vi.spyOn(Math, 'random');

      generateStrongPassword();

      // After fix: Math.random must NOT be called
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('Encryption (AES-256-GCM)', () => {
    it('SEC-CRYPTO-010: should encrypt and decrypt roundtrip correctly', async () => {
      const { Encryption } = await import('@/config/functions');
      const key = 'test-encryption-key-32-chars-ok!';
      const plaintext = 'sensitive-data-12345';

      const encrypted = Encryption.encrypt(plaintext, key);
      const decrypted = Encryption.decrypt(encrypted, key);

      expect(decrypted).toBe(plaintext);
    });

    it('SEC-CRYPTO-011: should produce different ciphertext for same plaintext (random IV)', async () => {
      const { Encryption } = await import('@/config/functions');
      const key = 'test-encryption-key-32-chars-ok!';
      const plaintext = 'same-data';

      const e1 = Encryption.encrypt(plaintext, key);
      const e2 = Encryption.encrypt(plaintext, key);

      expect(e1.iv).not.toBe(e2.iv);
      expect(e1.salt).not.toBe(e2.salt);
    });

    it('SEC-CRYPTO-012: should fail to decrypt with wrong key', async () => {
      const { Encryption } = await import('@/config/functions');
      const encrypted = Encryption.encrypt('secret', 'correct-key-32-chars-long!!!!!!');

      expect(() => {
        Encryption.decrypt(encrypted, 'wrong-key-32-chars-long-badbadb');
      }).toThrow();
    });

    it('SEC-CRYPTO-013: should detect tampered ciphertext', async () => {
      const { Encryption } = await import('@/config/functions');
      const key = 'tamper-test-key-32-chars-longggg';
      const encrypted = Encryption.encrypt('data', key);

      // Tamper with ciphertext
      const tampered = { ...encrypted, encrypted: encrypted.encrypted.slice(0, -4) + 'XXXX' };

      expect(() => {
        Encryption.decrypt(tampered, key);
      }).toThrow();
    });

    it('SEC-CRYPTO-014: should handle unicode text', async () => {
      const { Encryption } = await import('@/config/functions');
      const key = 'unicode-key-32-chars-long!!!!!!!';
      const plaintext = '你好世界 🌍 مرحبا';

      const encrypted = Encryption.encrypt(plaintext, key);
      const decrypted = Encryption.decrypt(encrypted, key);

      expect(decrypted).toBe(plaintext);
    });
  });
});
