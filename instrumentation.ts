export async function register() {
  // Only start workers in the Node.js runtime (not Edge).
  // This runs in both standalone (Docker: node server.js) and
  // custom-server (dev/prod: tsx server.ts) modes.
  // The globalThis guards inside startBuildWorkers() prevent double-start
  // when both instrumentation and server.ts call it.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { startBuildWorkers } = await import('./lib/workers/build-worker');
      const workers = startBuildWorkers();
      process.on('SIGTERM', () => { workers.close().catch(() => undefined); });
    } catch (err) {
      console.warn('[instrumentation] Build workers failed to start (Redis unavailable?):', (err as Error).message);
    }
  }
}
