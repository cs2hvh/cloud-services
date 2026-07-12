import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/user/ssh-keys/route';
import {
  createMockPostRequest,
  expectResponseStatus,
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
} from '../../utils/test-helpers';

// Mock all dependencies before imports
vi.mock('@/lib/auth/server-auth');
vi.mock('@/lib/supabase/server');

const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const ROUTE_URL = 'http://localhost:3000/api/user/ssh-keys';

/** Build a structurally valid OpenSSH public key (RFC 4251 blob). */
function makeEd25519Key(comment = 'user@host'): string {
  const type = Buffer.from('ssh-ed25519', 'ascii');
  const typeLen = Buffer.alloc(4);
  typeLen.writeUInt32BE(type.length, 0);
  const key = Buffer.alloc(32, 0x07);
  const keyLen = Buffer.alloc(4);
  keyLen.writeUInt32BE(key.length, 0);
  const blob = Buffer.concat([typeLen, type, keyLen, key]);
  return `ssh-ed25519 ${blob.toString('base64')} ${comment}`;
}

interface SupabaseMockOptions {
  /** Result of the GET list query (select().order()). */
  listResult?: { data: unknown[] | null; error: { message: string } | null };
  /** Row count returned by the head/count query on POST. */
  count?: number;
  /** Result of insert().select().single(). */
  insertResult?: { data: unknown; error: { code?: string; message: string } | null };
}

function createSupabaseMock(options: SupabaseMockOptions = {}) {
  const {
    listResult = { data: [], error: null },
    count = 0,
    insertResult = {
      data: {
        id: 'key-1',
        label: 'work laptop',
        key_type: 'ssh-ed25519',
        fingerprint_sha256: 'SHA256:abc',
        created_at: '2026-07-11T00:00:00Z',
      },
      error: null,
    },
  } = options;

  const insert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue(insertResult),
    }),
  });

  const select = vi.fn().mockImplementation((_cols: string, opts?: { head?: boolean }) => {
    if (opts?.head) {
      // POST key-limit check: awaited directly for { count }.
      return Promise.resolve({ count, data: null, error: null });
    }
    // GET list: select(...).order(...)
    return { order: vi.fn().mockResolvedValue(listResult) };
  });

  const from = vi.fn().mockReturnValue({ select, insert });
  return { client: { from } as any, from, select, insert };
}

async function mockCreateClient(mock: { client: any }) {
  const { createClient } = await import('@/lib/supabase/server');
  vi.mocked(createClient).mockResolvedValue(mock.client);
}

