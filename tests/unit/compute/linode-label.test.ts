import { describe, it, expect } from 'vitest';
import {
  buildLinodeLabel,
  validateRootPassword,
} from '@/lib/services/compute/providers/linode/create';

/** Linode label contract: 3-64 chars of [a-zA-Z0-9._-], alphanumeric ends. */
const LINODE_LABEL_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,62}[a-zA-Z0-9]$/;

describe('buildLinodeLabel', () => {
  it('keeps a clean label and appends a random suffix', () => {
    const label = buildLinodeLabel('my-server');
    expect(label).toMatch(/^my-server-[a-z0-9]{5}$/);
    expect(label).toMatch(LINODE_LABEL_RE);
  });

  it('sanitizes invalid characters into dashes', () => {
    const label = buildLinodeLabel('my server!!with spaces');
    expect(label).not.toMatch(/[\s!]/);
    expect(label).toMatch(LINODE_LABEL_RE);
    expect(label.startsWith('my-server-with-spaces')).toBe(true);
  });

  it('collapses runs of invalid characters into a single dash', () => {
    const label = buildLinodeLabel('a###b');
    expect(label).toMatch(/^a-b-[a-z0-9]{5}$/);
  });

  it('pads short names with the srv- prefix to satisfy the 3-char minimum', () => {
    const label = buildLinodeLabel('ab');
    expect(label).toMatch(/^srv-ab-[a-z0-9]{5}$/);
    expect(label).toMatch(LINODE_LABEL_RE);
  });

  it('survives input that sanitizes to nothing', () => {
    const label = buildLinodeLabel('!!!');
    expect(label).toMatch(/^srv-[a-z0-9]{5}$/);
    expect(label).toMatch(LINODE_LABEL_RE);
  });

  it('caps the total length at 64 including the suffix', () => {
    const label = buildLinodeLabel('x'.repeat(200));
    expect(label.length).toBeLessThanOrEqual(64);
    expect(label).toMatch(LINODE_LABEL_RE);
  });

  it('does not leave a separator dangling before the suffix after truncation', () => {
    // 58 chars then a dot: the slice would end on '.', which must be stripped.
    const label = buildLinodeLabel('x'.repeat(57) + '.' + 'y'.repeat(40));
    expect(label.length).toBeLessThanOrEqual(64);
    expect(label).toMatch(LINODE_LABEL_RE);
  });

  it('starts and ends alphanumeric even for hostile input', () => {
    for (const input of ['-leading-dash', 'trailing-dash-', '...dots...', '_under_', '--a--']) {
      const label = buildLinodeLabel(input);
      expect(label[0]).toMatch(/[a-zA-Z0-9]/);
      expect(label[label.length - 1]).toMatch(/[a-zA-Z0-9]/);
      expect(label).toMatch(LINODE_LABEL_RE);
    }
  });

  it('keeps allowed separators (dots, underscores, dashes) in the middle', () => {
    const label = buildLinodeLabel('web_1.prod-eu');
    expect(label.startsWith('web_1.prod-eu')).toBe(true);
    expect(label).toMatch(LINODE_LABEL_RE);
  });

  it('appends a fresh suffix per call (labels are unique per account)', () => {
    const a = buildLinodeLabel('my-server');
    const b = buildLinodeLabel('my-server');
    expect(a).not.toBe(b);
  });
});

describe('validateRootPassword', () => {
  it('rejects passwords shorter than 11 characters', () => {
    expect(validateRootPassword('Ab1!Ab1!Ab')).toMatch(/11-128/); // 10 chars
  });

  it('accepts exactly 11 characters with two classes', () => {
    expect(validateRootPassword('abcdefghij1')).toBeNull(); // lower + digit
  });

  it('accepts exactly 128 characters', () => {
    expect(validateRootPassword('A1' + 'a'.repeat(126))).toBeNull();
  });

  it('rejects passwords longer than 128 characters', () => {
    expect(validateRootPassword('A1' + 'a'.repeat(127))).toMatch(/11-128/); // 129 chars
  });

  it('rejects a single-class password (lowercase only)', () => {
    expect(validateRootPassword('abcdefghijk')).toMatch(/two of/);
  });

  it('rejects a single-class password (digits only)', () => {
    expect(validateRootPassword('12345678901')).toMatch(/two of/);
  });

  it('accepts two classes: upper + punctuation', () => {
    expect(validateRootPassword('ABCDEFGHIJ!')).toBeNull();
  });

  it('accepts two classes: lower + upper', () => {
    expect(validateRootPassword('abcdeFGHIJK')).toBeNull();
  });

  it('accepts all four classes', () => {
    expect(validateRootPassword('Str0ng!Pass#2026')).toBeNull();
  });
});
