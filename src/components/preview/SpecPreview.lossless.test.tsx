import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { parse } from 'lossless-json';
import { SpecPreview } from './SpecPreview';
import { usePipelineStore } from '@/stores/usePipelineStore';

afterEach(cleanup);

it('renders exact literals in the JSON spec preview, not number-wrapper objects', () => {
  usePipelineStore.getState().reset('tenant-a');
  usePipelineStore.setState({ nodes: [{
    id: 'src', type: 'pipelineNode', position: { x: 0, y: 0 },
    data: {
      name: 'src', nodeType: 'source', pluginId: 'builtin', componentId: 'source',
      pluginLabel: 'Builtin', isValid: true,
      config: parse('{"id":9007199254740993,"amount":123.450000000000000001}') as Record<string, unknown>,
    },
  }] });
  const { container } = render(<SpecPreview />);
  fireEvent.click(screen.getByRole('button', { name: 'JSON' }));
  const text = container.querySelector('pre')!.textContent;
  expect(text).toContain('"id": 9007199254740993');
  expect(text).toContain('"amount": 123.450000000000000001');
  expect(text).not.toContain('isLosslessNumber');
});
