/**
 * GitHub Webhook Handler
 * Handles incoming webhooks from GitHub, validates signatures, and parses payloads
 */
import crypto from 'crypto';
import { WebhookPayload } from './types';

export class GitHubWebhookHandler {
  /**
   * Validate GitHub webhook signature (HMAC SHA-256)
   * GitHub sends signature in header: x-hub-signature-256
   * Format: sha256=<hex-digest>
   */
  static validateSignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    if (!signature || !secret) {
      console.error('[GitHubWebhook] Missing signature or secret');
      return false;
    }

    try {
      const hmac = crypto.createHmac('sha256', secret);
      const digest = 'sha256=' + hmac.update(payload, 'utf8').digest('hex');
      
      // Use timing-safe comparison to prevent timing attacks
      const signatureBuffer = Buffer.from(signature, 'utf8');
      const digestBuffer = Buffer.from(digest, 'utf8');
      
      if (signatureBuffer.length !== digestBuffer.length) {
        console.error('[GitHubWebhook] Signature length mismatch');
        return false;
      }
      
      return crypto.timingSafeEqual(signatureBuffer, digestBuffer);
    } catch (error) {
      console.error('[GitHubWebhook] Signature validation error:', error);
      return false;
    }
  }

  /**
   * Check if this is a push event we should process
   */
  static isPushEvent(event: string): boolean {
    return event === 'push';
  }

  /**
   * Check if this is a ping event (sent when webhook is created)
   */
  static isPingEvent(event: string): boolean {
    return event === 'ping';
  }

  /**
   * Extract branch name from ref
   * e.g., "refs/heads/main" -> "main"
   * e.g., "refs/heads/feature/my-feature" -> "feature/my-feature"
   */
  static extractBranch(ref: string): string {
    if (!ref) return '';
    return ref.replace('refs/heads/', '');
  }

  /**
   * Check if this is a branch deletion (after = 0000...)
   */
  static isBranchDeletion(body: Record<string, unknown>): boolean {
    return body.deleted === true || body.after === '0000000000000000000000000000000000000000';
  }

  /**
   * Parse GitHub push event payload into normalized format
   */
  static parsePushEvent(body: Record<string, unknown>, deliveryId: string): WebhookPayload {
    const ref = (body.ref || '') as string;
    const branch = this.extractBranch(ref);
    
    const repository = body.repository as Record<string, unknown> | undefined;
    const headCommit = body.head_commit as Record<string, unknown> | undefined;
    const headCommitAuthor = headCommit?.author as Record<string, unknown> | undefined;
    const pusher = body.pusher as Record<string, unknown> | undefined;
    const sender = body.sender as Record<string, unknown> | undefined;
    
    return {
      provider: 'github',
      event: 'push',
      delivery_id: deliveryId,
      repository: {
        id: String(repository?.id || ''),
        full_name: String(repository?.full_name || ''),
        clone_url: String(repository?.clone_url || ''),
      },
      ref,
      branch,
      commit: {
        sha: String(body.after || headCommit?.id || ''),
        message: String(headCommit?.message || ''),
        author: String(headCommitAuthor?.name || headCommitAuthor?.username || ''),
      },
      pusher: {
        name: String(pusher?.name || sender?.login || ''),
        email: String(pusher?.email || ''),
      },
      raw: body,
    };
  }

  /**
   * Parse ping event (webhook creation confirmation)
   */
  static parsePingEvent(body: Record<string, unknown>): { 
    webhook_id: string; 
    zen: string;
    repository_id: string;
  } {
    const hook = body.hook as Record<string, unknown> | undefined;
    const repository = body.repository as Record<string, unknown> | undefined;
    return {
      webhook_id: String(body.hook_id || hook?.id || ''),
      zen: String(body.zen || ''),
      repository_id: String(repository?.id || ''),
    };
  }

  /**
   * Get relevant headers from request
   */
  static getHeaders(headers: Headers): {
    signature: string;
    event: string;
    deliveryId: string;
  } {
    return {
      signature: headers.get('x-hub-signature-256') || '',
      event: headers.get('x-github-event') || '',
      deliveryId: headers.get('x-github-delivery') || '',
    };
  }
}
