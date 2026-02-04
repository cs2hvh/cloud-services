/**
 * Knowledge Bases - Document Upload Endpoint
 * POST /api/knowledge-bases/[id]/documents - Add documents to KB
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth/server-auth';
import { limitByUser } from '@/lib/cooldown/userbased';
import {
  AgentKnowledgeBases,
  AgentKBDocuments,
  AgentKBChunks,
} from '@/lib/supabase/queries/ai_agents';
import { chunkDocument, mergeSmallChunks, getDefaultEmbeddingsService } from '@/lib/ai';
import {
  parseDocument,
  isFileSupported,
  getContentType,
  isBinaryFile,
  SUPPORTED_EXTENSIONS,
  MAX_FILE_SIZES,
} from '@/lib/ai/document-parsers';
import { createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';

// Validation schema for JSON body (text/URL sources)
const addDocumentSchema = z.object({
  name: z.string().min(1).max(255),
  source_type: z.enum(['text', 'url']),
  content: z.string().min(1).max(500000), // Max 500KB of text
  content_type: z.string().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/knowledge-bases/[id]/documents
 * Add a document to the knowledge base
 * Supports both JSON body (for text) and multipart form data (for file uploads)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;

  try {
    // Rate limiting - stricter for embedding operations
    const rl = await limitByUser(auth.user!.id, {
      prefix: 'rl:kb-docs-add',
      limit: 10,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too Many Requests', message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    // Verify KB ownership
    const kb = await AgentKnowledgeBases.get(id, auth.user!.id);
    if (!kb.success || !kb.data) {
      return NextResponse.json(
        { error: 'Knowledge base not found' },
        { status: 404 }
      );
    }

    // Check content type to determine parsing method
    const contentType = request.headers.get('content-type') || '';
    
    let name: string;
    let sourceType: 'text' | 'url' | 'file';
    let rawContent: string;
    let fileContentType: string;
    let fileSize: number;
    let fileBuffer: Buffer | null = null; // Store original file for Supabase Storage

    if (contentType.includes('multipart/form-data')) {
      // Handle file upload
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      
      if (!file) {
        return NextResponse.json(
          { error: 'No file provided' },
          { status: 400 }
        );
      }

      name = file.name;
      fileContentType = file.type || getContentType(file.name);
      fileSize = file.size;
      sourceType = 'file';

      // Check if file type is supported
      if (!isFileSupported(file.name, file.type)) {
        return NextResponse.json(
          { 
            error: 'Unsupported file type',
            supported: Object.keys(SUPPORTED_EXTENSIONS).slice(0, 20).join(', ') + '...',
          },
          { status: 400 }
        );
      }

      // Check file size
      const maxSize = MAX_FILE_SIZES[fileContentType] || MAX_FILE_SIZES['default'];
      if (fileSize > maxSize) {
        return NextResponse.json(
          { 
            error: `File too large. Max size: ${Math.round(maxSize / 1024 / 1024)}MB`,
            max_size: maxSize,
          },
          { status: 400 }
        );
      }

      // Read file content
      const arrayBuffer = await file.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuffer);

      // Parse the file to extract text
      try {
        let fileContent: string | Buffer;
        
        if (isBinaryFile(file.name, file.type)) {
          fileContent = fileBuffer;
        } else {
          fileContent = fileBuffer.toString('utf-8');
        }

        const parsed = await parseDocument(fileContent, fileContentType, name);
        rawContent = parsed.content;
        
        if (!rawContent || rawContent.trim().length === 0) {
          return NextResponse.json(
            { error: 'Could not extract text from file' },
            { status: 400 }
          );
        }
      } catch (parseError) {
        console.error('[Knowledge Bases] Parse error:', parseError);
        return NextResponse.json(
          { error: `Failed to parse file: ${parseError instanceof Error ? parseError.message : 'Unknown error'}` },
          { status: 400 }
        );
      }

    } else {
      // Handle JSON body (text/URL sources)
      const body = await request.json();
      const validation = addDocumentSchema.safeParse(body);
      
      if (!validation.success) {
        return NextResponse.json(
          { error: 'Validation error', details: validation.error.errors },
          { status: 400 }
        );
      }

      name = validation.data.name;
      sourceType = validation.data.source_type;
      rawContent = validation.data.content;
      fileContentType = validation.data.content_type || 'text/plain';
      fileSize = rawContent.length;
    }

    // Upload file to Supabase Storage if it's a binary file
    let storagePath: string | null = null;
    if (fileBuffer && isBinaryFile(name, fileContentType)) {
      try {
        const supabase = await createServiceClient();
        const timestamp = Date.now();
        const safeName = name.replace(/[^a-zA-Z0-9.-]/g, '_');
        storagePath = `${auth.user!.id}/${id}/${timestamp}_${safeName}`;
        
        const { error: uploadError } = await supabase.storage
          .from('kb-documents')
          .upload(storagePath, fileBuffer, {
            contentType: fileContentType,
            upsert: false,
          });
        
        if (uploadError) {
          console.error('[Knowledge Bases] Storage upload error:', uploadError);
          // Don't fail the whole upload, just log the error
          storagePath = null;
        }
      } catch (storageErr) {
        console.error('[Knowledge Bases] Storage error:', storageErr);
        storagePath = null;
      }
    }

    // Create document record
    const docResult = await AgentKBDocuments.create({
      knowledge_base_id: id,
      name,
      source_type: sourceType,
      raw_content: rawContent,
      content_type: fileContentType,
      file_size: fileSize,
      storage_path: storagePath,
    });

    if (!docResult.success || !docResult.data) {
      return NextResponse.json(
        { error: 'Failed to create document' },
        { status: 500 }
      );
    }

    const document = docResult.data;

    // Update document status to processing
    await AgentKBDocuments.update_status(document.id, 'processing');

    // Update KB status
    await AgentKnowledgeBases.update(id, auth.user!.id, { status: 'indexing' });

    try {
      // Chunk the document
      const chunks = chunkDocument(rawContent, fileContentType || 'text/plain', {
        chunkSize: kb.data.chunk_size,
        chunkOverlap: kb.data.chunk_overlap,
      });

      // Merge very small chunks
      const mergedChunks = mergeSmallChunks(chunks, 100);

      if (mergedChunks.length === 0) {
        await AgentKBDocuments.update_status(document.id, 'error', 'No content to index');
        return NextResponse.json(
          { error: 'Document has no indexable content' },
          { status: 400 }
        );
      }

      // Generate embeddings using platform OpenAI key (OPENAI_API_KEY env var)
      const embeddingsService = getDefaultEmbeddingsService();
      const texts = mergedChunks.map(c => c.content);
      const embeddings = await embeddingsService.embedBatch(texts, 50);

      // Create chunk records
      const chunkRecords = mergedChunks.map((chunk, i) => ({
        knowledge_base_id: id,
        document_id: document.id,
        content: chunk.content,
        embedding: embeddings[i],
        chunk_index: chunk.index,
        token_count: chunk.metadata.tokenCount || 0,
        metadata: {
          start: chunk.metadata.start,
          end: chunk.metadata.end,
          document_name: name,
        },
      }));

      // Insert chunks
      const chunksResult = await AgentKBChunks.create_batch(chunkRecords);
      if (!chunksResult.success) {
        throw new Error('Failed to insert chunks');
      }

      // Update document status
      await AgentKBDocuments.update_status(document.id, 'indexed', undefined, mergedChunks.length);

      // Update KB stats
      const allDocs = await AgentKBDocuments.list_by_kb(id);
      const totalChunks = allDocs.reduce((sum, d) => sum + (d.chunk_count || 0), 0);
      const totalTokens = chunkRecords.reduce((sum, c) => sum + (c.token_count || 0), 0);

      await AgentKnowledgeBases.update_stats(id, {
        document_count: allDocs.length,
        chunk_count: totalChunks,
        total_tokens: totalTokens,
        status: 'ready',
      });

      return NextResponse.json({
        success: true,
        data: {
          document_id: document.id,
          name,
          chunks_created: mergedChunks.length,
          status: 'indexed',
        },
      }, { status: 201 });

    } catch (indexError) {
      console.error('[Knowledge Bases] Indexing error:', indexError);
      
      // Update document status to error
      await AgentKBDocuments.update_status(
        document.id,
        'error',
        indexError instanceof Error ? indexError.message : 'Indexing failed'
      );

      // Revert KB status
      await AgentKnowledgeBases.update(id, auth.user!.id, { status: 'error' });

      return NextResponse.json(
        { error: 'Failed to index document' },
        { status: 500 }
      );
    }

  } catch (err) {
    console.error('[Knowledge Bases] Add document error:', err);
    return NextResponse.json(
      { error: 'Failed to add document' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/knowledge-bases/[id]/documents
 * List all documents in a knowledge base
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;

  try {
    // Rate limiting
    const rl = await limitByUser(auth.user!.id, {
      prefix: 'rl:kb-docs-list',
      limit: 30,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too Many Requests', message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    // Verify KB ownership
    const kb = await AgentKnowledgeBases.get(id, auth.user!.id);
    if (!kb.success || !kb.data) {
      return NextResponse.json(
        { error: 'Knowledge base not found' },
        { status: 404 }
      );
    }

    const documents = await AgentKBDocuments.list_by_kb(id);

    return NextResponse.json({
      success: true,
      data: documents,
    });
  } catch (err) {
    console.error('[Knowledge Bases] List documents error:', err);
    return NextResponse.json(
      { error: 'Failed to list documents' },
      { status: 500 }
    );
  }
}
