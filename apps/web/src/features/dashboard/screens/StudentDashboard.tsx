import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Clock3, FolderKanban, PencilLine, ScrollText } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import EmptyState from '@/components/feedback/EmptyState';
import ErrorState from '@/components/feedback/ErrorState';
import LoadingState from '@/components/feedback/LoadingState';
import SampleDataBanner from '@/components/feedback/SampleDataBanner';
import { summariseMilestones } from '@/lib/domain/progress';
import { formatDue } from '@/lib/utils/time';
import { useAuthStore } from '@/stores/auth';
import { useStudentDashboard } from '../hooks/useStudentDashboard';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under review',
  revision_required: 'Revision required',
  approved: 'Approved',
  rejected: 'Rejected',
};

/** State 5's facts: supervisor · current milestone · nearest deadline · progress (§16.2). */
function ProjectFacts({
  supervisorName,
  milestones,
}: {
  supervisorName: string | null;
  milestones: ReturnType<typeof summariseMilestones> | null;
}) {
  const due = milestones?.nearest ? formatDue(milestones.nearest.dueAt) : null;
  return (
    <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Supervisor
        </dt>
        <dd className="mt-0.5 text-sm text-foreground">{supervisorName ?? '—'}</dd>
      </div>
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Current milestone
        </dt>
        <dd className="mt-0.5 text-sm text-foreground">{milestones?.current?.title ?? '—'}</dd>
      </div>
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Nearest deadline
        </dt>
        <dd className="mt-0.5">
          {due && due.label ? (
            <span
              className={
                due.overdue
                  ? 'inline-flex items-center gap-1.5 rounded-full bg-danger-bg px-2.5 py-0.5 text-xs font-semibold text-danger'
                  : 'inline-flex items-center gap-1.5 rounded-full bg-surface-alt px-2.5 py-0.5 text-xs font-semibold text-foreground'
              }
            >
              <Clock3 className="size-3.5" aria-hidden="true" /> {due.label}
            </span>
          ) : (
            <span className="text-sm text-foreground">—</span>
          )}
        </dd>
      </div>
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Progress
        </dt>
        <dd className="mt-0.5">
          {milestones && milestones.total > 0 ? (
            <div className="flex items-center gap-3">
              <Progress value={milestones.percent} className="w-32" />
              <span className="text-sm text-muted-foreground">
                {milestones.approved} of {milestones.total} milestones approved
              </span>
            </div>
          ) : (
            <span className="text-sm text-foreground">No milestones yet</span>
          )}
        </dd>
      </div>
    </dl>
  );
}

/**
 * §16.2 — the six-state student dashboard (task 11.1). The table's own copy
 * renders verbatim; every state shows *state + next action* (§16.1). State 1's
 * draft variant is the documented §16.2 extension: a draft sits in row 1's
 * slot (assigned, nothing under review) with "continue" instead of "create".
 */
