import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { SecurityLog } from '../data/types';

const SEVERITY_DOT: Record<SecurityLog['severity'], string> = {
  ok: 'bg-success',
  warn: 'bg-amber-500',
  danger: 'bg-danger',
};

/** Recent Security Logs card — fixture-backed, no endpoint (spec §5.2). */
export default function SecurityLogsRail({ logs }: { logs: SecurityLog[] }) {
  return (
    <Card className="h-full">
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">Recent Security Logs</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Administrative audit trail for user actions
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-primary hover:text-primary"
            onClick={() => toast.info('The full audit log is not available yet')}
          >
            Full Audit Log
          </Button>
        </div>

        <ul className="mt-4">
          {logs.map((log) => (
            <li
              key={log.id}
              className="flex items-start justify-between gap-3 border-b border-border/70 py-3 last:border-0"
            >
              <span className="flex min-w-0 items-start gap-2.5">
                <span
                  className={cn('mt-1.5 size-2 shrink-0 rounded-full', SEVERITY_DOT[log.severity])}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{log.action}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    Target: {log.target} • By: {log.actor}
                  </span>
                </span>
              </span>
              <span className="shrink-0 text-xs font-medium text-muted-foreground">{log.when}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
