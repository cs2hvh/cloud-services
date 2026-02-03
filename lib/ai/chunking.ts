/**
 * Document Chunking Service
 * Splits documents into smaller chunks for embedding and retrieval
 */

export interface ChunkingOptions {
  chunkSize: number;      // Target size in characters
  chunkOverlap: number;   // Overlap between chunks
  separators?: string[];  // Custom separators for splitting
}

export interface Chunk {
  content: string;
  index: number;
  metadata: {
    start: number;
    end: number;
    tokenCount?: number;
  };
}

const DEFAULT_SEPARATORS = [
  '\n\n\n',      // Triple newline (major sections)
  '\n\n',        // Double newline (paragraphs)
  '\n',          // Single newline
  '. ',          // Sentences
  '? ',          // Questions
  '! ',          // Exclamations
  '; ',          // Semicolons
  ', ',          // Commas
  ' ',           // Words
  '',            // Characters (last resort)
];

/**
 * Recursive text splitter
 * Tries to split on larger separators first, then falls back to smaller ones
 */
export function splitText(
  text: string,
  options: ChunkingOptions
): Chunk[] {
  const { chunkSize, chunkOverlap } = options;
  const separators = options.separators || DEFAULT_SEPARATORS;
  
  const chunks: Chunk[] = [];
  
  function splitRecursive(
    text: string,
    separatorIndex: number,
    startOffset: number
  ): string[] {
    if (text.length <= chunkSize) {
      return [text];
    }
    
    const separator = separators[separatorIndex];
    const nextSeparatorIndex = separatorIndex + 1;
    
    // If we've exhausted separators, just split by character
    if (separator === '') {
      const result: string[] = [];
      for (let i = 0; i < text.length; i += chunkSize - chunkOverlap) {
        result.push(text.slice(i, i + chunkSize));
      }
      return result;
    }
    
    const parts = text.split(separator);
    const result: string[] = [];
    let currentChunk = '';
    
    for (const part of parts) {
      const potentialChunk = currentChunk
        ? currentChunk + separator + part
        : part;
      
      if (potentialChunk.length <= chunkSize) {
        currentChunk = potentialChunk;
      } else {
        // Current chunk is ready
        if (currentChunk) {
          result.push(currentChunk);
        }
        
        // Check if the part itself is too large
        if (part.length > chunkSize) {
          // Recursively split with next separator
          if (nextSeparatorIndex < separators.length) {
            const subParts = splitRecursive(part, nextSeparatorIndex, startOffset);
            result.push(...subParts);
            currentChunk = '';
          } else {
            // Force split by character
            for (let i = 0; i < part.length; i += chunkSize - chunkOverlap) {
              result.push(part.slice(i, i + chunkSize));
            }
            currentChunk = '';
          }
        } else {
          currentChunk = part;
        }
      }
    }
    
    if (currentChunk) {
      result.push(currentChunk);
    }
    
    return result;
  }
  
  // Split the text
  const textChunks = splitRecursive(text.trim(), 0, 0);
  
  // Apply overlap and create chunk objects
  let position = 0;
  for (let i = 0; i < textChunks.length; i++) {
    const content = textChunks[i].trim();
    if (!content) continue;
    
    const startPos = Math.max(0, text.indexOf(content, position));
    const endPos = startPos + content.length;
    
    chunks.push({
      content,
      index: chunks.length,
      metadata: {
        start: startPos,
        end: endPos,
        tokenCount: estimateTokens(content),
      },
    });
    
    position = startPos + 1;
  }
  
  return chunks;
}

/**
 * Estimate token count (rough approximation)
 */
function estimateTokens(text: string): number {
  // Average ~4 characters per token for English
  return Math.ceil(text.length / 4);
}

/**
 * Split markdown document while preserving structure
 */
export function splitMarkdown(
  markdown: string,
  options: ChunkingOptions
): Chunk[] {
  const { chunkSize, chunkOverlap } = options;
  const chunks: Chunk[] = [];
  
  // Split by headers first
  const headerRegex = /^(#{1,6})\s+(.+)$/gm;
  const sections: { level: number; title: string; content: string; start: number }[] = [];
  
  let lastIndex = 0;
  let match;
  
  while ((match = headerRegex.exec(markdown)) !== null) {
    if (lastIndex < match.index) {
      // Add content before this header to previous section
      if (sections.length > 0) {
        sections[sections.length - 1].content += markdown.slice(lastIndex, match.index);
      } else {
        // Content before first header
        sections.push({
          level: 0,
          title: '',
          content: markdown.slice(lastIndex, match.index),
          start: lastIndex,
        });
      }
    }
    
    sections.push({
      level: match[1].length,
      title: match[2],
      content: '',
      start: match.index,
    });
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining content
  if (lastIndex < markdown.length && sections.length > 0) {
    sections[sections.length - 1].content += markdown.slice(lastIndex);
  } else if (sections.length === 0) {
    sections.push({
      level: 0,
      title: '',
      content: markdown,
      start: 0,
    });
  }
  
  // Process each section
  for (const section of sections) {
    const sectionText = section.title
      ? `${'#'.repeat(section.level)} ${section.title}\n${section.content}`
      : section.content;
    
    if (sectionText.trim().length === 0) continue;
    
    if (sectionText.length <= chunkSize) {
      chunks.push({
        content: sectionText.trim(),
        index: chunks.length,
        metadata: {
          start: section.start,
          end: section.start + sectionText.length,
          tokenCount: estimateTokens(sectionText),
        },
      });
    } else {
      // Split large sections
      const subChunks = splitText(sectionText, { chunkSize, chunkOverlap });
      for (const subChunk of subChunks) {
        chunks.push({
          ...subChunk,
          index: chunks.length,
          metadata: {
            ...subChunk.metadata,
            start: section.start + subChunk.metadata.start,
            end: section.start + subChunk.metadata.end,
          },
        });
      }
    }
  }
  
  return chunks;
}

/**
 * Smart document chunker - detects format and applies appropriate strategy
 */
export function chunkDocument(
  content: string,
  contentType: string | null,
  options: ChunkingOptions
): Chunk[] {
  const lowerType = (contentType || '').toLowerCase();
  
  if (lowerType.includes('markdown') || lowerType.includes('md')) {
    return splitMarkdown(content, options);
  }
  
  // Default to standard text splitting
  return splitText(content, options);
}

/**
 * Merge small chunks to meet minimum size
 */
export function mergeSmallChunks(
  chunks: Chunk[],
  minSize: number
): Chunk[] {
  if (chunks.length === 0) return [];
  
  const merged: Chunk[] = [];
  let current = chunks[0];
  
  for (let i = 1; i < chunks.length; i++) {
    if (current.content.length < minSize) {
      // Merge with next chunk
      current = {
        content: current.content + '\n\n' + chunks[i].content,
        index: current.index,
        metadata: {
          start: current.metadata.start,
          end: chunks[i].metadata.end,
          tokenCount: (current.metadata.tokenCount || 0) + (chunks[i].metadata.tokenCount || 0),
        },
      };
    } else {
      merged.push(current);
      current = chunks[i];
    }
  }
  
  merged.push(current);
  
  // Re-index
  return merged.map((chunk, index) => ({
    ...chunk,
    index,
  }));
}
