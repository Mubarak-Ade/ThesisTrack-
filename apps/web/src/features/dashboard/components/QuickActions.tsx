import { ArrowRight, FileDown, FolderOpen, UserPlus, Users } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuthStore } from '@/stores/auth';
import type { QuickAction, WorkspaceRow } from '../data/types';
import { exportWorkspaceCsv } from '../lib/exportWorkspace';

const ICONS = [UserPlus, Users, FolderOpen, FileDown] as const;

export default function QuickActions({
  actions,
  workspace,
}: {
  actions: QuickAction[];
  workspace: WorkspaceRow[];
}) {
  const name = useAuthStore((s) => s.user);
  const sessionLabel = name ? `${name.firstName} ${name.lastName}` : 'Signed in';

  return (
    <Card className="h-full">
      <CardContent className="p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold text-foreground sm:text-xl">Quick Actions</h2>
        <p className="mt-1 text-sm text-muted-foreground">Administrative workflows</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {actions.map((action, index) => {
            const Icon = ICONS[index] ?? ArrowRight;
            const tile = (
              <>
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-tight text-foreground">
                    {action.label}
                  </span>
                  <span className="block text-xs leading-snug text-muted-foreground">{action.hint}</span>
                </span>
              </>
            );

            if (action.csv) {
              return (
                <Button
                  key={action.label}
                  type="button"
                  variant="outline"
                  onClick={() => exportWorkspaceCsv(workspace)}
                  className="group h-auto w-full justify-start gap-3 rounded-xl p-3.5 text-left"
                >
                  {tile}
                </Button>
              );
            }
            return (
              <Link
                key={action.label}
                to={action.to ?? '/dashboard'}
                className="group flex items-center gap-3 rounded-xl border border-border bg-background p-3.5 transition-colors hover:border-primary/40 hover:bg-surface-alt/60"
              >
                {tile}
              </Link>
            );
          })}
        </div>

        {/* Inner session strip (spec §5.1) — real name, static dept + version. */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-alt/60 px-3 py-2 text-xs text-muted-foreground">
          <span>Session: {sessionLabel} (Informatics)</span>
          <span className="font-medium">v1.2.4-stable</span>
        </div>
      </CardContent>
    </Card>
  );
}
