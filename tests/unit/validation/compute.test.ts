import { describe, it, expect } from 'vitest';
import {
  createComputeInstanceSchema,
  resizeComputeInstanceSchema,
  rebuildComputeInstanceSchema,
  updateComputeInstanceSchema,
  computeActionSchema,
  computeBackupsActionSchema,
} from '@/lib/validation/compute';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

const validCreate = {
  label: 'web-server-01',
  region: 'us-ord',
  type: 'g6-standard-2',
  image: 'linode/ubuntu24.04',
  root_pass: 'Sup3rSecret!x',
};

describe('Compute Validation Schemas', () => {
  describe('createComputeInstanceSchema', () => {
    describe('valid cases', () => {
      it('accepts a minimal valid payload', () => {
        expect(createComputeInstanceSchema.safeParse(validCreate).success).toBe(true);
      });

      it('accepts optional fields together', () => {
        const result = createComputeInstanceSchema.safeParse({
          ...validCreate,
          ssh_key_ids: [VALID_UUID],
          backups_enabled: true,
          disk_encryption: false,
        });
        expect(result.success).toBe(true);
      });

      it('accepts a 3-character label', () => {
        expect(
          createComputeInstanceSchema.safeParse({ ...validCreate, label: 'ab1' }).success
        ).toBe(true);
      });

      it('accepts a 64-character label', () => {
        const label = 'a' + 'b'.repeat(62) + 'c';
        expect(
          createComputeInstanceSchema.safeParse({ ...validCreate, label }).success
        ).toBe(true);
      });

      it('accepts labels with dots, dashes and underscores in the middle', () => {
        expect(
          createComputeInstanceSchema.safeParse({ ...validCreate, label: 'web_1.prod-eu' }).success
        ).toBe(true);
      });

      it('accepts an 11-character root password', () => {
        expect(
          createComputeInstanceSchema.safeParse({ ...validCreate, root_pass: 'abcdefghij1' })
            .success
        ).toBe(true);
      });

      it('accepts a 128-character root password', () => {
        expect(
          createComputeInstanceSchema.safeParse({ ...validCreate, root_pass: 'A1' + 'a'.repeat(126) })
            .success
        ).toBe(true);
      });

      it('accepts 25 SSH key ids', () => {
        const result = createComputeInstanceSchema.safeParse({
          ...validCreate,
          ssh_key_ids: Array(25).fill(VALID_UUID),
        });
        expect(result.success).toBe(true);
      });
    });

    describe('invalid cases', () => {
      it('rejects a label shorter than 3 characters', () => {
        expect(
          createComputeInstanceSchema.safeParse({ ...validCreate, label: 'ab' }).success
        ).toBe(false);
      });

      it('rejects a label longer than 64 characters', () => {
        expect(
          createComputeInstanceSchema.safeParse({ ...validCreate, label: 'a'.repeat(65) }).success
        ).toBe(false);
      });

      it('rejects a label starting with a separator', () => {
        expect(
          createComputeInstanceSchema.safeParse({ ...validCreate, label: '-web' }).success
        ).toBe(false);
      });

      it('rejects a label ending with a separator', () => {
        expect(
          createComputeInstanceSchema.safeParse({ ...validCreate, label: 'web-' }).success
        ).toBe(false);
      });

      it('rejects a label with spaces or invalid characters', () => {
        expect(
          createComputeInstanceSchema.safeParse({ ...validCreate, label: 'my server!' }).success
        ).toBe(false);
      });

      it('rejects a missing region / type / image', () => {
        for (const field of ['region', 'type', 'image'] as const) {
          const payload: Record<string, unknown> = { ...validCreate };
          delete payload[field];
          expect(createComputeInstanceSchema.safeParse(payload).success).toBe(false);
        }
      });

      it('rejects an empty region', () => {
        expect(
          createComputeInstanceSchema.safeParse({ ...validCreate, region: '' }).success
        ).toBe(false);
      });

      it('rejects a root password shorter than 11 characters', () => {
        expect(
          createComputeInstanceSchema.safeParse({ ...validCreate, root_pass: 'short1!' }).success
        ).toBe(false);
      });

      it('rejects a root password longer than 128 characters', () => {
        expect(
          createComputeInstanceSchema.safeParse({ ...validCreate, root_pass: 'A1' + 'a'.repeat(127) })
            .success
        ).toBe(false);
      });

      it('rejects non-UUID ssh_key_ids', () => {
        expect(
          createComputeInstanceSchema.safeParse({ ...validCreate, ssh_key_ids: ['not-a-uuid'] })
            .success
        ).toBe(false);
      });

      it('rejects more than 25 SSH key ids', () => {
        expect(
          createComputeInstanceSchema.safeParse({
            ...validCreate,
            ssh_key_ids: Array(26).fill(VALID_UUID),
          }).success
        ).toBe(false);
      });

      it('rejects a non-boolean backups_enabled', () => {
        expect(
          createComputeInstanceSchema.safeParse({ ...validCreate, backups_enabled: 'yes' }).success
        ).toBe(false);
      });
    });
  });

  describe('resizeComputeInstanceSchema', () => {
    it('accepts a type', () => {
      expect(resizeComputeInstanceSchema.safeParse({ type: 'g6-standard-4' }).success).toBe(true);
    });

    it('rejects a missing or empty type', () => {
      expect(resizeComputeInstanceSchema.safeParse({}).success).toBe(false);
      expect(resizeComputeInstanceSchema.safeParse({ type: '' }).success).toBe(false);
    });
  });

  describe('rebuildComputeInstanceSchema', () => {
    it('accepts image + root_pass', () => {
      expect(
        rebuildComputeInstanceSchema.safeParse({
          image: 'linode/debian12',
          root_pass: 'Sup3rSecret!x',
        }).success
      ).toBe(true);
    });

    it('accepts optional ssh_key_ids', () => {
      expect(
        rebuildComputeInstanceSchema.safeParse({
          image: 'linode/debian12',
          root_pass: 'Sup3rSecret!x',
          ssh_key_ids: [VALID_UUID],
        }).success
      ).toBe(true);
    });

    it('rejects a short root password', () => {
      expect(
        rebuildComputeInstanceSchema.safeParse({ image: 'linode/debian12', root_pass: 'short' })
          .success
      ).toBe(false);
    });

    it('rejects a missing image', () => {
      expect(
        rebuildComputeInstanceSchema.safeParse({ root_pass: 'Sup3rSecret!x' }).success
      ).toBe(false);
    });
  });

  describe('updateComputeInstanceSchema', () => {
    it('accepts a valid label', () => {
      expect(updateComputeInstanceSchema.safeParse({ label: 'renamed-01' }).success).toBe(true);
    });

    it('rejects an invalid label', () => {
      expect(updateComputeInstanceSchema.safeParse({ label: '-bad-' }).success).toBe(false);
      expect(updateComputeInstanceSchema.safeParse({}).success).toBe(false);
    });
  });

  describe('computeActionSchema', () => {
    it('accepts each power action', () => {
      for (const action of ['boot', 'reboot', 'shutdown']) {
        expect(computeActionSchema.safeParse({ action }).success).toBe(true);
      }
    });

    it('rejects unknown actions', () => {
      const result = computeActionSchema.safeParse({ action: 'destroy' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('boot, reboot, shutdown');
      }
    });

    it('rejects a missing action', () => {
      expect(computeActionSchema.safeParse({}).success).toBe(false);
    });
  });

  describe('computeBackupsActionSchema', () => {
    it('accepts each backups action', () => {
      for (const action of ['enable', 'cancel', 'snapshot', 'restore']) {
        expect(computeBackupsActionSchema.safeParse({ action }).success).toBe(true);
      }
    });

    it('accepts snapshot with a label', () => {
      expect(
        computeBackupsActionSchema.safeParse({ action: 'snapshot', label: 'pre-upgrade' }).success
      ).toBe(true);
    });

    it('accepts restore with a backup_id', () => {
      expect(
        computeBackupsActionSchema.safeParse({ action: 'restore', backup_id: 123 }).success
      ).toBe(true);
    });

    it('rejects an unknown action', () => {
      expect(computeBackupsActionSchema.safeParse({ action: 'wipe' }).success).toBe(false);
    });

    it('rejects a non-integer backup_id', () => {
      expect(
        computeBackupsActionSchema.safeParse({ action: 'restore', backup_id: 1.5 }).success
      ).toBe(false);
    });

    it('rejects a negative backup_id', () => {
      expect(
        computeBackupsActionSchema.safeParse({ action: 'restore', backup_id: -1 }).success
      ).toBe(false);
    });

    it('rejects an over-long snapshot label', () => {
      expect(
        computeBackupsActionSchema.safeParse({ action: 'snapshot', label: 'x'.repeat(65) }).success
      ).toBe(false);
    });
  });
});
