/**
 * Document Parsers for RAG Knowledge Base
 * Supports: PDF, DOCX, TXT, Markdown, Code files, HTML, JSON, CSV
 */

// Note: pdf-parse is imported dynamically in parsePDF function to avoid module issues

// Supported file extensions and their content types
export const SUPPORTED_EXTENSIONS: Record<string, string> = {
  // Text/Documents
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.rst': 'text/x-rst',
  
  // Rich Documents
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  
  // Code files
  '.js': 'text/javascript',
  '.jsx': 'text/javascript',
  '.ts': 'text/typescript',
  '.tsx': 'text/typescript',
  '.py': 'text/x-python',
  '.java': 'text/x-java',
  '.c': 'text/x-c',
  '.cpp': 'text/x-c++',
  '.h': 'text/x-c',
  '.hpp': 'text/x-c++',
  '.cs': 'text/x-csharp',
  '.go': 'text/x-go',
  '.rs': 'text/x-rust',
  '.rb': 'text/x-ruby',
  '.php': 'text/x-php',
  '.swift': 'text/x-swift',
  '.kt': 'text/x-kotlin',
  '.scala': 'text/x-scala',
  '.r': 'text/x-r',
  '.sql': 'text/x-sql',
  '.sh': 'text/x-shellscript',
  '.bash': 'text/x-shellscript',
  '.ps1': 'text/x-powershell',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.toml': 'text/toml',
  '.ini': 'text/ini',
  '.cfg': 'text/ini',
  '.conf': 'text/ini',
  
  // Web
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.scss': 'text/x-scss',
  '.less': 'text/x-less',
  '.vue': 'text/x-vue',
  '.svelte': 'text/x-svelte',
  
  // Data formats
  '.json': 'application/json',
  '.jsonl': 'application/x-jsonlines',
  '.csv': 'text/csv',
  '.tsv': 'text/tab-separated-values',
  '.xml': 'text/xml',
  
  // Config
  '.env': 'text/plain',
  '.gitignore': 'text/plain',
  '.dockerignore': 'text/plain',
  '.editorconfig': 'text/plain',
  'Dockerfile': 'text/x-dockerfile',
  'Makefile': 'text/x-makefile',
};

export const SUPPORTED_MIME_TYPES = new Set(Object.values(SUPPORTED_EXTENSIONS));

// Max file sizes (in bytes)
export const MAX_FILE_SIZES: Record<string, number> = {
  'application/pdf': 20 * 1024 * 1024,        // 20MB for PDFs
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 10 * 1024 * 1024, // 10MB for DOCX
  'default': 5 * 1024 * 1024,                  // 5MB for other files
};

export interface ParsedDocument {
  content: string;
  metadata: {
    title?: string;
    author?: string;
    pageCount?: number;
    wordCount?: number;
    language?: string;
    format: string;
  };
}

export interface ParseOptions {
  preserveFormatting?: boolean;
  extractMetadata?: boolean;
  maxLength?: number;
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) {
    // Handle special files like Dockerfile, Makefile
    if (SUPPORTED_EXTENSIONS[filename]) {
      return filename;
    }
    return '';
  }
  return filename.slice(lastDot).toLowerCase();
}

/**
 * Check if file type is supported
 */
export function isFileSupported(filename: string, mimeType?: string): boolean {
  const ext = getFileExtension(filename);
  if (SUPPORTED_EXTENSIONS[ext]) return true;
  if (mimeType && SUPPORTED_MIME_TYPES.has(mimeType)) return true;
  return false;
}

/**
 * Get content type from filename
 */
export function getContentType(filename: string): string {
  const ext = getFileExtension(filename);
  return SUPPORTED_EXTENSIONS[ext] || 'text/plain';
}

/**
 * Check if file is binary (needs special parsing)
 */
export function isBinaryFile(filename: string, mimeType?: string): boolean {
  const ext = getFileExtension(filename);
  const type = mimeType || SUPPORTED_EXTENSIONS[ext] || '';
  
  return (
    type === 'application/pdf' ||
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    type === 'application/msword'
  );
}

/**
 * Parse PDF document
 * Note: PDF parsing in Next.js serverless environment is tricky.
 * This implementation uses a simpler approach that works with webpack.
 */
