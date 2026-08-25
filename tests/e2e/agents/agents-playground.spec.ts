import { test, expect } from '../platform-apps/fixtures/auth.fixture';

/**
 * E2E (S2.5): Agents v2 playground — grounded answer with citations.
 *
 * Doc: nextstespsAI/12-agent-execution-stages.md (S2.5) — "agent with web_search +
 * file_search answers a grounded question with citations". Following the repo's
 * mocked-route convention (see database/*.spec.ts): the agent APIs are mocked so
 * this exercises the real UI flow (select agent → run → poll trace → render) end
 * to end without a live runner. The runner loop itself is unit-tested separately.
 *
 * Asserts: the playground enqueues a run, renders the step waterfall including the
 * file_search + web_search tool steps, and shows the final grounded answer whose
 * text carries numbered citations ([1], [2]).
 */

const AGENT = {
  id: 'agent_e2e_research',
  name: 'Research Assistant',
  model: 'openai/gpt-4o-mini',
  tools: [{ type: 'file_search', collection_id: 'col_e2e' }, { type: 'web_search' }],
};

const RUN_ID = 'run_e2e_0001';

// A completed run: model → file_search → web_search → model, grounded answer w/ citations.
const COMPLETED_TRACE = {
  id: RUN_ID,
  status: 'completed',
  cost_cents: 0.42,
  step_count: 4,
  error: null,
  output: {
    output: [
      {
        content: [
          {
            text:
              'AhuraSense is a cloud AI platform [1]. It supports retrieval-augmented ' +
              'generation over managed pgvector collections [2].',
          },
        ],
      },
    ],
  },
  steps: [
    { step_index: 0, step_type: 'model', tool_name: null, input_tokens: 120, output_tokens: 20, cost_cents: 0.1, latency_ms: 800, status: 'success' },
    { step_index: 1, step_type: 'file_search', tool_name: 'file_search', input_tokens: null, output_tokens: null, cost_cents: 0, latency_ms: 140, status: 'success' },
    { step_index: 2, step_type: 'web_search', tool_name: 'web_search', input_tokens: null, output_tokens: null, cost_cents: 1, latency_ms: 300, status: 'success' },
    { step_index: 3, step_type: 'model', tool_name: null, input_tokens: 260, output_tokens: 44, cost_cents: 0.22, latency_ms: 900, status: 'success' },
  ],
};

test.describe('Agents v2 Playground', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    // Agent picker source.
    await page.route('**/api/agents', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [AGENT] }) });
    });
    // Enqueue (POST) + recent-runs list (GET) share this path.
    await page.route('**/api/agents/runs', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ id: RUN_ID }) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
      }
    });
    // Trace poll → return the completed run immediately.
    await page.route('**/api/agents/runs/*/trace', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: COMPLETED_TRACE }) });
    });
  });

  test('E2E-AGENT-050: runs an agent and renders a grounded answer with citations', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/services/agents/playground');

    // Agent auto-selects the first entry; enter a question and run.
    await page.locator('#pg-input').fill('What is AhuraSense and does it support RAG?');
    await page.getByRole('button', { name: 'Run' }).click();

    // Final grounded output renders with numbered citations.
    const output = page.locator('text=AhuraSense is a cloud AI platform');
    await expect(output).toBeVisible();
    await expect(page.locator('body')).toContainText('[1]');
    await expect(page.locator('body')).toContainText('[2]');

    // Tool steps appear in the waterfall (proof the loop used file_search + web_search).
    await expect(page.getByText('file_search', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('web_search', { exact: false }).first()).toBeVisible();

    // Terminal status + step count surfaced.
    await expect(page.getByText('completed', { exact: false }).first()).toBeVisible();
    await expect(page.locator('body')).toContainText('4 steps');
  });
});
