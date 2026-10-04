import { MoreVertical, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { WorkspaceRow, WorkspaceStatus } from '../data/types';

const STATUS_BADGE: Record<WorkspaceStatus, { variant: 'default' | 'secondary' | 'success' | 'danger'; className?: string }> = {
  'IN PROGRESS': { variant: 'default' },
  'PENDING REVIEW': { variant: 'secondary' },
  DELAYED: { variant: 'danger' },
  COMPLETED: { variant: 'success' },
  ARCHIVED: { variant: 'secondary', className: 'bg-muted text-muted-foreground' },
};

interface WorkspaceTableProps {
  rows: WorkspaceRow[];
  /** Branded directory total for the footer (spec §5.1). */
  total: number;
}

export default function WorkspaceTable({ rows, total }: WorkspaceTableProps) {
  return (
    <Card className="h-full">
      <CardContent className="p-0">
        {/* Header row */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5 sm:p-6">
          <div>
            <h2 className="font-display text-lg font-bold text-foreground sm:text-xl">
              Primary Workspace
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Departmental oversight &amp; active research projects
            </p>
          </div>
          {/* Decorative filter chip (spec §5.1 — no filtering yet). */}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-alt px-3 py-1 text-xs font-medium text-muted-foreground">
            <SlidersHorizontal className="size-3.5" aria-hidden="true" />
            All Departments
          </span>
        </div>

        {/* Table scrolls inside the card — the page itself never overflows
            (`relative` keeps abs-positioned descendants inside the clip). */}
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[600px] table-fixed text-left text-[13px]">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <th scope="col" className="w-[24%] px-4 py-3 font-bold sm:px-5">Student</th>
                <th scope="col" className="w-[32%] px-3 py-3 font-bold">Project Details</th>
                <th scope="col" className="w-[20%] px-3 py-3 font-bold">Status</th>
                <th scope="col" className="w-[17%] px-3 py-3 font-bold">Supervisor</th>
                <th scope="col" className="w-[7%] px-2 py-3 font-bold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const badge = STATUS_BADGE[row.status] ?? { variant: 'secondary' as const };
                return (
                  <tr key={row.id} className="border-b border-border/70 transition-colors last:border-0 hover:bg-surface-alt/60">
                    <td className="px-4 py-3.5 align-top sm:px-5">
                      <span className="flex items-center gap-2.5">
                        <Avatar size="sm" />
                        <span className="min-w-0">
                          <span className="block whitespace-nowrap font-medium text-foreground">{row.student}</span>
                          {/* Live rows have no thesis code — the cell disappears. */}
                          {row.code !== undefined && (
                            <span className="block whitespace-nowrap text-xs text-muted-foreground">{row.code}</span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-3.5 align-top">
                      <span className="block text-foreground/90">{row.project}</span>
                      <span className="block text-xs text-muted-foreground">{row.phase ?? '—'}</span>
                    </td>
                    <td className="px-3 py-3.5 align-top">
                      <Badge variant={badge.variant} className={cn('whitespace-nowrap text-[11px]', badge.className)}>
                        {row.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-3.5 align-top text-muted-foreground">{row.supervisor ?? '—'}</td>
                    <td className="px-2 py-3.5 align-top text-right">
                      <button
                        type="button"
                        aria-label={`Actions for ${row.student}`}
                        onClick={() => toast.info('Row actions are not available yet')}
                        className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <MoreVertical className="size-4" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer: honest row count + projects link (spec §5.1). */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-4 sm:px-6">
          <p className="text-sm text-muted-foreground">
            Showing {rows.length} of {total} projects
          </p>
          <Link
            to="/projects"
            className="text-sm font-semibold text-primary transition-colors hover:underline"
          >
            View all projects ›
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
