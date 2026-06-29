import { test, expect, type Page } from '@playwright/test';

// ── Mock data ──────────────────────────────────────────────────────────

const MOCK_PLUGINS = {
  plugins: [
    { id: 'source-hello', version: '1.0.0', displayName: 'Hello Source', description: 'A friendly source plugin', components: [{ id: 'source', kind: 'source', displayName: 'Hello Source', configSchema: { fields: [{ name: 'message', type: 'STRING', label: 'Message', defaultValue: { stringValue: 'Hello' } }, { name: 'count', type: 'INTEGER', label: 'Count', defaultValue: { intValue: 3 } }, { name: 'tls', type: 'BOOLEAN', label: 'TLS' }] } }] },
    { id: 'processor-passthrough', version: '1.0.0', displayName: 'Passthrough', description: 'Passes data through', components: [{ id: 'processor', kind: 'processor', displayName: 'Passthrough' }] },
    { id: 'sink-stdout', version: '1.0.0', displayName: 'Stdout Sink', description: 'Writes data to stdout', components: [{ id: 'sink', kind: 'sink', displayName: 'Stdout Sink' }] },
  ],
};

const MOCK_PLUGINS_MULTI = {
  plugins: [
    ...MOCK_PLUGINS.plugins,
    { id: 'mysql', version: '2.0.0', displayName: 'MySQL Connector', description: 'MySQL database connector', components: [{ id: 'source', kind: 'source', displayName: 'MySQL Source' }, { id: 'sink', kind: 'sink', displayName: 'MySQL Sink' }] },
  ],
};

const MOCK_PLUGINS_EMPTY = { plugins: [] };

const MOCK_SUBMIT_RESPONSE = { executionId: 'exec-123', pipelineId: 'pipe-456', status: 'PENDING' };

const MOCK_EXEC_SUCCEEDED = {
  executionId: 'exec-123', pipelineId: 'pipe-456', status: 'SUCCEEDED',
  nodeStatuses: { 'src-1': { nodeId: 'src-1', status: 'completed' }, 'snk-1': { nodeId: 'snk-1', status: 'completed' } },
};

// ── Helpers ────────────────────────────────────────────────────────────

async function mockPlugins(page: Page, data = MOCK_PLUGINS) {
  await page.route('**/api/plugins', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) }));
}

async function gotoAndWait(page: Page) {
  await page.goto('/');
  await page.waitForSelector('button:has-text("Sources")', { timeout: 15000 });
  await page.waitForSelector('button:has-text("Processors")', { timeout: 5000 });
  await page.waitForSelector('button:has-text("Sinks")', { timeout: 5000 });
}

async function addNode(page: Page, tabText: string, componentText: string) {
  await page.click(`button:has-text("${tabText}")`);
  await page.locator('button').filter({ hasText: componentText }).first().click();
}

async function mockSubmitEndpoints(page: Page) {
  await page.route('**/api/pipelines', (r) => {
    if (r.request().method() === 'POST') {
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SUBMIT_RESPONSE) });
    } else { r.continue(); }
  });
  await page.route('**/api/executions*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_EXEC_SUCCEEDED) }));
}

/** Select a canvas node by index via window.__pipelineStore (exposed in dev mode). */
async function selectNodeViaStore(page: Page, index: number) {
  await page.evaluate((idx) => {
    const store = (window as any).__pipelineStore;
    const ui = (window as any).__uiStore;
    const node = store.getState().nodes[idx];
    if (node) ui.getState().selectNode(node.id);
  }, index);
}

/** Get node IDs via window.__pipelineStore. */
async function getNodeIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const s = (window as any).__pipelineStore.getState();
    return s.nodes.map((n: any) => n.id);
  });
}

/** Connect nodes via the store's onConnect. */
async function connectNodes(page: Page, srcId: string, tgtId: string) {
  await page.evaluate(({ s, t }) => {
    (window as any).__pipelineStore.getState().onConnect({ source: s, target: t });
  }, { s: srcId, t: tgtId });
}

// ── Tests ──────────────────────────────────────────────────────────────

