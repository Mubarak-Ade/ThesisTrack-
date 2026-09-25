import { SlidersHorizontal } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { WorkspaceRow, WorkspaceStatus } from '../data/types';

const STATUS_BADGE: Record<WorkspaceStatus, { variant: 'default' | 'secondary' | 'success' | 'danger'; className?: string }> = {
  'IN PROGRESS': { variant: 'default' },
  'PENDING REVIEW': { variant: 'secondary' },
  DELAYED: { variant: 'danger' },
  COMPLETED: { variant: 'success' },
};

export default function WorkspaceTable({ rows }: { rows: WorkspaceRow[] }) {
  return (
    <Card className="h-full">
      <CardContent className="p-0">
        {/* Header row */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5 sm:p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Overview
            </p>
            <h2 className="mt-1 font-display text-lg font-bold text-foreground sm:text-xl">
              Primary Workspace
            </h2>
          </div>
          {/* Decorative filter chip (spec §5.1 — no filtering yet). */}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-alt px-3 py-1 text-xs font-medium text-muted-foreground">
            <SlidersHorizontal className="size-3.5" aria-hidden="true" />
            All Statuses
          </span>
        </div>

        {/* Table scrolls inside the card — the page itself never overflows
            (`relative` keeps abs-positioned descendants inside the clip). */}
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[600px] min-[1440px]:min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <th scope="col" className="px-5 py-3 font-bold sm:px-6">Student</th>
                <th scope="col" className="px-3 py-3 font-bold">Project</th>
                <th scope="col" className="px-3 py-3 font-bold">Phase</th>
                <th scope="col" className="px-3 py-3 font-bold">Status</th>
                <th scope="col" className="hidden px-3 py-3 font-bold min-[1440px]:table-cell">
                  Supervisor
                </th>
                <th scope="col" className="px-5 py-3 font-bold sm:px-6">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const badge = STATUS_BADGE[row.status] ?? { variant: 'secondary' as const };
                return (
                  <tr key={`${row.student}-${row.code}`} className="border-b border-border/70 transition-colors last:border-0 hover:bg-surface-alt/60">
                    <td className="px-5 py-3.5 align-top sm:px-6">
                      <span className="block font-medium text-foreground">{row.student}</span>
                      <span className="block text-xs text-muted-foreground">{row.code}</span>
                    </td>
                    <td className="px-3 py-3.5 align-top text-foreground/90">{row.project}</td>
                    <td className="px-3 py-3.5 align-top text-muted-foreground">{row.phase}</td>
                    <td className="px-3 py-3.5 align-top">
                      <Badge variant={badge.variant} className={cn('whitespace-nowrap', badge.className)}>
                        {row.status}
                      </Badge>
                    </td>
                    <td className="hidden px-3 py-3.5 align-top text-muted-foreground min-[1440px]:table-cell">
                      {row.supervisor}
                    </td>
                    <td className="px-5 py-3.5 align-top text-xs text-muted-foreground sm:px-6">{row.updated}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