export default function StudentDashboard() {
  const userId = useAuthStore((s) => s.user?.id);
  const query = useStudentDashboard(userId);

  if (query.isPending && !query.data) {
    return (
      <div className="mx-auto w-full max-w-[1000px] px-4 py-6 sm:px-6 sm:py-8">
        <LoadingState label="Loading your dashboard…" />
      </div>
    );
  }

  if (query.isError && !query.data) {
    return (
      <div className="mx-auto w-full max-w-[1000px] px-4 py-6 sm:px-6 sm:py-8">
        <ErrorState
          message="Your dashboard could not be loaded."
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  const data = query.data;
  if (!data) return null;

  const { state, reviewComment, milestones } = data;
  const proposal = state.proposal;
  const supervisorName = state.supervisor
    ? `${state.supervisor.firstName} ${state.supervisor.lastName}`
    : null;
  const summary = state.state === 5 ? summariseMilestones(milestones) : null;

  const renderBody = (): { heading: string; body: ReactNode; action: ReactNode } => {
    switch (state.state) {
      case 0:
        return {
          heading: 'Welcome',
          body: 'Your department is assigning you a supervisor. You’ll be notified.',
          action: <></>,
        };
      case 1:
        return state.hasDraft && proposal
          ? {
              heading: 'Welcome',
              body: (
                <>
                  You have a draft proposal waiting to be submitted:{' '}
                  <span className="font-medium text-foreground">{proposal.title}</span>.
                </>
              ),
              action: (
                <>
                  <Button asChild>
                    <Link to={`/proposals/${proposal.id}/edit`}>
                      <PencilLine aria-hidden="true" /> Continue Draft
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link to={`/proposals/${proposal.id}`}>View Proposal</Link>
                  </Button>
                </>
              ),
            }
          : {
              heading: 'Welcome',
              body: 'You don’t have an active project proposal yet.',
              action: (
                <Button asChild>
                  <Link to="/proposals/new">
                    <ScrollText aria-hidden="true" /> Create Proposal
                  </Link>
                </Button>
              ),
            };
      case 2:
        return {
          heading: 'My Proposal',
          body: (
            <>
              <span className="font-medium text-foreground">{proposal?.title}</span>{' '}
              <Badge variant={proposal?.status === 'submitted' ? 'secondary' : 'default'}>
                {proposal ? STATUS_LABEL[proposal.status] : ''}
              </Badge>
              <span className="mt-2 block text-muted-foreground">
                Your proposal is currently being reviewed.
              </span>
            </>
          ),
          action: proposal ? (
            <Button asChild>
              <Link to={`/proposals/${proposal.id}`}>
                View Proposal <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          ) : (
            <></>
          ),
        };
      case 3:
        return {
          heading: 'Action Required',
          body: (
            <>
              <span className="text-muted-foreground">Your proposal requires revision.</span>
              {reviewComment && (
                <blockquote className="mt-3 border-l-2 border-primary/40 pl-3 text-sm text-foreground">
                  {reviewComment}
                </blockquote>
              )}
            </>
          ),
          action: proposal ? (
            <>
              <Button asChild variant="outline">
                <Link to={`/proposals/${proposal.id}`}>View Feedback</Link>
              </Button>
              <Button asChild>
                <Link to={`/proposals/${proposal.id}/edit`}>
                  <PencilLine aria-hidden="true" /> Edit Proposal
                </Link>
              </Button>
            </>
          ) : (
            <></>
          ),
        };
      case 4:
        return {
          heading: 'Proposal Not Approved',
          body: (
            <>
              <span className="text-muted-foreground">Reason</span>
              <blockquote className="mt-1 border-l-2 border-danger/40 pl-3 text-sm text-foreground">
                {reviewComment ?? 'The reviewer did not leave a comment.'}
              </blockquote>
            </>
          ),
          action: (
            <Button asChild>
              <Link to="/proposals/new">
                <ScrollText aria-hidden="true" /> Create New Proposal
              </Link>
            </Button>
          ),
        };
      case 5:
        return {
          heading: 'My Project',
          body: (
            <>
              <span className="text-muted-foreground">
                {state.project?.title ?? proposal?.title ?? 'Your project'}
              </span>
              <ProjectFacts supervisorName={supervisorName} milestones={summary} />
              {!state.project && (
                <p className="mt-3 text-sm text-muted-foreground">
                  Your approved proposal is being turned into a project — refresh shortly.
                </p>
              )}
            </>
          ),
          action: state.project ? (
            <Button asChild>
              <Link to="/project/overview">
                <FolderKanban aria-hidden="true" /> Open Project <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          ) : (
            <></>
          ),
        };
    }
  };

  const { heading, body, action } = renderBody();

  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 py-6 sm:px-6 sm:py-8">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <span>Home</span>
        <span aria-hidden="true">›</span>
        <span className="text-foreground">Dashboard</span>
      </nav>

      {data.usedFallback && (
        <div className="mt-4">
          <SampleDataBanner />
        </div>
      )}

      <Card className="mt-4">
        <CardHeader>
          <CardDescription className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            Where you are
          </CardDescription>
          {/* Real heading semantics — §16.7: the state name is the page's h1. */}
          <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">{heading}</h1>
        </CardHeader>
        <CardContent>
          <div className="text-sm leading-relaxed text-muted-foreground">{body}</div>
          <div className="mt-5 flex flex-wrap items-center gap-3">{action}</div>
        </CardContent>
      </Card>

      {/* Secondary wayfinding — never a substitute for the state's action. */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Button asChild variant="outline">
          <Link to="/proposals">My Proposals</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/notifications">Notifications</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/settings">Settings</Link>
        </Button>
      </div>

      {state.state === 0 && (
        <div className="mt-6">
          <EmptyState
            icon={<ScrollText className="size-5" />}
            eyebrow="While you wait"
            title="What happens next"
            description="Once your supervisor is assigned you can create a proposal, track its review and — after approval — follow your project milestones here."
          />
        </div>
      )}
    </div>
  );
}
