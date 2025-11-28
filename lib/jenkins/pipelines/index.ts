/**
 * Pipeline Factory - Export all pipeline types
 */
import { createSimpleTestPipeline } from './simple-test';
import { createNodeJsPipeline } from './nodejs';
import { createExpressPipeline } from './express';
import { createPythonPipeline } from './python';
import { createNextJsPipeline } from './nextjs';

export { createSimpleTestPipeline, createNodeJsPipeline, createExpressPipeline, createPythonPipeline, createNextJsPipeline };

/**
 * Pipeline type constants
 */
export const PipelineType = {
  SIMPLE_TEST: 'simple-test',
  NODEJS: 'nodejs',
  EXPRESS: 'express',
  PYTHON: 'python',
  NEXTJS: 'nextjs',
} as const;

export type PipelineTypeValue = typeof PipelineType[keyof typeof PipelineType];

/**
 * Get pipeline generator function by type
 */
export function getPipelineGenerator(type: PipelineTypeValue) {
  switch (type) {
    case PipelineType.SIMPLE_TEST:
      return createSimpleTestPipeline;
    case PipelineType.NODEJS:
      return createNodeJsPipeline;
    case PipelineType.EXPRESS:
      return createExpressPipeline;
    case PipelineType.PYTHON:
      return createPythonPipeline;
    case PipelineType.NEXTJS:
      return createNextJsPipeline;
    default:
      throw new Error(`Unknown pipeline type: ${type}`);
  }
}
