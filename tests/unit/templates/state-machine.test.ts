import { describe, it, expect } from 'vitest';
import {
  canTransitionOperation,
  canTransitionTemplateVersion,
  canTransitionProject,
} from '@/lib/templates/domain/state-machine';

describe('canTransitionOperation', () => {
  it('allows queued → running', () => {
    expect(canTransitionOperation('queued', 'running')).toBe(true);
  });

  it('allows queued → cancelled', () => {
    expect(canTransitionOperation('queued', 'cancelled')).toBe(true);
  });

  it('allows running → succeeded', () => {
    expect(canTransitionOperation('running', 'succeeded')).toBe(true);
  });

  it('allows running → failed', () => {
    expect(canTransitionOperation('running', 'failed')).toBe(true);
  });

  it('allows running → waiting', () => {
    expect(canTransitionOperation('running', 'waiting')).toBe(true);
  });

  it('allows running → cancelled', () => {
    expect(canTransitionOperation('running', 'cancelled')).toBe(true);
  });

  it('allows running → rolled_back', () => {
    expect(canTransitionOperation('running', 'rolled_back')).toBe(true);
  });

  it('allows waiting → running', () => {
    expect(canTransitionOperation('waiting', 'running')).toBe(true);
  });

  it('allows failed → queued (retry)', () => {
    expect(canTransitionOperation('failed', 'queued')).toBe(true);
  });

  it('blocks succeeded → running', () => {
    expect(canTransitionOperation('succeeded', 'running')).toBe(false);
  });

  it('blocks succeeded → failed', () => {
    expect(canTransitionOperation('succeeded', 'failed')).toBe(false);
  });

  it('blocks cancelled → running', () => {
    expect(canTransitionOperation('cancelled', 'running')).toBe(false);
  });

  it('blocks rolled_back → running', () => {
    expect(canTransitionOperation('rolled_back', 'running')).toBe(false);
  });

  it('blocks queued → succeeded (skips running)', () => {
    expect(canTransitionOperation('queued', 'succeeded')).toBe(false);
  });
});

describe('canTransitionTemplateVersion', () => {
  it('allows draft → testing', () => {
    expect(canTransitionTemplateVersion('draft', 'testing')).toBe(true);
  });

  it('allows draft → tested', () => {
    expect(canTransitionTemplateVersion('draft', 'tested')).toBe(true);
  });

  it('allows testing → tested', () => {
    expect(canTransitionTemplateVersion('testing', 'tested')).toBe(true);
  });

  it('allows tested → published', () => {
    expect(canTransitionTemplateVersion('tested', 'published')).toBe(true);
  });

  it('allows published → deprecated', () => {
    expect(canTransitionTemplateVersion('published', 'deprecated')).toBe(true);
  });

  it('allows rejected → draft', () => {
    expect(canTransitionTemplateVersion('rejected', 'draft')).toBe(true);
  });

  it('blocks draft → published (must test first)', () => {
    expect(canTransitionTemplateVersion('draft', 'published')).toBe(false);
  });

  it('blocks published → draft', () => {
    expect(canTransitionTemplateVersion('published', 'draft')).toBe(false);
  });

  it('blocks deprecated → published', () => {
    expect(canTransitionTemplateVersion('deprecated', 'published')).toBe(false);
  });
});

describe('canTransitionProject', () => {
  it('allows creating → deploying', () => {
    expect(canTransitionProject('creating', 'deploying')).toBe(true);
  });

  it('allows creating → failed', () => {
    expect(canTransitionProject('creating', 'failed')).toBe(true);
  });

  it('allows deploying → ready', () => {
    expect(canTransitionProject('deploying', 'ready')).toBe(true);
  });

  it('allows deploying → degraded', () => {
    expect(canTransitionProject('deploying', 'degraded')).toBe(true);
  });

  it('allows deploying → failed', () => {
    expect(canTransitionProject('deploying', 'failed')).toBe(true);
  });

  it('allows ready → deploying (adding new service)', () => {
    expect(canTransitionProject('ready', 'deploying')).toBe(true);
  });

  it('allows ready → deleting', () => {
    expect(canTransitionProject('ready', 'deleting')).toBe(true);
  });

  it('allows degraded → ready', () => {
    expect(canTransitionProject('degraded', 'ready')).toBe(true);
  });

  it('allows failed → deploying (retry)', () => {
    expect(canTransitionProject('failed', 'deploying')).toBe(true);
  });

  it('allows deleting → deleted', () => {
    expect(canTransitionProject('deleting', 'deleted')).toBe(true);
  });

  it('blocks deleted → deploying', () => {
    expect(canTransitionProject('deleted', 'deploying')).toBe(false);
  });

  it('blocks creating → ready (skips deploying)', () => {
    expect(canTransitionProject('creating', 'ready')).toBe(false);
  });
});
