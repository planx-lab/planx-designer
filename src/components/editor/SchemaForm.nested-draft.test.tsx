import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { SchemaForm } from './SchemaForm';
import { SourcePreviewPanel } from './SourcePreviewPanel';
import { PluginOperationsPanel } from './PluginOperationsPanel';
import { stringifyJson } from '@/lib/json';
import type { SourcePreviewResult } from '@/api/pluginPreview';
import type { RecordSchema } from '@/types/record';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const schema: RecordSchema = { fields: [{ name: 'id', kind: 'int64', nullable: false }] };
function Form({ initial = { schema } }: { initial?: Record<string, unknown> }) {
  const [config, setConfig] = useState<Record<string, unknown>>(initial);
  const [preview, setPreview] = useState<SourcePreviewResult>();
  return <>
    <SchemaForm recordSchemaForms schema={{ fields: [{ name: 'schema', type: 'OBJECT', label: 'record.Schema', required: true }] }} value={config} onChange={setConfig} />
    <output aria-label="Accepted config">{stringifyJson(config)}</output>
    <SourcePreviewPanel tenantId="nested-draft" pluginId="csv" componentId="source" config={config}
      operations={{ testConnection: false, checkCompatibility: false, preview: true }} onResult={setPreview} />
    <PluginOperationsPanel tenantId="nested-draft" pluginId="postgres" componentId="sink" config={config}
      operations={{ testConnection: false, checkCompatibility: true }} compatibilityOnly
      inputEvidence={{ key: stringifyJson(config), schema: preview?.batch.schema, scope: 'source' }} />
  </>;
}

it('keeps an invalid nested fields JSON draft across an outer mode switch and keeps preview and compatibility blocked', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response(stringifyJson({ batch: { schema, records: [] }, truncated: false })))
    .mockResolvedValueOnce(new Response('{"compatible":true,"scope":"static_schema","runtimeValidationRequired":true}'));
  vi.stubGlobal('fetch', fetch); render(<Form />);
  fireEvent.click(screen.getByRole('button', { name: 'Preview source data', exact: true }));
  await screen.findByLabelText('Preview record.Schema');
  fireEvent.click(screen.getByRole('button', { name: 'Check compatibility', exact: true }));
  await screen.findByText('Static schema compatible.');
  fireEvent.click(screen.getByRole('button', { name: '高级 JSON', exact: true }));
  const draft = screen.getByRole('textbox', { name: '' });
  expect(draft).toHaveValue(stringifyJson(schema.fields, 2));
  fireEvent.change(draft, { target: { value: '[{"name":"unfinished"' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Preview source data', exact: true })).toBeDisabled());
  fireEvent.click(screen.getByRole('button', { name: 'Schema 高级 JSON', exact: true }));
  expect(draft).toBeInTheDocument();
  expect(draft).toHaveValue('[{"name":"unfinished"');
  expect(draft).toHaveAttribute('data-config-invalid', 'true');
  expect(draft).toHaveAttribute('data-config-draft-invalid', 'true');
  expect(screen.getByText('请先修正未应用的 Schema 草稿，再切换编辑模式。')).toBeInTheDocument();
  expect(screen.getByLabelText('Accepted config').textContent).toBe(stringifyJson({ schema }));
  const preview = screen.getByRole('button', { name: 'Preview source data', exact: true });
  const compatibility = screen.getByRole('button', { name: 'Check compatibility', exact: true });
  expect(preview).toBeDisabled(); expect(compatibility).toBeDisabled();
  expect(screen.queryByText('Static schema compatible.')).not.toBeInTheDocument();
  fireEvent.click(preview); fireEvent.click(compatibility); expect(fetch).toHaveBeenCalledTimes(2);
});

it('allows the outer JSON editor for merely unset required field values without an unapplied invalid draft', () => {
  vi.stubGlobal('fetch', vi.fn()); render(<Form initial={{ schema: { fields: [{}] } }} />);
  expect(document.querySelector('[data-config-invalid="true"]')).toBeInTheDocument();
  expect(document.querySelector('[data-config-draft-invalid="true"]')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Schema 高级 JSON', exact: true }));
  expect(screen.getByLabelText(/^record\.Schema/)).toHaveValue(stringifyJson({ fields: [{}] }, 2));
  expect(screen.getByRole('button', { name: 'Schema 字段表单', exact: true })).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
