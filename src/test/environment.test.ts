import { expect, it } from 'vitest';

it('provides isolated DOM storage before application modules initialize', () => {
  expect(typeof localStorage?.getItem).toBe('function');
  localStorage.setItem('environment-probe', 'ready');
  expect(window.localStorage.getItem('environment-probe')).toBe('ready');
  localStorage.removeItem('environment-probe');
});