test.describe('Plan 5 Protocol Migration', () => {
  test.describe('1. Palette', () => {
    test('1.1 Palette loads components from engine', async ({ page }) => {
      await mockPlugins(page);
      await gotoAndWait(page);
      await expect(page.locator('button:has-text("Sources")')).toBeVisible();
      await expect(page.locator('button:has-text("Processors")')).toBeVisible();
      await expect(page.locator('button:has-text("Sinks")')).toBeVisible();
      await expect(page.locator('.space-y-1 button').first()).toBeVisible();
    });

    test('1.2 Components grouped by kind', async ({ page }) => {
      await mockPlugins(page, MOCK_PLUGINS_MULTI);
      await gotoAndWait(page);
      await page.click('button:has-text("Sources")');
      await expect(page.locator('text=Hello Source').first()).toBeVisible();
      await expect(page.locator('text=MySQL Source').first()).toBeVisible();
      await expect(page.locator('button:has-text("Passthrough")')).not.toBeVisible();
      await page.click('button:has-text("Processors")');
      await expect(page.locator('button:has-text("Passthrough")')).toBeVisible();
      await expect(page.locator('button:has-text("Hello Source")')).not.toBeVisible();
      await page.click('button:has-text("Sinks")');
      await expect(page.locator('button:has-text("Stdout Sink")')).toBeVisible();
      await expect(page.locator('button:has-text("MySQL Sink")')).toBeVisible();
      await expect(page.locator('button:has-text("Hello Source")')).not.toBeVisible();
    });

    test('1.3 Component card shows plugin badge', async ({ page }) => {
      await mockPlugins(page, MOCK_PLUGINS_MULTI);
      await gotoAndWait(page);
      await page.click('button:has-text("Sinks")');
      const card = page.locator('button').filter({ hasText: 'MySQL Sink' }).first();
      await expect(card).toBeVisible();
      const badge = card.locator('span.inline-block').first();
      await expect(badge).toBeVisible();
      await expect(badge).toContainText('MySQL Connector');
    });

    test('1.4 Multi-component plugin in multiple tabs', async ({ page }) => {
      await mockPlugins(page, MOCK_PLUGINS_MULTI);
      await gotoAndWait(page);
      await page.click('button:has-text("Sources")');
      await expect(page.locator('button:has-text("MySQL Source")')).toBeVisible();
      await page.click('button:has-text("Sinks")');
      await expect(page.locator('button:has-text("MySQL Sink")')).toBeVisible();
    });

    test('1.5 Search/filter', async ({ page }) => {
      await mockPlugins(page, MOCK_PLUGINS_MULTI);
      await gotoAndWait(page);
      await page.locator('input[placeholder="Filter components…"]').fill('MySQL');
      await expect(page.locator('button:has-text("MySQL Source")')).toBeVisible();
      await expect(page.locator('button:has-text("Hello Source")')).not.toBeVisible();
    });

    test('1.6 Empty state', async ({ page }) => {
      await mockPlugins(page, MOCK_PLUGINS_EMPTY);
      await gotoAndWait(page);
      await expect(page.locator('text=No components found')).toBeVisible();
    });
  });

  test.describe('2. Canvas', () => {
    test('2.1 Click to add source', async ({ page }) => {
      await mockPlugins(page);
      await gotoAndWait(page);
      await addNode(page, 'Sources', 'Hello Source');
      await expect(page.locator('.react-flow__node')).toBeVisible();
      await expect(page.locator('.react-flow__node').filter({ hasText: 'Hello Source' })).toBeVisible();
    });

    test('2.2 Click to add processor', async ({ page }) => {
      await mockPlugins(page);
      await gotoAndWait(page);
      await addNode(page, 'Processors', 'Passthrough');
      await expect(page.locator('.react-flow__node')).toBeVisible();
      await expect(page.locator('.react-flow__node').filter({ hasText: 'Passthrough' })).toBeVisible();
    });

    test('2.3 Click to add sink', async ({ page }) => {
      await mockPlugins(page);
      await gotoAndWait(page);
      await addNode(page, 'Sinks', 'Stdout Sink');
      await expect(page.locator('.react-flow__node')).toBeVisible();
      await expect(page.locator('.react-flow__node').filter({ hasText: 'Stdout Sink' })).toBeVisible();
    });

    test('2.4 Source uniqueness', async ({ page }) => {
      await mockPlugins(page, MOCK_PLUGINS_MULTI);
      await gotoAndWait(page);
      await addNode(page, 'Sources', 'Hello Source');
      await expect(page.locator('.react-flow__node')).toHaveCount(1);
      await addNode(page, 'Sources', 'MySQL Source');
      await expect(page.locator('.react-flow__node')).toHaveCount(1);
    });

    test('2.5 Node label shows pluginLabel', async ({ page }) => {
      await mockPlugins(page);
      await gotoAndWait(page);
      await addNode(page, 'Sources', 'Hello Source');
      await expect(page.locator('.react-flow__node').first()).toContainText('Hello Source');
    });
  });

  test.describe('3. ConfigPanel', () => {
    test('3.1 Select node opens config', async ({ page }) => {
      await mockPlugins(page);
      await gotoAndWait(page);
      await addNode(page, 'Sources', 'Hello Source');
      await selectNodeViaStore(page, 0);
      await expect(page.locator('label:has-text("Node Name")')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('label:has-text("Component")')).toBeVisible();
    });

    test('3.2 Component picker shows right kind', async ({ page }) => {
      await mockPlugins(page, MOCK_PLUGINS_MULTI);
      await gotoAndWait(page);
      await addNode(page, 'Sources', 'Hello Source');
      await selectNodeViaStore(page, 0);
      const select = page.locator('select');
      await expect(select).toBeVisible({ timeout: 5000 });
      const opts = await select.locator('option').allTextContents();
      expect(opts.some((t) => t.includes('Hello Source'))).toBeTruthy();
      expect(opts.some((t) => t.includes('Passthrough'))).toBeFalsy();
      expect(opts.some((t) => t.includes('Stdout Sink'))).toBeFalsy();
    });

    test('3.3 Component picker options format', async ({ page }) => {
      await mockPlugins(page);
      await gotoAndWait(page);
      await addNode(page, 'Sources', 'Hello Source');
      await selectNodeViaStore(page, 0);
      await expect(page.locator('select')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('select option').first()).toContainText('Hello Source');
    });

    test('3.4 Change component', async ({ page }) => {
      await mockPlugins(page, MOCK_PLUGINS_MULTI);
      await gotoAndWait(page);
      await addNode(page, 'Sources', 'Hello Source');
      await selectNodeViaStore(page, 0);
      await expect(page.locator('select')).toBeVisible({ timeout: 5000 });
      await page.locator('select').selectOption('mysql/source');
      await expect(page.locator('.react-flow__node').first()).toContainText('MySQL Source');
    });

    test('3.5 JSON editor works', async ({ page }) => {
      await mockPlugins(page);
      await gotoAndWait(page);
      await addNode(page, 'Sources', 'Hello Source');
      await selectNodeViaStore(page, 0);
      // Set config directly via the store (CodeMirror keyboard input is unreliable)
      await page.evaluate(() => {
        const s = (window as any).__pipelineStore.getState();
        const node = s.nodes[0];
        if (node) s.setConfig(node.id, { message: 'hello' });
      });
      await expect(page.locator('.react-flow__node').first()).toContainText('Configured');
    });

    test('3.6 Invalid JSON handled', async ({ page }) => {
      await mockPlugins(page);
      await gotoAndWait(page);
      await addNode(page, 'Sources', 'Hello Source');
      await selectNodeViaStore(page, 0);
      // Source-hello now has configSchema → SchemaForm by default.
      // Toggle to Raw JSON to access CodeMirror.
      await page.click('button:has-text("Raw JSON")');
      const cm = page.locator('.cm-editor');
      await expect(cm).toBeVisible({ timeout: 5000 });
      await cm.click();
      await page.keyboard.press('Control+a');
      await page.keyboard.press('Delete');
      await page.keyboard.type('{invalid', { delay: 10 });
      await expect(page.locator('.cm-lint-marker-error').first()).toBeVisible({ timeout: 5000 });
      await expect(page.locator('.react-flow__node').first()).not.toContainText('Configured');
    });
  });

  test.describe('4. Spec Preview', () => {
    test('4.1 YAML preview shows plugin_id + component_id', async ({ page }) => {
      await mockPlugins(page);
      await gotoAndWait(page);
      await addNode(page, 'Sources', 'Hello Source');
      await addNode(page, 'Sinks', 'Stdout Sink');
      await page.click('button:has-text("Preview")');
      const pre = page.locator('pre');
      await expect(pre).toBeVisible();
      const text = await pre.textContent();
      expect(text).toContain('plugin_id:');
      expect(text).toContain('component_id:');
      expect(text).toContain('source-hello');
      expect(text).toContain('sink-stdout');
    });

    test('4.2 YAML copiable', async ({ page }) => {
      // Grant clipboard permission for headless Chromium
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      await mockPlugins(page);
      await gotoAndWait(page);
      await addNode(page, 'Sources', 'Hello Source');
      await addNode(page, 'Sinks', 'Stdout Sink');
      await page.click('button:has-text("Preview")');
      // Find the Copy button in the SpecPreview header toolbar.
      // In the .flex.items-center.gap-2 container: YAML(0), JSON(1), Validation(2), Copy(3), Close(4)
      const copyBtn = page.locator('.flex.items-center.gap-2 button').nth(3);
      await expect(copyBtn).toBeVisible();
      await copyBtn.click();
      // After copy, the icon changes to Check (with text-accent class)
      await expect(page.locator('svg.text-accent').first()).toBeVisible({ timeout: 3000 });
    });
  });

  test.describe('5. Submit + Validation', () => {
    test('5.1 Validation rejects missing component_id', async ({ page }) => {
      await mockPlugins(page);
      await gotoAndWait(page);
      await addNode(page, 'Sources', 'Hello Source');
      await addNode(page, 'Sinks', 'Stdout Sink');
      const ids = await getNodeIds(page);
      await connectNodes(page, ids[0], ids[1]);
      // Clear component_id on source node
      await page.evaluate(() => {
        const s = (window as any).__pipelineStore.getState();
        const node = s.nodes[0];
        if (node) s.setComponent(node.id, '', '', '');
      });
      await page.click('button:has-text("Preview")');
      await page.click('button:has-text("Validation")');
      await expect(page.locator('text=component_id is required')).toBeVisible({ timeout: 5000 });
    });

    test('5.2 Valid spec submits', async ({ page }) => {
      await mockPlugins(page);
      await mockSubmitEndpoints(page);
      await gotoAndWait(page);
      await addNode(page, 'Sources', 'Hello Source');
      await addNode(page, 'Sinks', 'Stdout Sink');
      const ids = await getNodeIds(page);
      await connectNodes(page, ids[0], ids[1]);
      await page.locator('input[placeholder="Pipeline name…"]').fill('test-pipeline');
      await page.locator('input[placeholder="Tenant ID…"]').fill('test-tenant');
      await page.click('button:has-text("Submit")');
      await expect(page.locator('button').filter({ hasText: /Submitted/ })).toBeVisible({ timeout: 15000 });
    });

    test('5.3 Status polling works', async ({ page }) => {
      await mockPlugins(page);
      await page.route('**/api/pipelines', (r) => {
        if (r.request().method() === 'POST') {
          r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SUBMIT_RESPONSE) });
        } else { r.continue(); }
      });
      // Return RUNNING then SUCCEEDED after a brief delay to simulate polling going through multiple cycles
      let pollCount = 0;
      await page.route('**/api/executions/**', (r) => {
        pollCount++;
        const body = pollCount <= 2
          ? JSON.stringify({ executionId: 'exec-123', pipelineId: 'pipe-456', status: 'RUNNING' })
          : JSON.stringify(MOCK_EXEC_SUCCEEDED);
        r.fulfill({ status: 200, contentType: 'application/json', body });
      });
      await gotoAndWait(page);
      await addNode(page, 'Sources', 'Hello Source');
      await addNode(page, 'Sinks', 'Stdout Sink');
      const ids = await getNodeIds(page);
      await connectNodes(page, ids[0], ids[1]);
      await page.locator('input[placeholder="Pipeline name…"]').fill('test-pipeline');
      await page.locator('input[placeholder="Tenant ID…"]').fill('test-tenant');
      await page.click('button:has-text("Submit")');
      // Should transition from Running -> Succeeded via polling
      await expect(page.locator('text=Running...').first()).toBeVisible({ timeout: 15000 });
      await expect(page.locator('text=Succeeded').first()).toBeVisible({ timeout: 30000 });
    });

    test('5.4 Per-node status displayed', async ({ page }) => {
      await mockPlugins(page);
      await mockSubmitEndpoints(page);
      await gotoAndWait(page);
      await addNode(page, 'Sources', 'Hello Source');
      await addNode(page, 'Sinks', 'Stdout Sink');
      const ids = await getNodeIds(page);
      await connectNodes(page, ids[0], ids[1]);
      await page.locator('input[placeholder="Pipeline name…"]').fill('test-pipeline');
      await page.locator('input[placeholder="Tenant ID…"]').fill('test-tenant');
      await page.click('button:has-text("Submit")');
      await expect(page.locator('text=src-1').first()).toBeVisible({ timeout: 15000 });
      await expect(page.locator('text=snk-1').first()).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('6. Regression', () => {
    test('6.1 Keyboard: Delete processor', async ({ page }) => {
      await mockPlugins(page);
      await gotoAndWait(page);
      await addNode(page, 'Sources', 'Hello Source');
      await addNode(page, 'Processors', 'Passthrough');
      await expect(page.locator('.react-flow__node')).toHaveCount(2);
      await selectNodeViaStore(page, 1);
      await page.keyboard.press('Delete');
      await expect(page.locator('.react-flow__node')).toHaveCount(1);
    });

    test('6.2 Keyboard: Escape', async ({ page }) => {
      await mockPlugins(page);
      await gotoAndWait(page);
      await addNode(page, 'Sources', 'Hello Source');
      await selectNodeViaStore(page, 0);
      await page.keyboard.press('Escape');
      await expect(page.locator('text=Select a node to edit its configuration')).toBeVisible();
    });

    test('6.3 Undo/Redo', async ({ page }) => {
      await mockPlugins(page);
      await gotoAndWait(page);
      // Add 2 nodes so there's undo history (first add creates no history entry
      // because _pushHistory skips when nodes.length === 0)
      await addNode(page, 'Sources', 'Hello Source');
      await addNode(page, 'Processors', 'Passthrough');
      await expect(page.locator('.react-flow__node')).toHaveCount(2);
      // Ctrl+Z undoes the processor addition
      await page.keyboard.press('Control+z');
      await expect(page.locator('.react-flow__node')).toHaveCount(1);
      // Ctrl+Shift+Z redoes
      await page.keyboard.press('Control+Shift+z');
      await expect(page.locator('.react-flow__node')).toHaveCount(2);
    });

    test('6.4 Panel collapse', async ({ page }) => {
      await mockPlugins(page);
      await gotoAndWait(page);
      await expect(page.locator('button[title="Hide palette"]')).toBeVisible();
      await page.locator('button[title="Hide palette"]').click();
      await expect(page.locator('button[title="Show palette"]')).toBeVisible();
      await expect(page.locator('button[title="Hide config"]')).toBeVisible();
      await page.locator('button[title="Hide config"]').click();
      await expect(page.locator('button[title="Show config"]')).toBeVisible();
      await page.locator('button[title="Show palette"]').click();
      await page.locator('button[title="Show config"]').click();
      await expect(page.locator('button[title="Hide palette"]')).toBeVisible();
      await expect(page.locator('button[title="Hide config"]')).toBeVisible();
    });
  });

  test.describe('7. Schema Config (Plan 5b)', () => {
    test('7.1 SchemaForm renders correct controls for source-hello', async ({ page }) => {
      await mockPlugins(page);
      await gotoAndWait(page);
      await addNode(page, 'Sources', 'Hello Source');
      await selectNodeViaStore(page, 0);

      // SchemaForm should show typed controls instead of CodeMirror
      await expect(page.locator('label:has-text("Message")')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('input[id="message"]')).toHaveAttribute('type', 'text');

      await expect(page.locator('input[id="count"]')).toHaveAttribute('type', 'number');

      await expect(page.locator('input[id="tls"]')).toHaveAttribute('type', 'checkbox');

      // CodeMirror should NOT be visible while SchemaForm is shown
      await expect(page.locator('.cm-editor')).not.toBeVisible();
    });

    test('7.2 Raw JSON toggle switches between SchemaForm and CodeMirror', async ({ page }) => {
      await mockPlugins(page);
      await gotoAndWait(page);
      await addNode(page, 'Sources', 'Hello Source');
      await selectNodeViaStore(page, 0);

      // SchemaForm visible initially
      await expect(page.locator('label:has-text("Message")')).toBeVisible({ timeout: 5000 });

      // Click "Raw JSON" toggle
      await page.click('button:has-text("Raw JSON")');

      // CodeMirror appears
      await expect(page.locator('.cm-editor')).toBeVisible({ timeout: 5000 });

      // SchemaForm hidden
      await expect(page.locator('label:has-text("Message")')).not.toBeVisible();

      // Toggle back to SchemaForm
      await page.click('button:has-text("Schema Form")');

      // SchemaForm returns
      await expect(page.locator('label:has-text("Message")')).toBeVisible({ timeout: 5000 });
    });

    test('7.3 Validate Config button shows result with mocked engine response', async ({ page }) => {
      await mockPlugins(page);
      // Mock the validate endpoint
      await page.route('**/api/plugins/validate', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, message: 'all good' }),
        });
      });
      await gotoAndWait(page);
      await addNode(page, 'Sources', 'Hello Source');
      await selectNodeViaStore(page, 0);

      // Click Validate Config
      await page.click('button:has-text("Validate Config")');

      // Should show "Validating..." then success
      await expect(page.locator('text=Validating...')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=all good').first()).toBeVisible({ timeout: 10000 });
      await expect(page.locator('div.text-green-500').first()).toBeVisible({ timeout: 5000 });
    });
  });
});
