#!/usr/bin/env tsx
/**
 * Generate OpenAPI specifications from Zod schemas.
 * Usage: npm run generate:openapi
 *
 * Outputs:
 *   public/openapi.json            — platform API (apps, databases, k8s, …)
 *   workers/inference/openapi.json — inference edge gateway (chat, embeddings, …)
 */
import fs from 'fs';
import path from 'path';
import { generateOpenAPIDocument } from '../lib/openapi/registry';
import { generateInferenceOpenAPIDocument } from '../lib/openapi/registry-inference';

function write(filePath: string, spec: object) {
  fs.writeFileSync(filePath, JSON.stringify(spec, null, 2), 'utf-8');
  const p = Object.keys((spec as Record<string, unknown>).paths ?? {}).length;
  const s = Object.keys(((spec as Record<string, unknown>).components as Record<string, unknown>)?.schemas ?? {}).length;
  console.log(`  ${filePath}  (${p} paths, ${s} schemas)`);
}

console.log('Generating OpenAPI specs...');

try {
  write(path.join(process.cwd(), 'public', 'openapi.json'), generateOpenAPIDocument());
  write(path.join(process.cwd(), 'workers', 'inference', 'openapi.json'), generateInferenceOpenAPIDocument());
  console.log('Done.');
} catch (err) {
  console.error('Failed to generate OpenAPI specs:');
  console.error(err);
  process.exit(1);
}
