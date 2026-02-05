-- Add new service types for AI agents and knowledge bases
-- Update notifications table to support ai_agent and knowledge_base service types
-- Add new action types: attached, detached

-- Drop existing constraints
ALTER TABLE notifications 
  DROP CONSTRAINT IF EXISTS notifications_service_type_check;

ALTER TABLE notifications 
  DROP CONSTRAINT IF EXISTS notifications_action_check;

-- Add updated service type constraint
ALTER TABLE notifications
  ADD CONSTRAINT notifications_service_type_check 
  CHECK (service_type IN (
    'platform_app',
    'database',
    'kubernetes',
    'object_storage',
    'network_ddos',
    'compute',
    'game_server',
    'firewall',
    'spectrum',
    'ai_agent',
    'knowledge_base'
  ));

-- Add updated action type constraint
ALTER TABLE notifications
  ADD CONSTRAINT notifications_action_check 
  CHECK (action IN (
    'created',
    'updated',
    'deleted',
    'deployed',
    'failed',
    'scaled',
    'restarted',
    'migrated',
    'resized',
    'attached',
    'detached'
  ));

-- Add index for AI agent and knowledge base notifications
CREATE INDEX IF NOT EXISTS idx_notifications_ai_services 
  ON notifications(user_id, service_type, created_at DESC) 
  WHERE service_type IN ('ai_agent', 'knowledge_base');

-- Add index for service_id lookups (useful for finding notifications related to specific services)
CREATE INDEX IF NOT EXISTS idx_notifications_service_id 
  ON notifications(service_id) 
  WHERE service_id IS NOT NULL;

-- Add comment explaining the new service types
COMMENT ON CONSTRAINT notifications_service_type_check ON notifications IS 
  'Supported service types including AI agents and knowledge bases';

COMMENT ON CONSTRAINT notifications_action_check ON notifications IS 
  'Supported actions including attach/detach for knowledge base operations';
