// The deploy wizard shows the thrown message to the customer when it looks
// user-facing. A response that was not JSON at all — a proxy 502/504, or an
// unhandled server error rendering Next's HTML page — used to throw a parser
// error short enough to pass that test, so the toast read
// `Unexpected token '<', "<!DOCTYPE"... is not valid JSON`.
import { describe, it, expect } from 'vitest';

import {
  deployErrorMessage,
  GENERIC_DEPLOY_ERROR,
} from '@/components/dashboard/compute/vps/linode';

describe('deployErrorMessage', () => {
  it('passes through an error the API wrote for the customer', () => {
    const apiErrors = [
      'You have reached the maximum of 25 active servers. Please delete unused servers first.',
      'Insufficient balance. You need at least $5.00 to create this server.',
      'Server name must only contain letters, numbers, and hyphens (1-63 characters).',
      'This request is already being processed. Please wait.',
    ];

    for (const message of apiErrors) {
      expect(deployErrorMessage(new Error(message))).toBe(message);
    }
  });

  it('replaces the JSON parser error the customer actually saw', () => {
    // Verbatim from the report (V8 phrasing).
    const v8 = new SyntaxError(
      `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`
    );

    expect(deployErrorMessage(v8)).toBe(GENERIC_DEPLOY_ERROR);
  });

  it('replaces the same failure however the browser phrases it', () => {
    // Chrome/V8, Firefox and Safari word this differently; none of them should
    // reach the toast.
    const phrasings = [
      `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`,
      'JSON.parse: unexpected character at line 1 column 1 of the JSON data',
      'Unexpected identifier "DOCTYPE"',
    ];

    for (const message of phrasings) {
      expect(deployErrorMessage(new SyntaxError(message))).toBe(GENERIC_DEPLOY_ERROR);
    }
  });

  it('replaces network plumbing', () => {
    expect(deployErrorMessage(new TypeError('Failed to fetch'))).toBe(GENERIC_DEPLOY_ERROR);
    expect(deployErrorMessage(new Error('connect ECONNREFUSED 127.0.0.1:3000'))).toBe(
      GENERIC_DEPLOY_ERROR
    );
  });

  it('replaces anything too long to be a written message', () => {
    expect(deployErrorMessage(new Error('x'.repeat(220)))).toBe(GENERIC_DEPLOY_ERROR);
    // Just under the bound still reads as prose and passes through.
    expect(deployErrorMessage(new Error('y'.repeat(219)))).toBe('y'.repeat(219));
  });

  it('falls back for empty and non-Error throws', () => {
    expect(deployErrorMessage(new Error(''))).toBe(GENERIC_DEPLOY_ERROR);
    expect(deployErrorMessage('a bare string')).toBe(GENERIC_DEPLOY_ERROR);
    expect(deployErrorMessage(undefined)).toBe(GENERIC_DEPLOY_ERROR);
    expect(deployErrorMessage(null)).toBe(GENERIC_DEPLOY_ERROR);
    expect(deployErrorMessage({ error: 'not an Error' })).toBe(GENERIC_DEPLOY_ERROR);
  });

  it('accepts a caller-specific fallback', () => {
    // The SSH-key dialog shares this filter but must not tell the customer
    // something went wrong "creating your server".
    const sshFallback = 'Failed to save SSH key.';

    expect(deployErrorMessage(new SyntaxError('Unexpected token \'<\''), sshFallback)).toBe(sshFallback);
    expect(deployErrorMessage(new TypeError('Failed to fetch'), sshFallback)).toBe(sshFallback);
    // A real API message still wins over the fallback.
    expect(deployErrorMessage(new Error('That key is already on your account.'), sshFallback)).toBe(
      'That key is already on your account.'
    );
  });

  it('never returns an empty string', () => {
    for (const input of [new Error(''), '', null, undefined, 0, new SyntaxError('')]) {
      expect(deployErrorMessage(input).length).toBeGreaterThan(0);
    }
  });
});
