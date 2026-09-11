import { Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

/**
 * Shared execution-status badge for every Operate surface (Dashboard,
 * Executions, Pipelines). Status uses icon + color, never color alone
 * (unified-ui-design.md §4.3 Flow B). One implementation so the palette
 * cannot drift between pages.
 */
export function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'SUCCEEDED':
      return (
        <Badge variant="default" className="gap-1">
          <CheckCircle2 size={11} aria-hidden />
          SUCCEEDED
        </Badge>
      );
    case 'RUNNING':
      return (
        <Badge
          variant="secondary"
          className="bg-info/15 text-info border-info/20 gap-1"
        >
          <Loader2 size={11} className="animate-spin" aria-hidden />
          RUNNING
        </Badge>
      );
    case 'FAILED':
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle size={11} aria-hidden />
          FAILED
        </Badge>
      );
    case 'PENDING':
      return (
        <Badge variant="outline" className="text-foreground/60 border-foreground/20 gap-1">
          <Clock size={11} aria-hidden />
          PENDING
        </Badge>
      );
    default:
      // Unknown status: show the raw text without implying a state we can't verify.
      return (
        <Badge variant="outline" className="text-foreground/60 border-foreground/20">
          {status || '—'}
        </Badge>
      );
  }
}
