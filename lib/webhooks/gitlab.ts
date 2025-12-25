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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static isPingEvent(_event: string): boolean {
    return false;
  }

  /** Extract branch name from ref (e.g., "refs/heads/main" -> "main") */
  static extractBranch(ref: string): string {
    if (!ref) return '';
    return ref.replace('refs/heads/', '');
  }

  /** Check if this is a branch deletion */
  static isBranchDeletion(body: Record<string, unknown>): boolean {
    const after = (body.after || '') as string;
    // GitLab uses all-zero after for deletions; checkout_sha may also be null
    return (
      after === '0000000000000000000000000000000000000000' ||
      body.checkout_sha === null
    );
  }

  /** Parse GitLab push event payload into normalized format */
  static parsePushEvent(body: Record<string, unknown>, deliveryId: string): WebhookPayload {
    const ref = (body.ref || '') as string;
    const branch = this.extractBranch(ref);

    const project = (body.project || {}) as Record<string, unknown>;
    const commits = (body.commits || []) as Record<string, unknown>[];
    const latestCommit = (commits[commits.length - 1] || {}) as Record<string, unknown>;
    const latestCommitAuthor = latestCommit.author as Record<string, unknown> | undefined;

    return {
      provider: 'gitlab',
      event: 'push',
      delivery_id: deliveryId,
      repository: {
        id: String(project.id || ''),
        full_name: String(project.path_with_namespace || ''),
        clone_url: String(project.git_http_url || ''),
      },
      ref,
      branch,
      commit: {
        sha: String(latestCommit.id || body.checkout_sha || ''),
        message: String(latestCommit.message || ''),
        author: String(latestCommitAuthor?.name || body.user_username || ''),
      },
      pusher: {
        name: String(body.user_username || latestCommitAuthor?.name || ''),
        email: String(body.user_email || latestCommitAuthor?.email || ''),
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
