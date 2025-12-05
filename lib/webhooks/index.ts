/**
 * Webhook Module - Main exports
 */
export * from './types';
export { GitHubWebhookHandler } from './github';

// Re-export WebhookManager from services
export { WebhookManager } from '@/lib/services/webhook-manager';

// Will add GitLab and Bitbucket handlers later
// export { GitLabWebhookHandler } from './gitlab';
// export { BitbucketWebhookHandler } from './bitbucket';
