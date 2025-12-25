/**
 * GitLab Webhook Handler
 * Handles incoming webhooks from GitLab, validates token, and parses payloads
 */
import crypto from 'crypto';
import { WebhookPayload } from './types';

export class GitLabWebhookHandler {
  /**
   * Validate GitLab webhook token.
   * GitLab sends the secret token as plain text in the X-Gitlab-Token header.
   */
  static validateSignature(
    _payload: string,
    signature: string,
    secret: string
  ): boolean {
    if (!secret) {
      console.error('[GitLabWebhook] Missing configured secret');
      return false;
    }

    if (!signature) {
      console.error('[GitLabWebhook] Missing X-Gitlab-Token header');
      return false;
    }

    try {
      const sigBuffer = Buffer.from(signature, 'utf8');
      const secBuffer = Buffer.from(secret, 'utf8');

      if (sigBuffer.length !== secBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(sigBuffer, secBuffer);
    } catch (error) {
      console.error('[GitLabWebhook] Token validation error:', error);
      return false;
    }
  }

  /** Check if this is a push event we should process */
  static isPushEvent(event: string): boolean {
    // Typical value: "Push Hook"
    return event.toLowerCase().includes('push');
  }

  /** GitLab does not send a dedicated ping event like GitHub */
  static isPingEvent(_event: string): boolean {
    return false;
  }

  /** Extract branch name from ref (e.g., "refs/heads/main" -> "main") */
  static extractBranch(ref: string): string {
    if (!ref) return '';
    return ref.replace('refs/heads/', '');
  }

  /** Check if this is a branch deletion */
  static isBranchDeletion(body: any): boolean {
    const after = body.after || '';
    // GitLab uses all-zero after for deletions; checkout_sha may also be null
    return (
      after === '0000000000000000000000000000000000000000' ||
      body.checkout_sha === null
    );
  }

  /** Parse GitLab push event payload into normalized format */
  static parsePushEvent(body: any, deliveryId: string): WebhookPayload {
    const ref = body.ref || '';
    const branch = this.extractBranch(ref);

    const project = body.project || {};
    const commits: any[] = body.commits || [];
    const latestCommit = commits[commits.length - 1] || {};

    return {
      provider: 'gitlab',
      event: 'push',
      delivery_id: deliveryId,
      repository: {
        id: project.id?.toString() || '',
        full_name: project.path_with_namespace || '',
        clone_url: project.git_http_url || '',
      },
      ref,
      branch,
      commit: {
        sha: latestCommit.id || body.checkout_sha || '',
        message: latestCommit.message || '',
        author: latestCommit.author?.name || body.user_username || '',
      },
      pusher: {
        name: body.user_username || latestCommit.author?.name || '',
        email: body.user_email || latestCommit.author?.email || '',
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
      signature: headers.get('x-gitlab-token') || '',
      event: headers.get('x-gitlab-event') || '',
      // GitLab does not provide a dedicated delivery ID; use request ID if present
      deliveryId: headers.get('x-request-id') || '',
    };
  }
}
