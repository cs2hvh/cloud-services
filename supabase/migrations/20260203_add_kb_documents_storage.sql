-- Migration: Add storage bucket for knowledge base documents
-- Date: 2026-02-03

-- Create storage bucket for KB documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'kb-documents',
  'kb-documents',
  false, -- Private bucket
  52428800, -- 50MB max file size
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain',
    'text/markdown',
    'text/html',
    'text/css',
    'text/csv',
    'text/xml',
    'application/json',
    'application/javascript',
    'text/javascript',
    'text/x-python',
    'text/x-java-source',
    'text/x-c',
    'text/x-c++',
    'application/x-yaml',
    'text/yaml'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Add storage_path column to kb_documents table
ALTER TABLE agents.kb_documents 
ADD COLUMN IF NOT EXISTS storage_path TEXT;

-- RLS policies for kb-documents bucket
-- Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload to their folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'kb-documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to read their own files
CREATE POLICY "Users can read their own files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'kb-documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own files
CREATE POLICY "Users can delete their own files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'kb-documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow service role full access (for API operations)
CREATE POLICY "Service role has full access"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'kb-documents')
WITH CHECK (bucket_id = 'kb-documents');
