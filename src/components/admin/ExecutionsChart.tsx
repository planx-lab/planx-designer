import { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { useExecutions } from '@/hooks/queries';
import type { ExecutionRecord } from '@/types/admin';
import { Card, CardHeader, CardContent } from '@/components/ui/card';

/**
 * Aggregates executions into per-hour buckets so the dashboard has a temporal
 * view (throughput + status mix) instead of single-point KPIs only. The engine
 * API is paginated and has no dedicated timeseries endpoint, so we bucket the
 * recent executions client-side. Adequate for an Alpha monitoring panel.
 */
function bucketByHour(executions: ExecutionRecord[]) {
  const now = Date.now();
  const buckets = new Map<string, { time: string; ts: number; SUCCEEDED: number; FAILED: number; RUNNING: number; PENDING: number }>();

  // Seed the last 24 hours so the chart has a continuous axis even with sparse data.
  for (let h = 23; h >= 0; h--) {
    const ts = new Date(now - h * 3600_000);
    ts.setMinutes(0, 0, 0);
    const key = ts.toISOString();
    buckets.set(key, {
      time: ts.toLocaleTimeString([], { hour: '2-digit' }),
      ts: ts.getTime(),
      SUCCEEDED: 0,
      FAILED: 0,
      RUNNING: 0,
      PENDING: 0,
    });
  }

  for (const e of executions) {
    const ts = new Date(e.createdAt);
    ts.setMinutes(0, 0, 0);
    const key = ts.toISOString();
    const b = buckets.get(key);
    if (b && e.status in b) {
      (b as Record<string, number>)[e.status]++;
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.ts - b.ts);
}

const tooltipStyle = {
  backgroundColor: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: '0.5rem',
  fontSize: '0.75rem',
  color: 'var(--color-foreground)',
} as const;

export function ExecutionsChart() {
  const { data, isLoading, error } = useExecutions(1, '');

  const chartData = useMemo(
    () => bucketByHour(data?.executions ?? []),
    [data?.executions],
  );
  const total = chartData.reduce(
    (sum, b) => sum + b.SUCCEEDED + b.FAILED + b.RUNNING + b.PENDING,
    0,
  );

  return (
    <Card className="bg-surface border-border rounded-lg">
      <CardHeader className="flex flex-row items-center gap-2 border-b border-border pb-3">
        <TrendingUp size={16} className="text-foreground/50" aria-hidden />
        <h3 className="text-sm font-medium text-foreground font-mono">Executions (last 24h)</h3>
      </CardHeader>
      <CardContent className="p-4">
        {isLoading ? (
          <div className="h-48 flex items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        ) : error ? (
          <p className="text-destructive text-sm py-12 text-center" role="alert">
            Failed to load execution trend.
          </p>
        ) : total === 0 ? (
          <p className="text-foreground/50 text-sm py-12 text-center">
            No executions in the last 24 hours
          </p>
        ) : (
          <div
            role="img"
            aria-label={`Execution trend over the last 24 hours. ${total} total executions.`}
          >
            <ResponsiveContainer width="100%" height={192}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
                <XAxis
                  dataKey="time"
                  stroke="var(--color-foreground-muted)"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  interval={3}
                />
                <YAxis
                  stroke="var(--color-foreground-muted)"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  width={32}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area
                  type="monotone"
                  dataKey="SUCCEEDED"
                  stackId="1"
                  stroke="var(--color-accent)"
                  fill="var(--color-accent)"
                  fillOpacity={0.25}
                  strokeWidth={1.5}
                />
                <Area
                  type="monotone"
                  dataKey="FAILED"
                  stackId="1"
                  stroke="var(--color-destructive)"
                  fill="var(--color-destructive)"
                  fillOpacity={0.25}
                  strokeWidth={1.5}
                />
                <Area
                  type="monotone"
                  dataKey="RUNNING"
                  stackId="1"
                  stroke="var(--color-info)"
                  fill="var(--color-info)"
                  fillOpacity={0.2}
                  strokeWidth={1.5}
                />
                <Area
                  type="monotone"
                  dataKey="PENDING"
                  stackId="1"
                  stroke="var(--color-foreground-muted)"
                  fill="var(--color-foreground-muted)"
                  fillOpacity={0.15}
                  strokeWidth={1}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
