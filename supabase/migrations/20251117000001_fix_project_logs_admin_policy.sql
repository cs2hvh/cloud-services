-- Fix project_logs RLS policy to allow admins to insert logs
-- This allows admins to create spectrum apps for users without RLS errors

-- Drop existing INSERT policy for project_logs
DROP POLICY IF EXISTS "Users can insert logs for their projects" ON project_logs;

-- Create new INSERT policy that includes admin access
CREATE POLICY "Users and admins can insert logs for their projects" ON project_logs
    FOR INSERT WITH CHECK (
        -- Allow if user is part of the project OR user is an admin
        EXISTS (
            SELECT 1 FROM projects 
            WHERE projects.id = project_logs.project_id 
            AND (
                auth.uid() = projects.owner OR 
                auth.uid()::text = ANY(SELECT jsonb_array_elements_text(projects.users))
            )
        )
        OR is_admin(auth.uid())
    );

COMMENT ON POLICY "Users and admins can insert logs for their projects" ON project_logs IS 
    'Allows project members and admins to create logs';
