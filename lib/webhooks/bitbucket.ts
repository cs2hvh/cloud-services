/**
 * Bitbucket Webhook Handler
 * Normalizes Bitbucket webhook payloads and (optionally) validates signatures.
 */
import crypto from 'crypto';
import { WebhookPayload } from './types';

export class BitbucketWebhookHandler {
  /**
   * Validate Bitbucket webhook signature (HMAC SHA-256).
   * Bitbucket sends signature in header X-Hub-Signature with an HMAC of the raw body.
   * We implement a best-effort check but fall back gracefully if the format is unexpected.
   */
  static validateSignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    if (!secret) {
      console.error('[BitbucketWebhook] No secret configured — rejecting to prevent unauthenticated deploys');
      return false;
    }

    if (!signature) {
      console.error('[BitbucketWebhook] Missing X-Hub-Signature header');
      return false;
    }

    try {
      // Some providers prefix with "sha256=", handle that gracefully
      const parts = signature.split('=');
      const provided = parts.length === 2 ? parts[1] : signature;

      const hmac = crypto.createHmac('sha256', secret);
      const digest = hmac.update(payload, 'utf8').digest('hex');

      const sigBuffer = Buffer.from(provided, 'utf8');
      const digBuffer = Buffer.from(digest, 'utf8');

      if (sigBuffer.length !== digBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(sigBuffer, digBuffer);
    } catch (error) {
      console.error('[BitbucketWebhook] Signature validation error:', error);
      // On errors, don't hard-fail the webhook; just return false
      return false;
    }
  }

  /** Determine if this is a push event we care about */
  static isPushEvent(event: string): boolean {
    // Bitbucket push events use key like "repo:push"
    return event === 'repo:push';
  }

  /** Bitbucket does not have a dedicated ping event like GitHub; we treat non-push as skip */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static isPingEvent(_event: string): boolean {
    return false;
  }

  /** Extract branch name from Bitbucket change object */
  private static extractBranchFromChange(change: Record<string, unknown>): string {
    const newObj = change?.new as Record<string, unknown> | undefined;
    return (newObj?.name as string) || '';
  }

  /** Check if this represents a branch deletion */
  static isBranchDeletion(body: Record<string, unknown>): boolean {
    const push = body?.push as Record<string, unknown> | undefined;
    const changes = (push?.changes || []) as Record<string, unknown>[];
    return changes.some(
      (c: Record<string, unknown>) =>
        c.closed === true ||
        (!c.new && c.old && (c.old as Record<string, unknown>).type === 'branch')
    );
  }

  /**
   * Parse Bitbucket push event into normalized payload
   */
  static parsePushEvent(body: Record<string, unknown>, deliveryId: string): WebhookPayload {
    const push = body?.push as Record<string, unknown> | undefined;
    const changes = (push?.changes || []) as Record<string, unknown>[];
    const change =
      changes.find((c: Record<string, unknown>) => c.new && (c.new as Record<string, unknown>).type === 'branch') ||
      changes[0] || {};

    const branch = this.extractBranchFromChange(change);
    const newObj = change?.new as Record<string, unknown> | undefined;
    const target = (newObj?.target || (change?.commits as Record<string, unknown>[])?.[0] || {}) as Record<string, unknown>;

    const repo = (body.repository || {}) as Record<string, unknown>;
    const links = repo.links as Record<string, unknown> | undefined;
    const cloneLinks = (links?.clone || []) as Record<string, unknown>[];
    const httpsLink = cloneLinks.find((l: Record<string, unknown>) => l.name === 'https') || cloneLinks[0];

    const actor = body.actor as Record<string, unknown> | undefined;
    const targetAuthor = target.author as Record<string, unknown> | undefined;
    const authorUser = targetAuthor?.user as Record<string, unknown> | undefined;

    return {
      provider: 'bitbucket',
      event: 'push',
      delivery_id: deliveryId,
      repository: {
        id: String(repo.uuid || repo.id || ''),
        full_name: String(repo.full_name || ''),
        clone_url: String(httpsLink?.href || ''),
      },
      ref: branch ? `refs/heads/${branch}` : '',
      branch,
      commit: {
        sha: String(target.hash || ''),
        message: String(target.message || ''),
        author: String(authorUser?.display_name || targetAuthor?.raw || ''),
      },
      pusher: {
        name: String(actor?.display_name || actor?.username || ''),
        email: '',
      },
      raw: body,
    };
  }

  /** Get relevant headers from request */
  static getHeaders(headers: Headers): {
    signature: string;
    event: string;
    deliveryId: string;
  } {
    return {
      // Bitbucket Cloud uses X-Hub-Signature for HMAC and X-Event-Key for event
      signature:
        headers.get('x-hub-signature') ||
        headers.get('x-hub-signature-256') ||
        '',
      event: headers.get('x-event-key') || '',
      deliveryId: headers.get('x-request-uuid') || '',
    };
  }
}
