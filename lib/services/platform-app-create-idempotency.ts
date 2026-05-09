import { checkIdempotency } from "@/lib/idempotency";

type CreateAppIdempotencyResult<T> =
  | { kind: "new"; execute: () => Promise<T> }
  | { kind: "in_progress"; retryAfter: number }
  | { kind: "completed"; result: T };

function buildScopedKey(userId: string, idempotencyKey: string) {
  return `platform-app-create:${userId}:${idempotencyKey}`;
}

export class PlatformAppCreateIdempotencyService {
  async begin<T>(params: {
    userId: string;
    idempotencyKey?: string | null;
    ttlSeconds?: number;
    shouldPersistResult?: (result: T) => boolean;
    execute: () => Promise<T>;
  }): Promise<CreateAppIdempotencyResult<T>> {
    if (!params.idempotencyKey) {
      return {
        kind: "new",
        execute: params.execute,
      };
    }

    const scopedKey = buildScopedKey(params.userId, params.idempotencyKey);
    const initial = await checkIdempotency(scopedKey, params.ttlSeconds ?? 60 * 60);

    if (initial.status === "completed") {
      return {
        kind: "completed",
        result: initial.data as T,
      };
    }

    if (initial.status === "in-progress") {
      return {
        kind: "in_progress",
        retryAfter: initial.retryAfter,
      };
    }

    const reserved = await initial.reserve();
    if (!reserved) {
      const followUp = await checkIdempotency(scopedKey, params.ttlSeconds ?? 60 * 60);
      if (followUp.status === "completed") {
        return {
          kind: "completed",
          result: followUp.data as T,
        };
      }

      return {
        kind: "in_progress",
        retryAfter: followUp.status === "in-progress" ? followUp.retryAfter : 5,
      };
    }

    return {
      kind: "new",
      execute: async () => {
        try {
          const result = await params.execute();
          const shouldPersist = params.shouldPersistResult
            ? params.shouldPersistResult(result)
            : true;

          if (shouldPersist) {
            await initial.complete(result);
          } else {
            await initial.abort();
          }

          return result;
        } catch (error) {
          await initial.abort();
          throw error;
        }
      },
    };
  }
}
