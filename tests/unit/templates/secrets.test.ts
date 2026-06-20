import { describe, it, expect } from 'vitest';
import { generateTemplateSecret } from '@/lib/templates/domain/secrets';

describe('generateTemplateSecret', () => {
  it('generates a hex string of the correct length', () => {
    const secret = generateTemplateSecret(32);
    expect(secret).toHaveLength(32);
    expect(secret).toMatch(/^[0-9a-f]+$/);
  });

  it('defaults to 32 characters when no length given', () => {
    const secret = generateTemplateSecret();
    expect(secret).toHaveLength(32);
  });

  it('generates the requested length', () => {
    expect(generateTemplateSecret(16)).toHaveLength(16);
    expect(generateTemplateSecret(64)).toHaveLength(64);
    expect(generateTemplateSecret(128)).toHaveLength(128);
  });

  it('uses the provided alphabet', () => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const secret = generateTemplateSecret(20, alphabet);
    expect(secret).toHaveLength(20);
    expect(secret).toMatch(/^[A-Z]+$/);
  });

  it('uses alphanumeric alphabet', () => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const secret = generateTemplateSecret(40, alphabet);
    expect(secret).toHaveLength(40);
    expect(secret).toMatch(/^[A-Za-z0-9]+$/);
  });

  it('falls back to hex when alphabet is empty string (falsy)', () => {
    const secret = generateTemplateSecret(20, '');
    expect(secret).toHaveLength(20);
    expect(secret).toMatch(/^[0-9a-f]+$/);
  });

  it('generates different values on consecutive calls', () => {
    const a = generateTemplateSecret(32);
    const b = generateTemplateSecret(32);
    expect(a).not.toBe(b);
  });

  it('handles a single-char alphabet (all same chars)', () => {
    const secret = generateTemplateSecret(10, 'X');
    expect(secret).toBe('XXXXXXXXXX');
  });
});
