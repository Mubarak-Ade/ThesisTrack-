import { History } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import EmptyState from '@/components/feedback/EmptyState';
import ErrorState from '@/components/feedback/ErrorState';
import LoadingState from '@/components/feedback/LoadingState';
import { formatRelative } from '@/lib/utils/time';
import { useActivity, useMyProject } from '../hooks/useProject';

/** §11.13 kinds → readable labels; anything else shows the raw kind. */
const KIND_LABEL: Record<string, string> = {
  'proposal.created': 'Proposal created',
  'proposal.submitted': 'Proposal submitted',
  'proposal.reviewed': 'Proposal reviewed',
  'submission.created': 'Submission created',
  'submission.submitted': 'Submission submitted',
  'submission.reviewed': 'Submission reviewed',
  'milestone.created': 'Milestone defined',
  'milestone.status': 'Milestone status changed',
  'stage.started': 'Stage started',
  'stage.completed': 'Stage completed',
  'assignment.created': 'Supervisor assigned',
  'feedback.created': 'Feedback posted',
};

function labelFor(kind: string): string {
  return KIND_LABEL[kind] ?? kind.replace(/[._]/g, ' ');
}

/**
 * §16.3 Activity — the §11.13 derived feed: what happened, when and by whom,
 * newest first. Read-only by design; it is the audit trail, not a control.
 */
export default function ProjectActivity() {
  const projectId = useMyProject().data?.id;
  const activity = useActivity(projectId);

  if (activity.isPending) return <LoadingState label="Loading activity…" />;
  if (activity.isError) {
    return (
      <ErrorState
        message="The activity trail could not be loaded."
        onRetry={() => void activity.refetch()}
      />
    );
  }

  const rows = activity.data ?? [];

  if (rows.length === 0) {
    return (
      <EmptyState
        eyebrow="Nothing yet"
        title="No activity recorded"
        description="Every stage move, submission and decision lands here automatically — the trail fills up as the project runs."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        The automatic trail of this project — derived from events (§11.13), never edited by
        anyone.
      </p>
      <Card>
        <CardContent className="p-0">
          <ol className="flex flex-col divide-y">
            {rows.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 p-4">
                <History
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">{entry.summary}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {labelFor(entry.kind)}
                    {entry.actor && ` · ${entry.actor.name}`}
                  </p>
                </div>
                <time
                  className="shrink-0 text-xs text-muted-foreground"
                  dateTime={entry.at}
                  title={new Date(entry.at).toLocaleString()}
                >
                  {formatRelative(entry.at)}
                </time>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
