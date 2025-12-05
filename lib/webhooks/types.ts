/**
 * Webhook Types - Shared types for Git provider webhooks
 */

// Supported Git providers
export type GitProvider = 'github' | 'gitlab' | 'bitbucket';

// Normalized webhook payload (same structure regardless of provider)
export interface WebhookPayload {
  provider: GitProvider;
  event: string;
  delivery_id: string;
  repository: {
    id: string;
    full_name: string;
    clone_url: string;
  };
  ref: string;           // e.g., "refs/heads/main"
  branch: string;        // Extracted branch name (e.g., "main")
  commit: {
    sha: string;
    message: string;
    author: string;
  };
  pusher: {
    name: string;
    email: string;
  };
  raw?: any;             // Original payload for debugging
}

// Webhook configuration stored in database
export interface WebhookConfig {
  id: string;
  app_id: string;
  provider: GitProvider;
  webhook_id: string;
  webhook_secret: string;
  webhook_url: string;
  events: string[];
  auto_deploy_enabled: boolean;
  last_triggered_at: string | null;
  trigger_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

// App with webhook data (from database join)
export interface AppWithWebhook {
  id: string;
  name: string;
  slug: string;
  git_provider: GitProvider;
  repository_id: string;
  repository_name: string;
  repository_url: string;
  branch: string;
  status: string;
  user_id: string;
  auto_deploy: boolean;
  deploy_branch: string | null;
  // Webhook fields (from join)
  webhook_secret: string;
  webhook_id: string;
  auto_deploy_enabled: boolean;
}

// Result of webhook processing
export interface WebhookResult {
  success: boolean;
  action: 'triggered' | 'skipped' | 'error';
  message: string;
  app_name?: string;
  branch?: string;
  commit_sha?: string;
  build_number?: number;
}

// Webhook registration request
export interface WebhookRegistrationRequest {
  app_id: string;
  user_id: string;
  provider: GitProvider;
  repo_owner: string;
  repo_name: string;
  repo_id: string;
  events?: string[];
}

// Webhook registration result
export interface WebhookRegistrationResult {
  success: boolean;
  webhook_id?: string;
  error?: string;
}
