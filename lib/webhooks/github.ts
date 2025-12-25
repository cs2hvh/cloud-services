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
  static isBranchDeletion(body: any): boolean {
    return body.deleted === true || body.after === '0000000000000000000000000000000000000000';
  }

  /**
   * Parse GitHub push event payload into normalized format
   */
  static parsePushEvent(body: any, deliveryId: string): WebhookPayload {
    const ref = body.ref || '';
    const branch = this.extractBranch(ref);
    
    return {
      provider: 'github',
      event: 'push',
      delivery_id: deliveryId,
      repository: {
        id: body.repository?.id?.toString() || '',
        full_name: body.repository?.full_name || '',
        clone_url: body.repository?.clone_url || '',
      },
      ref,
      branch,
      commit: {
        sha: body.after || body.head_commit?.id || '',
        message: body.head_commit?.message || '',
        author: body.head_commit?.author?.name || body.head_commit?.author?.username || '',
      },
      pusher: {
        name: body.pusher?.name || body.sender?.login || '',
        email: body.pusher?.email || '',
      },
      raw: body,
    };
  }

  /**
   * Parse ping event (webhook creation confirmation)
   */
  static parsePingEvent(body: any): { 
    webhook_id: string; 
    zen: string;
    repository_id: string;
  } {
    return {
      webhook_id: body.hook_id?.toString() || body.hook?.id?.toString() || '',
      zen: body.zen || '',
      repository_id: body.repository?.id?.toString() || '',
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
