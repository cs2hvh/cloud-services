import { defineConfig } from "vitest/config";

/**
 * The worker declared `"test": "vitest"` in package.json but shipped no
 * config, so vitest walked up to the repo root and applied the Next.js
 * config — whose `include` is `tests/**`, a directory that does not exist
 * here. Every run therefore exited "No test files found" and the gateway
 * went untested.
 *
 * Plain node environment: the functions under test are pure. Anything that
 * needs real Workers runtime bindings (KV, Durable Objects, Queues) should
 * use @cloudflare/vitest-pool-workers instead — note that package currently
 * conflicts with the pinned vitest 4 (it wants 2.0.x–3.2.x), which needs
 * resolving before runtime-bound tests can be written.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.ts"],
    environment: "node",
  },
});
