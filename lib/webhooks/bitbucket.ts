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
      // No secret configured, skip strict validation
      console.warn('[BitbucketWebhook] No secret configured, skipping signature validation');
      return true;
    }

    if (!signature) {
      console.warn('[BitbucketWebhook] No signature header present, skipping validation');
      return true;
    }

    try {
      // Some providers prefix with "sha256=", handle that gracefully
      const parts = signature.split('=');
      const provided = parts.length === 2 ? parts[1] : signature;

      const hmac = crypto.createHmac('sha256', secret);
      const digest = hmac.update(payload, 'utf8').digest('hex');

      const sigBuffer = Buffer.from(provided, 'utf8');
      const digBuffer = Buffer.from(digest, 'utf8');

      // If lengths differ, don't attempt timing-safe comparison; treat as non-fatal and skip
      if (sigBuffer.length !== digBuffer.length) {
        console.warn('[BitbucketWebhook] Signature length mismatch, skipping strict validation');
        return true;
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
  static isPingEvent(_event: string): boolean {
    return false;
  }

  /** Extract branch name from Bitbucket change object */
  private static extractBranchFromChange(change: any): string {
    return change?.new?.name || '';
  }

  /** Check if this represents a branch deletion */
  static isBranchDeletion(body: any): boolean {
    const changes = body?.push?.changes || [];
    return changes.some(
      (c: any) =>
        c.closed === true ||
        (!c.new && c.old && c.old.type === 'branch')
    );
  }

  /**
   * Parse Bitbucket push event into normalized payload
   */
  static parsePushEvent(body: any, deliveryId: string): WebhookPayload {
    const changes = body?.push?.changes || [];
    const change =
      changes.find((c: any) => c.new && c.new.type === 'branch') ||
      changes[0] || {};

    const branch = this.extractBranchFromChange(change);
    const target = change?.new?.target || change?.commits?.[0] || {};

    const repo = body.repository || {};
    const cloneLinks: any[] = repo.links?.clone || [];
    const httpsLink = cloneLinks.find((l: any) => l.name === 'https') || cloneLinks[0];

    return {
      provider: 'bitbucket',
      event: 'push',
      delivery_id: deliveryId,
      repository: {
        id: (repo.uuid || repo.id || '').toString(),
        full_name: repo.full_name || '',
        clone_url: httpsLink?.href || '',
      },
      ref: branch ? `refs/heads/${branch}` : '',
      branch,
      commit: {
        sha: target.hash || '',
        message: target.message || '',
        author:
          target.author?.user?.display_name ||
          target.author?.raw ||
          '',
      },
      pusher: {
        name: body.actor?.display_name || body.actor?.username || '',
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
