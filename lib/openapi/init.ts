/**
 * OpenAPI Initialization
 * This file extends Zod with OpenAPI functionality.
 * Import this ONCE at the entry point of your app.
 */
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Extend Zod with OpenAPI methods (.openapi())
extendZodWithOpenApi(z);

export { z };
