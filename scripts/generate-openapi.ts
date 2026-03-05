#!/usr/bin/env tsx
/**
 * Generate OpenAPI specification from Zod schemas
 * Usage: npm run generate:openapi
 */
import fs from 'fs';
import path from 'path';
import { generateOpenAPIDocument } from '../lib/openapi/registry';

console.log('🔧 Generating OpenAPI specification...');

try {
  const spec = generateOpenAPIDocument();
  const outputPath = path.join(process.cwd(), 'public', 'openapi.json');

  fs.writeFileSync(outputPath, JSON.stringify(spec, null, 2), 'utf-8');

  console.log('✅ OpenAPI spec generated successfully!');
  console.log(`📄 Output: ${outputPath}`);
  console.log(`📊 Paths: ${Object.keys(spec.paths || {}).length} endpoints`);
  console.log(`📦 Schemas: ${Object.keys(spec.components?.schemas || {}).length} components`);
  console.log('\n🌐 View docs at: http://localhost:3000/api-docs');
} catch (error) {
  console.error('❌ Failed to generate OpenAPI spec:');
  console.error(error);
  process.exit(1);
}