async function parsePDF(buffer: Buffer, options: ParseOptions = {}): Promise<ParsedDocument> {
  try {
    // Simple PDF text extraction by finding text strings in the raw PDF
    // This is a fallback approach that works without external dependencies
    const pdfString = buffer.toString('latin1');
    
    // Extract text streams from PDF
    const textMatches: string[] = [];
    
    // Find text between BT (Begin Text) and ET (End Text) operators
    const btEtRegex = /BT\s*([\s\S]*?)\s*ET/g;
    let match;
    
    while ((match = btEtRegex.exec(pdfString)) !== null) {
      const textBlock = match[1];
      
      // Extract text from Tj and TJ operators
      const tjRegex = /\(((?:[^()\\]|\\.)*)\)\s*Tj/g;
      let tjMatch;
      while ((tjMatch = tjRegex.exec(textBlock)) !== null) {
        const text = tjMatch[1]
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t')
          .replace(/\\\(/g, '(')
          .replace(/\\\)/g, ')')
          .replace(/\\\\/g, '\\');
        if (text.trim()) {
          textMatches.push(text);
        }
      }
      
      // Also try TJ arrays
      const tjArrayRegex = /\[((?:[^\[\]]|\[(?:[^\[\]])*\])*)\]\s*TJ/gi;
      let tjArrayMatch;
      while ((tjArrayMatch = tjArrayRegex.exec(textBlock)) !== null) {
        const arrayContent = tjArrayMatch[1];
        const stringRegex = /\(((?:[^()\\]|\\.)*)\)/g;
        let strMatch;
        while ((strMatch = stringRegex.exec(arrayContent)) !== null) {
          const text = strMatch[1]
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\\\(/g, '(')
            .replace(/\\\)/g, ')')
            .replace(/\\\\/g, '\\');
          if (text.trim()) {
            textMatches.push(text);
          }
        }
      }
    }
    
    // Also extract from stream objects with FlateDecode
    // This handles compressed text streams
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    while ((match = streamRegex.exec(pdfString)) !== null) {
      // Try to find readable text in uncompressed streams
      const streamContent = match[1];
      if (!streamContent.includes('\x00')) { // Skip binary streams
        const readableText = streamContent
          .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (readableText.length > 20 && /[a-zA-Z]{3,}/.test(readableText)) {
          textMatches.push(readableText);
        }
      }
    }
    
    let content = textMatches.join(' ')
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    
    // If we couldn't extract much text, the PDF might be image-based or heavily compressed
    if (content.length < 100) {
      throw new Error('Could not extract text from PDF. The PDF may be image-based or encrypted. Please convert to text format first.');
    }
    
    if (options.maxLength && content.length > options.maxLength) {
      content = content.slice(0, options.maxLength);
    }
    
    return {
      content,
      metadata: {
        wordCount: content.split(/\s+/).length,
        format: 'pdf',
      },
    };
  } catch (error) {
    console.error('[PDF Parser] Error:', error);
    throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parse DOCX document using basic XML extraction
 * Note: For full DOCX support, consider using mammoth.js
 */
async function parseDOCX(buffer: Buffer, options: ParseOptions = {}): Promise<ParsedDocument> {
  try {
    // DOCX is a ZIP file containing XML
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buffer);
    
    // Get the main document content
    const documentXml = await zip.file('word/document.xml')?.async('string');
    if (!documentXml) {
      throw new Error('Invalid DOCX file: missing document.xml');
    }
    
    // Extract text from XML (simple extraction)
    let content = documentXml
      // Remove XML tags but preserve text content
      .replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, '$1')
      .replace(/<w:p[^>]*>/g, '\n')
      .replace(/<w:br[^>]*\/>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    
    if (options.maxLength && content.length > options.maxLength) {
      content = content.slice(0, options.maxLength);
    }
    
    return {
      content,
      metadata: {
        wordCount: content.split(/\s+/).length,
        format: 'docx',
      },
    };
  } catch (error) {
    console.error('[DOCX Parser] Error:', error);
    throw new Error(`Failed to parse DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parse HTML document
 */
function parseHTML(text: string, options: ParseOptions = {}): ParsedDocument {
  // Extract title if present
  const titleMatch = text.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch?.[1]?.trim();
  
  // Remove script and style tags
  let content = text
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
  
  // Convert block elements to newlines
  content = content
    .replace(/<(p|div|h[1-6]|li|tr|br)[^>]*>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
  
  if (options.maxLength && content.length > options.maxLength) {
    content = content.slice(0, options.maxLength);
  }
  
  return {
    content,
    metadata: {
      title,
      wordCount: content.split(/\s+/).length,
      format: 'html',
    },
  };
}

/**
 * Parse JSON document - formats it nicely for embedding
 */
function parseJSON(text: string, options: ParseOptions = {}): ParsedDocument {
  try {
    const data = JSON.parse(text);
    
    // Convert to readable text format
    let content = formatJSONForRAG(data);
    
    if (options.maxLength && content.length > options.maxLength) {
      content = content.slice(0, options.maxLength);
    }
    
    return {
      content,
      metadata: {
        wordCount: content.split(/\s+/).length,
        format: 'json',
      },
    };
  } catch {
    // If JSON parsing fails, just use as plain text
    return {
      content: text,
      metadata: {
        format: 'json',
      },
    };
  }
}

/**
 * Format JSON object for RAG in a readable way
 */
function formatJSONForRAG(obj: unknown, indent: number = 0): string {
  const prefix = '  '.repeat(indent);
  
  if (obj === null || obj === undefined) {
    return `${prefix}null`;
  }
  
  if (typeof obj === 'string') {
    return `${prefix}${obj}`;
  }
  
  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return `${prefix}${String(obj)}`;
  }
  
  if (Array.isArray(obj)) {
    if (obj.length === 0) return `${prefix}(empty list)`;
    return obj.map((item, i) => `${prefix}Item ${i + 1}:\n${formatJSONForRAG(item, indent + 1)}`).join('\n');
  }
  
  if (typeof obj === 'object') {
    const entries = Object.entries(obj);
    if (entries.length === 0) return `${prefix}(empty object)`;
    return entries.map(([key, value]) => {
      const formattedValue = typeof value === 'object' && value !== null
        ? `\n${formatJSONForRAG(value, indent + 1)}`
        : ` ${formatJSONForRAG(value, 0).trim()}`;
      return `${prefix}${key}:${formattedValue}`;
    }).join('\n');
  }
  
  return `${prefix}${String(obj)}`;
}

/**
 * Parse CSV document
 */
function parseCSV(text: string, options: ParseOptions = {}): ParsedDocument {
  const lines = text.split('\n').filter(line => line.trim());
  if (lines.length === 0) {
    return { content: '', metadata: { format: 'csv' } };
  }
  
  // Parse headers
  const headers = parseCSVLine(lines[0]);
  
  // Convert rows to readable format
  const rows: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = headers.map((header, j) => `${header}: ${values[j] || ''}`).join(', ');
    rows.push(`Row ${i}: ${row}`);
  }
  
  let content = `CSV Data with columns: ${headers.join(', ')}\n\n${rows.join('\n')}`;
  
  if (options.maxLength && content.length > options.maxLength) {
    content = content.slice(0, options.maxLength);
  }
  
  return {
    content,
    metadata: {
      wordCount: content.split(/\s+/).length,
      format: 'csv',
    },
  };
}

/**
 * Parse a single CSV line handling quotes
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  values.push(current.trim());
  return values;
}

/**
 * Parse code file - preserves structure for better embeddings
 */
function parseCode(text: string, language: string, options: ParseOptions = {}): ParsedDocument {
  // Keep the code mostly as-is but add some context
  let content = text;
  
  // Add language hint at the top for context
  if (!content.startsWith('//') && !content.startsWith('#') && !content.startsWith('/*')) {
    content = `// Language: ${language}\n\n${content}`;
  }
  
  if (options.maxLength && content.length > options.maxLength) {
    content = content.slice(0, options.maxLength);
  }
  
  return {
    content,
    metadata: {
      language,
      wordCount: content.split(/\s+/).length,
      format: 'code',
    },
  };
}

/**
 * Parse plain text
 */
function parseText(text: string, options: ParseOptions = {}): ParsedDocument {
  let content = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  if (options.maxLength && content.length > options.maxLength) {
    content = content.slice(0, options.maxLength);
  }
  
  return {
    content,
    metadata: {
      wordCount: content.split(/\s+/).length,
      format: 'text',
    },
  };
}

/**
 * Main document parser - routes to appropriate parser based on content type
 */
export async function parseDocument(
  content: string | Buffer,
  contentType: string,
  filename: string,
  options: ParseOptions = {}
): Promise<ParsedDocument> {
  const lowerType = contentType.toLowerCase();
  
  // Handle binary files
  if (Buffer.isBuffer(content)) {
    if (lowerType.includes('pdf')) {
      return parsePDF(content, options);
    }
    if (lowerType.includes('wordprocessingml') || lowerType.includes('msword')) {
      return parseDOCX(content, options);
    }
    // Convert buffer to string for text-based formats
    content = content.toString('utf-8');
  }
  
  // Text-based formats
  if (lowerType.includes('html') || lowerType.includes('htm')) {
    return parseHTML(content, options);
  }
  
  if (lowerType.includes('json')) {
    return parseJSON(content, options);
  }
  
  if (lowerType.includes('csv') || lowerType.includes('tab-separated')) {
    return parseCSV(content, options);
  }
  
  // Code files
  const codeTypes: Record<string, string> = {
    'javascript': 'JavaScript',
    'typescript': 'TypeScript',
    'python': 'Python',
    'java': 'Java',
    'c++': 'C++',
    'csharp': 'C#',
    'go': 'Go',
    'rust': 'Rust',
    'ruby': 'Ruby',
    'php': 'PHP',
    'swift': 'Swift',
    'kotlin': 'Kotlin',
    'scala': 'Scala',
    'sql': 'SQL',
    'shell': 'Shell',
    'powershell': 'PowerShell',
    'yaml': 'YAML',
    'css': 'CSS',
    'scss': 'SCSS',
    'vue': 'Vue',
    'svelte': 'Svelte',
  };
  
  for (const [key, language] of Object.entries(codeTypes)) {
    if (lowerType.includes(key)) {
      return parseCode(content, language, options);
    }
  }
  
  // Check by file extension as fallback
  const ext = getFileExtension(filename);
  if (['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.scala', '.sql', '.sh', '.bash', '.ps1'].includes(ext)) {
    const langMap: Record<string, string> = {
      '.js': 'JavaScript', '.jsx': 'JavaScript',
      '.ts': 'TypeScript', '.tsx': 'TypeScript',
      '.py': 'Python',
      '.java': 'Java',
      '.c': 'C', '.cpp': 'C++', '.h': 'C', '.hpp': 'C++',
      '.cs': 'C#',
      '.go': 'Go',
      '.rs': 'Rust',
      '.rb': 'Ruby',
      '.php': 'PHP',
      '.swift': 'Swift',
      '.kt': 'Kotlin',
      '.scala': 'Scala',
      '.sql': 'SQL',
      '.sh': 'Shell', '.bash': 'Shell',
      '.ps1': 'PowerShell',
    };
    return parseCode(content, langMap[ext] || 'Code', options);
  }
  
  // Markdown
  if (lowerType.includes('markdown') || ext === '.md' || ext === '.markdown') {
    return parseText(content, { ...options }); // Will be handled by markdown chunker
  }
  
  // Default: plain text
  return parseText(content, options);
}

/**
 * Get list of supported file types for UI display
 */
export function getSupportedFileTypes(): { extension: string; description: string }[] {
  return [
    { extension: '.txt', description: 'Plain Text' },
    { extension: '.md', description: 'Markdown' },
    { extension: '.pdf', description: 'PDF Document' },
    { extension: '.docx', description: 'Word Document' },
    { extension: '.html', description: 'HTML' },
    { extension: '.json', description: 'JSON' },
    { extension: '.csv', description: 'CSV' },
    { extension: '.js/.ts', description: 'JavaScript/TypeScript' },
    { extension: '.py', description: 'Python' },
    { extension: '.java', description: 'Java' },
    { extension: '.go', description: 'Go' },
    { extension: '.rs', description: 'Rust' },
    { extension: '.rb', description: 'Ruby' },
    { extension: '.php', description: 'PHP' },
    { extension: '.sql', description: 'SQL' },
    { extension: '.yaml', description: 'YAML' },
    { extension: '.xml', description: 'XML' },
  ];
}

/**
 * Get accepted file extensions string for file input
 */
export function getAcceptedExtensions(): string {
  return Object.keys(SUPPORTED_EXTENSIONS).join(',');
}
