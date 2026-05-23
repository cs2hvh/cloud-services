import { authenticateUser } from '@/lib/auth/server-auth';
import { createServiceClient } from '@/lib/supabase/server';
import { OperationEventService } from '@/lib/templates/services/operation-event-service';

const POLL_INTERVAL_MS = 1500;

export async function GET(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { runId } = await params;
  const db = await createServiceClient();
  const { data: operation } = await db
    .from('operations')
    .select('id, user_id, status')
    .eq('id', runId)
    .eq('user_id', auth.user!.id)
    .single();

  if (!operation) return new Response('Not found', { status: 404 });

  const url = new URL(req.url);
  const lastEventIdHeader = req.headers.get('last-event-id');
  let lastSeenId = Number(url.searchParams.get('after') ?? lastEventIdHeader ?? 0) || 0;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let closed = false;

      req.signal.addEventListener('abort', () => {
        closed = true;
        try { controller.close(); } catch {}
      });

      async function flush() {
        const events = await OperationEventService.list(runId, lastSeenId || undefined);
        for (const event of events) {
          lastSeenId = event.id;
          controller.enqueue(encoder.encode(`id: ${event.id}\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(toSseEvent(event))}\n\n`));
        }
        return events;
      }

      try {
        await flush();
        while (!closed) {
          const events = await flush();
          const latestStatus = await getOperationStatus(runId, auth.user!.id);
          if (isTerminal(latestStatus) && events.length === 0) {
            controller.close();
            break;
          }
          if (events.length === 0) {
            controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
          }
          await sleep(POLL_INTERVAL_MS);
        }
      } catch (err) {
        controller.enqueue(encoder.encode(`event: error\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ message: (err as Error).message })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

function toSseEvent(event: {
  stage: string;
  status: string;
  progress_pct: number | null;
  message: string;
  service_id: string | null;
  data: unknown;
}) {
  return {
    stage: event.stage,
    status: event.status === 'success' ? 'success' : event.status === 'failed' ? 'failed' : 'running',
    progressPct: event.progress_pct ?? 0,
    message: event.message,
    serviceId: event.service_id,
    data: event.data,
  };
}

async function getOperationStatus(operationId: string, userId: string): Promise<string | null> {
  const db = await createServiceClient();
  const { data } = await db
    .from('operations')
    .select('status')
    .eq('id', operationId)
    .eq('user_id', userId)
    .single();
  return data?.status ?? null;
}

function isTerminal(status: string | null) {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled' || status === 'rolled_back';
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
