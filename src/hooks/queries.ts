import { useQuery } from '@tanstack/react-query';
import {
  fetchExecutions,
  fetchPipelines,
  fetchPlugins,
  fetchHealth,
} from '@/api/engine';

const TENANT_KEY = 'planx-admin:tenant';

export function getTenant(): string {
  return localStorage.getItem(TENANT_KEY) ?? 'default-tenant';
}

export function setTenant(t: string): void {
  localStorage.setItem(TENANT_KEY, t);
}

// ── Executions ──

export function useExecutions(page = 1, statusFilter = '') {
  return useQuery({
    queryKey: ['executions', getTenant(), page, statusFilter],
    queryFn: () => fetchExecutions(page, 20, statusFilter),
    refetchInterval: 10_000,
  });
}

// ── Pipelines ──

export function usePipelines(page = 1) {
  return useQuery({
    queryKey: ['pipelines', getTenant(), page],
    queryFn: () => fetchPipelines(page, 20),
    refetchInterval: 10_000,
  });
}

// ── Plugins ──

export function usePlugins() {
  return useQuery({
    queryKey: ['plugins'],
    queryFn: fetchPlugins,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

// ── Health ──

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 5_000,
  });
}
