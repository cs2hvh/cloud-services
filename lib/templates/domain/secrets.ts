import { randomBytes } from 'crypto';

export function generateTemplateSecret(length = 32, alphabet?: string): string {
  if (!alphabet) return randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);

  const chars = [...alphabet];
  if (chars.length === 0) return '';

  const bytes = randomBytes(length);
  return Array.from(bytes, byte => chars[byte % chars.length]).join('');
}
