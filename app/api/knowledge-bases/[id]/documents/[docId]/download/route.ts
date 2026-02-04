import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth/server-auth';
import { AgentKBDocuments, AgentKnowledgeBases } from '@/lib/supabase/queries/ai_agents';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { id: kbId, docId } = await params;
    
    // Auth check (cookie-based)
    const auth = await authenticateUser();
    if (!auth.authenticated || !auth.user) {
      return auth.response || NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify ownership of KB
    const kb = await AgentKnowledgeBases.get(kbId, auth.user.id);
    if (!kb) {
      return NextResponse.json(
        { error: 'Knowledge base not found' },
        { status: 404 }
      );
    }

    // Get document
    const docResult = await AgentKBDocuments.get(docId);
    if (!docResult.success || !docResult.data) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    const document = docResult.data;

    // Verify document belongs to this KB
    if (document.knowledge_base_id !== kbId) {
      return NextResponse.json(
        { error: 'Document not found in this knowledge base' },
        { status: 404 }
      );
    }

    // Check if document has storage path
    if (!document.storage_path) {
      return NextResponse.json(
        { error: 'Original file not available for download' },
        { status: 404 }
      );
    }

    // Get file from Supabase Storage
    const supabase = await createServiceClient();
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('kb-documents')
      .download(document.storage_path);

    if (downloadError || !fileData) {
      console.error('[Document Download] Storage error:', downloadError);
      return NextResponse.json(
        { error: 'Failed to retrieve file' },
        { status: 500 }
      );
    }

    // Convert blob to buffer
    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Determine content type
    const contentType = document.content_type || 'application/octet-stream';
    
    // Return file as download
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(document.name)}"`,
        'Content-Length': buffer.length.toString(),
      },
    });

  } catch (error) {
    console.error('[Document Download] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
