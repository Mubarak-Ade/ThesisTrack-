import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { SecurityLog } from '../data/types';

const SEVERITY_DOT: Record<SecurityLog['severity'], string> = {
  ok: 'bg-success',
  warn: 'bg-primary',
  danger: 'bg-danger',
};

/** Recent Security Logs rail — fixture-backed, no endpoint (spec §4). */
export default function SecurityLogsRail({ logs }: { logs: SecurityLog[] }) {
  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Monitoring</p>
        <h2 className="mt-1 font-display text-lg font-bold text-foreground">Recent Security Logs</h2>

        <ul className="mt-4 space-y-3">
          {logs.map((log) => (
            <li key={log.id} className="rounded-lg border border-border bg-background px-3.5 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
                  <span
                    className={cn('size-2 shrink-0 rounded-full', SEVERITY_DOT[log.severity])}
                    aria-hidden="true"
                  />
                  <span className="truncate">{log.action}</span>
                </span>
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {log.when}
                </span>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                Target: {log.target} • By: {log.actor}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
