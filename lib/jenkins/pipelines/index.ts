/**
 * Pipeline Factory - Export all pipeline types
 */
import { createSimpleTestPipeline } from './simple-test';
import { createNodeJsPipeline } from './nodejs';
import { createExpressPipeline } from './express';
import { createPythonPipeline } from './python';
import { createNextJsPipeline } from './nextjs';
import { createNuxtJsPipeline } from './nuxtjs';
import { createDeletePipeline } from './delete';
import { createViteReactPipeline } from './vite-react';
import { createVuePipeline } from './vue';
import { createAngularPipeline } from './angular';
import { createSvelteKitPipeline } from './sveltekit';
import { createDockerfilePipeline } from './generic-docker';
import { createJavaPipeline } from './java';
import { createResizePipeline } from './resize';

export type { CustomProfileSpec } from './utils';

export {
  createSimpleTestPipeline,
  createNodeJsPipeline,
  createExpressPipeline,
  createPythonPipeline,
  createNextJsPipeline,
  createNuxtJsPipeline,
  createDeletePipeline,
  createViteReactPipeline,
  createVuePipeline,
  createAngularPipeline,
  createSvelteKitPipeline,
  createDockerfilePipeline,
  createJavaPipeline,
  createResizePipeline,
};

/**
 * Pipeline type constants
 */
export const PipelineType = {
  SIMPLE_TEST: 'simple-test',
  NODEJS: 'nodejs',
  EXPRESS: 'express',
  PYTHON: 'python',
  NEXTJS: 'nextjs',
  NUXTJS: 'nuxtjs',
  DELETE: 'delete',
  VITE_REACT: 'vite-react',
  VUE: 'vue',
  ANGULAR: 'angular',
  SVELTEKIT: 'sveltekit',
  JAVA: 'java',
  DOCKERFILE: 'dockerfile',
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
    case PipelineType.NUXTJS:
      return createNuxtJsPipeline;
    case PipelineType.DELETE:
      return createDeletePipeline;
    case PipelineType.VITE_REACT:
      return createViteReactPipeline;
    case PipelineType.VUE:
      return createVuePipeline;
    case PipelineType.ANGULAR:
      return createAngularPipeline;
    case PipelineType.SVELTEKIT:
      return createSvelteKitPipeline;
    case PipelineType.JAVA:
      return createJavaPipeline;
    case PipelineType.DOCKERFILE:
      return createDockerfilePipeline;
    default:
      throw new Error(`Unknown pipeline type: ${type}`);
  }
}