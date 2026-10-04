import { Link } from 'react-router-dom';
import { CalendarClock, UserCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ErrorState from '@/components/feedback/ErrorState';
import LoadingState from '@/components/feedback/LoadingState';
import SampleDataBanner from '@/components/feedback/SampleDataBanner';
import { summariseMilestones } from '@/lib/domain/progress';
import { formatRelative } from '@/lib/utils/time';
import DeadlineChip from '@/components/project/DeadlineChip';
import MilestoneBar from '@/components/project/MilestoneBar';
import StageTracker from '@/components/project/StageTracker';
import { useProjectOverview, useMyProject } from '../hooks/useProject';

/**
 * §16.5 Overview — "Where am I? What next?" The stage tracker (process
 * position) sits **beside** the milestone bar (§5.6 approved/total), never
 * merged (§3.4). Cards answer the two follow-up questions: who supervises
 * this and what is due next. Fixture fallback shows the SampleDataBanner.
 */
export default function ProjectOverview() {
  const projectId = useMyProject().data?.id;
  const overview = useProjectOverview(projectId);

  if (overview.isPending) {
    return <LoadingState label="Loading overview…" />;
  }

  if (overview.isError) {
    return (
      <ErrorState
        message="The project overview could not be loaded."
        onRetry={() => void overview.refetch()}
      />
    );
  }

  const { project, tracker, milestones, supervisor, usedFallback } = overview.data;
  const summary = summariseMilestones(milestones);
  const current = summary.current;
  const nearest = summary.nearest;

  return (
    <div className="flex flex-col gap-5">
      {usedFallback && <SampleDataBanner />}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Process position (stages) */}
        <StageTracker tracker={tracker} />

        {/* Progress (milestones, §5.6 derived) */}
        <div className="flex flex-col gap-5">
          <MilestoneBar
            approved={summary.approved}
            total={summary.total}
            percent={summary.percent}
          />

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <UserCheck className="size-4 text-primary" aria-hidden="true" /> Supervisor
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {supervisor ? (
                <div className="flex flex-col gap-1">
                  <p className="font-medium text-foreground">
                    {supervisor.supervisor.firstName} {supervisor.supervisor.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">{supervisor.supervisor.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Assigned {formatRelative(supervisor.assignedAt)}
                  </p>
                </div>
              ) : (
                <p className="text-muted-foreground">
                  No supervisor assigned yet — an administrator assigns one (§4.4).
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Current milestone</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3 text-sm">
              {current ? (
                <>
                  <span className="font-medium text-foreground">{current.title}</span>
                  <DeadlineChip dueAt={current.dueAt} />
                </>
              ) : (
                <p className="text-muted-foreground">
                  {summary.total > 0
                    ? 'Every milestone is approved — your supervisor defines the next one.'
                    : 'No milestones yet — your supervisor defines them when the project starts.'}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <CalendarClock className="size-4 text-primary" aria-hidden="true" /> Next deadline
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3 text-sm">
              {nearest ? (
                <>
                  <span className="font-medium text-foreground">{nearest.title}</span>
                  <DeadlineChip dueAt={nearest.dueAt} />
                </>
              ) : (
                <p className="text-muted-foreground">
                  No dated milestone on the horizon — your supervisor sets the schedule.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">About this project</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <p className="text-muted-foreground">
            {project.description || 'No description yet.'}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="sm" variant="outline">
              <Link to="/project/milestones">Milestones</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/project/submissions">Submissions</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/project/activity">Activity trail</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
