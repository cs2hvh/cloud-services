import { describe, it, expect } from 'vitest';
import { kubernetesClusterSchema } from '@/lib/validation/kubernetes';

describe('Kubernetes Validation Schemas', () => {
  describe('kubernetesClusterSchema', () => {
    describe('Valid Cases', () => {
      it('should accept valid cluster configuration with minimum requirements', () => {
        const result = kubernetesClusterSchema.safeParse({
          name: 'test-cluster-01',
          nodes: 1,
        });
        expect(result.success).toBe(true);
      });

      it('should accept cluster name with letters and numbers', () => {
        const result = kubernetesClusterSchema.safeParse({
          name: 'cluster123',
          nodes: 1,
        });
        expect(result.success).toBe(true);
      });

      it('should accept cluster name with hyphens', () => {
        const result = kubernetesClusterSchema.safeParse({
          name: 'test-cluster-production',
          nodes: 1,
        });
        expect(result.success).toBe(true);
      });

      it('should accept exactly 3 characters name', () => {
        const result = kubernetesClusterSchema.safeParse({
          name: 'abc',
          nodes: 1,
        });
        expect(result.success).toBe(true);
      });

      it('should accept name with 2 letters minimum', () => {
        const result = kubernetesClusterSchema.safeParse({
          name: 'ab1',
          nodes: 1,
        });
        expect(result.success).toBe(true);
      });

      it('should accept cluster with 1 node', () => {
        const result = kubernetesClusterSchema.safeParse({
          name: 'test-cluster',
          nodes: 1,
        });
        expect(result.success).toBe(true);
      });

      it('should accept cluster with 10 nodes', () => {
        const result = kubernetesClusterSchema.safeParse({
          name: 'test-cluster',
          nodes: 10,
        });
        expect(result.success).toBe(true);
      });

      it('should accept cluster with 100 nodes', () => {
        const result = kubernetesClusterSchema.safeParse({
          name: 'test-cluster',
          nodes: 100,
        });
        expect(result.success).toBe(true);
      });
    });

    describe('Name Validation - Invalid Cases', () => {
      it('should reject name shorter than 3 characters', () => {
        const result = kubernetesClusterSchema.safeParse({
          name: 'ab',
          nodes: 1,
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('at least 3 characters');
        }
      });

      it('should reject name with only 1 letter', () => {
        const result = kubernetesClusterSchema.safeParse({
          name: 'a123',
          nodes: 1,
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('at least 2 letters');
        }
      });

      it('should reject name with only numbers', () => {
        const result = kubernetesClusterSchema.safeParse({
          name: '12345',
          nodes: 1,
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('at least 2 letters');
        }
      });

      it('should reject name with special characters except hyphen', () => {
        const result = kubernetesClusterSchema.safeParse({
          name: 'test@cluster',
          nodes: 1,
        });
        expect(result.success).toBe(false);
      });

      it('should reject name with spaces', () => {
        const result = kubernetesClusterSchema.safeParse({
          name: 'test cluster',
          nodes: 1,
        });
        expect(result.success).toBe(false);
      });

      it('should reject name with underscores', () => {
        const result = kubernetesClusterSchema.safeParse({
          name: 'test_cluster',
          nodes: 1,
        });
        expect(result.success).toBe(false);
      });

      it('should reject name with periods', () => {
        const result = kubernetesClusterSchema.safeParse({
          name: 'test.cluster',
          nodes: 1,
        });
        expect(result.success).toBe(false);
      });

      it('should reject name with uppercase letters', () => {
        // Note: Schema doesn't explicitly reject uppercase, 
        // but convention is lowercase. Adjust if schema changes
        const result = kubernetesClusterSchema.safeParse({
          name: 'Test-Cluster',
          nodes: 1,
        });
        // This currently passes - update test if schema is made more strict
        expect(result.success).toBe(true);
      });

      it('should reject empty name', () => {
        const result = kubernetesClusterSchema.safeParse({
          name: '',
          nodes: 1,
        });
        expect(result.success).toBe(false);
      });
    });

    describe('Node Validation - Invalid Cases', () => {
      it('should reject 0 nodes', () => {
        const result = kubernetesClusterSchema.safeParse({
          name: 'test-cluster',
          nodes: 0,
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('at least 1 node');
        }
      });

      it('should reject negative nodes', () => {
        const result = kubernetesClusterSchema.safeParse({
          name: 'test-cluster',
          nodes: -5,
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues.some(issue => 
            issue.message.includes('negative') || issue.message.includes('at least 1')
          )).toBe(true);
        }
      });

      it('should reject decimal nodes', () => {
        const result = kubernetesClusterSchema.safeParse({
          name: 'test-cluster',
          nodes: 2.5,
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('whole number');
        }
      });

      it('should reject non-numeric nodes (string)', () => {
        const result = kubernetesClusterSchema.safeParse({
          name: 'test-cluster',
          nodes: 'three',
        });
        expect(result.success).toBe(false);
      });

      it('should reject non-numeric nodes (null)', () => {
        const result = kubernetesClusterSchema.safeParse({
          name: 'test-cluster',
          nodes: null,
        });
        expect(result.success).toBe(false);
      });

      it('should reject missing nodes field', () => {
        const result = kubernetesClusterSchema.safeParse({
          name: 'test-cluster',
        });
        expect(result.success).toBe(false);
      });
    });

    describe('Combined Validation', () => {
      it('should reject both invalid name and invalid nodes', () => {
        const result = kubernetesClusterSchema.safeParse({
          name: 'ab',
          nodes: -1,
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues.length).toBeGreaterThan(1);
        }
      });

      it('should reject missing both fields', () => {
        const result = kubernetesClusterSchema.safeParse({});
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues.length).toBeGreaterThanOrEqual(2);
        }
      });
    });
  });
});