describe('SSH Keys API (/api/user/ssh-keys)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET', () => {
    it('should require authentication', async () => {
      await mockUnauthenticatedUser();

      const response = await GET();
      await expectResponseStatus(response, 401);
    });

    it('should return the list of keys', async () => {
      await mockAuthenticatedUser(TEST_USER_ID);
      const rows = [
        {
          id: 'key-1',
          label: 'work laptop',
          key_type: 'ssh-ed25519',
          fingerprint_sha256: 'SHA256:abc',
          created_at: '2026-07-10T00:00:00Z',
          last_used_at: null,
        },
      ];
      const mock = createSupabaseMock({ listResult: { data: rows, error: null } });
      await mockCreateClient(mock);

      const response = await GET();
      const body = await expectResponseStatus(response, 200);

      expect(body.ok).toBe(true);
      expect(body.data).toEqual(rows);
      expect(mock.from).toHaveBeenCalledWith('user_ssh_keys');
    });

    it('should return an empty list when the user has no keys', async () => {
      await mockAuthenticatedUser(TEST_USER_ID);
      await mockCreateClient(createSupabaseMock({ listResult: { data: [], error: null } }));

      const response = await GET();
      const body = await expectResponseStatus(response, 200);
      expect(body.data).toEqual([]);
    });

    it('should return 500 on a database error', async () => {
      await mockAuthenticatedUser(TEST_USER_ID);
      await mockCreateClient(
        createSupabaseMock({ listResult: { data: null, error: { message: 'boom' } } })
      );

      const response = await GET();
      const body = await expectResponseStatus(response, 500);
      expect(body.ok).toBe(false);
    });
  });

  describe('POST', () => {
    it('should require authentication', async () => {
      await mockUnauthenticatedUser();

      const request = createMockPostRequest(ROUTE_URL, {
        label: 'work laptop',
        public_key: makeEd25519Key(),
      });
      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 401);
    });

    it('should return 400 on an invalid public key', async () => {
      await mockAuthenticatedUser(TEST_USER_ID);
      await mockCreateClient(createSupabaseMock());

      const request = createMockPostRequest(ROUTE_URL, {
        label: 'work laptop',
        public_key: 'this is not an ssh key',
      });
      const response = await POST(request as NextRequest);
      const body = await expectResponseStatus(response, 400);
      expect(body.ok).toBe(false);
    });

    it('should return 400 when a private key is pasted', async () => {
      await mockAuthenticatedUser(TEST_USER_ID);
      await mockCreateClient(createSupabaseMock());

      const request = createMockPostRequest(ROUTE_URL, {
        label: 'oops',
        public_key: '-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----',
      });
      const response = await POST(request as NextRequest);
      const body = await expectResponseStatus(response, 400);
      expect(body.error).toContain('PRIVATE');
    });

    it('should return 400 on a missing label', async () => {
      await mockAuthenticatedUser(TEST_USER_ID);
      await mockCreateClient(createSupabaseMock());

      const request = createMockPostRequest(ROUTE_URL, {
        public_key: makeEd25519Key(),
      });
      const response = await POST(request as NextRequest);
      const body = await expectResponseStatus(response, 400);
      expect(body.error).toContain('Label');
    });

    it('should return 400 on a label longer than 64 characters', async () => {
      await mockAuthenticatedUser(TEST_USER_ID);
      await mockCreateClient(createSupabaseMock());

      const request = createMockPostRequest(ROUTE_URL, {
        label: 'x'.repeat(65),
        public_key: makeEd25519Key(),
      });
      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 400);
    });

    it('should save a valid key (201) with the parsed fields', async () => {
      await mockAuthenticatedUser(TEST_USER_ID);
      const mock = createSupabaseMock({ count: 3 });
      await mockCreateClient(mock);

      const request = createMockPostRequest(ROUTE_URL, {
        label: 'work laptop',
        public_key: makeEd25519Key('pankaj@dev'),
      });
      const response = await POST(request as NextRequest);
      const body = await expectResponseStatus(response, 201);

      expect(body.ok).toBe(true);
      expect(body.data).toBeDefined();
      expect(mock.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: TEST_USER_ID,
          label: 'work laptop',
          key_type: 'ssh-ed25519',
          fingerprint_sha256: expect.stringMatching(/^SHA256:[A-Za-z0-9+/]+$/),
          public_key: expect.stringContaining('ssh-ed25519 '),
        })
      );
    });

    it('should return 409 when the key already exists (unique violation)', async () => {
      await mockAuthenticatedUser(TEST_USER_ID);
      await mockCreateClient(
        createSupabaseMock({
          insertResult: {
            data: null,
            error: { code: '23505', message: 'duplicate key value violates unique constraint' },
          },
        })
      );

      const request = createMockPostRequest(ROUTE_URL, {
        label: 'work laptop',
        public_key: makeEd25519Key(),
      });
      const response = await POST(request as NextRequest);
      const body = await expectResponseStatus(response, 409);
      expect(body.error).toContain('already');
    });

    it('should return 429 at the per-user key limit', async () => {
      await mockAuthenticatedUser(TEST_USER_ID);
      const mock = createSupabaseMock({ count: 25 });
      await mockCreateClient(mock);

      const request = createMockPostRequest(ROUTE_URL, {
        label: 'one too many',
        public_key: makeEd25519Key(),
      });
      const response = await POST(request as NextRequest);
      const body = await expectResponseStatus(response, 429);
      expect(body.error).toContain('25');
      expect(mock.insert).not.toHaveBeenCalled();
    });

    it('should return 500 on an unexpected insert error', async () => {
      await mockAuthenticatedUser(TEST_USER_ID);
      await mockCreateClient(
        createSupabaseMock({
          insertResult: { data: null, error: { message: 'connection reset' } },
        })
      );

      const request = createMockPostRequest(ROUTE_URL, {
        label: 'work laptop',
        public_key: makeEd25519Key(),
      });
      const response = await POST(request as NextRequest);
      await expectResponseStatus(response, 500);
    });

    it('should tolerate a malformed JSON body (400 via validation)', async () => {
      await mockAuthenticatedUser(TEST_USER_ID);
      await mockCreateClient(createSupabaseMock());

      const request = new NextRequest(ROUTE_URL, {
        method: 'POST',
        body: 'not-json-{',
        headers: { 'Content-Type': 'application/json' },
      });
      const response = await POST(request);
      await expectResponseStatus(response, 400);
    });
  });
});
