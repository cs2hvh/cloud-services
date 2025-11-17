-- Migration: Add admin-only CRUD policies for spectrum_apps
-- Created: 2025-11-17
-- Purpose: Ensure only admins can perform CRUD operations on other users' spectrum apps

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their spectrum apps" ON spectrum_apps;
DROP POLICY IF EXISTS "Users can insert their spectrum apps" ON spectrum_apps;
DROP POLICY IF EXISTS "Users can update their spectrum apps" ON spectrum_apps;
DROP POLICY IF EXISTS "Users can delete their spectrum apps" ON spectrum_apps;
DROP POLICY IF EXISTS "Admins can view all spectrum apps" ON spectrum_apps;
DROP POLICY IF EXISTS "Admins can insert spectrum apps for any user" ON spectrum_apps;
DROP POLICY IF EXISTS "Admins can update any spectrum app" ON spectrum_apps;
DROP POLICY IF EXISTS "Admins can delete any spectrum app" ON spectrum_apps;

-- Function to check if a user is an admin
CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = user_id
    AND 'admin' = ANY(roles)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- SELECT Policy: Users can view their own apps, admins can view all
CREATE POLICY "Users can view their own spectrum apps"
  ON spectrum_apps
  FOR SELECT
  USING (
    auth.uid() = owner_id OR is_admin(auth.uid())
  );

-- INSERT Policy: Users can create their own apps, admins can create for anyone
CREATE POLICY "Users can insert their own spectrum apps"
  ON spectrum_apps
  FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id OR is_admin(auth.uid())
  );

-- UPDATE Policy: Users can update their own apps, admins can update any
CREATE POLICY "Users can update their own spectrum apps"
  ON spectrum_apps
  FOR UPDATE
  USING (
    auth.uid() = owner_id OR is_admin(auth.uid())
  );

-- DELETE Policy: Users can delete their own apps, admins can delete any
CREATE POLICY "Users can delete their own spectrum apps"
  ON spectrum_apps
  FOR DELETE
  USING (
    auth.uid() = owner_id OR is_admin(auth.uid())
  );

-- Create index on owner_id for better performance
CREATE INDEX IF NOT EXISTS idx_spectrum_apps_owner_id ON spectrum_apps(owner_id);

-- Comments
COMMENT ON FUNCTION is_admin IS 'Returns true if the user has admin role in their profile';
COMMENT ON POLICY "Users can view their own spectrum apps" ON spectrum_apps IS 'Users can view their own apps, admins can view all apps';
COMMENT ON POLICY "Users can insert their own spectrum apps" ON spectrum_apps IS 'Users can only create apps for themselves, admins can create for anyone';
COMMENT ON POLICY "Users can update their own spectrum apps" ON spectrum_apps IS 'Users can only update their own apps, admins can update any app';
COMMENT ON POLICY "Users can delete their own spectrum apps" ON spectrum_apps IS 'Users can only delete their own apps, admins can delete any app';
