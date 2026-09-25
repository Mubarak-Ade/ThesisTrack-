import { ArrowRight, FileDown, FolderOpen, UserPlus, Users } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { downloadCsv } from '@/lib/csv';
import type { WorkspaceRow } from '../data/types';

interface Action {
  label: string;
  hint: string;
  icon: typeof UserPlus;
  /** Internal destination, or a client-side action. */
  to?: string;
  onClick?: () => void;
}

export default function QuickActions({ workspace }: { workspace: WorkspaceRow[] }) {
  const generateReport = () =>
    downloadCsv(
      'thesistrack-workspace-report.csv',
      ['Student', 'Code', 'Project', 'Phase', 'Status', 'Supervisor', 'Updated'],
      workspace.map((row) => [
        row.student,
        row.code,
        row.project,
        row.phase,
        row.status,
        row.supervisor,
        row.updated,
      ]),
    );

  const actions: Action[] = [
    { label: 'Add User', hint: 'Provision an account', icon: UserPlus, to: '/users/new' },
    { label: 'Assign Students', hint: 'Match supervisors', icon: Users, to: '/users' },
    { label: 'View Projects', hint: 'Browse the directory', icon: FolderOpen, to: '/users' },
    { label: 'Generate Report', hint: 'Download workspace CSV', icon: FileDown, onClick: generateReport },
  ];

  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Shortcuts</p>
        <h2 className="mt-1 font-display text-lg font-bold text-foreground sm:text-xl">
          Quick Actions
        </h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {actions.map((action) => {
            const Icon = action.icon;
            const tile = (
              <>
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {action.label}
                  </span>
                  <span className="block text-xs leading-snug text-muted-foreground">{action.hint}</span>
                </span>
                <ArrowRight
                  className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                  aria-hidden="true"
                />
              </>
            );

            return action.to ? (
              <Link
                key={action.label}
                to={action.to}
                className="group flex items-center gap-3 rounded-xl border border-border bg-background p-3.5 transition-colors hover:border-primary/40 hover:bg-surface-alt/60"
              >
                {tile}
              </Link>
            ) : (
              <Button
                key={action.label}
                type="button"
                variant="outline"
                onClick={action.onClick}
                className="group h-auto w-full justify-start gap-3 rounded-xl p-3.5 text-left"
              >
                {tile}
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
