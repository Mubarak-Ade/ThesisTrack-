import { Link } from 'react-router-dom';
import { ArrowRight, CalendarClock, GraduationCap, Inbox, ScrollText } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import ErrorState from '@/components/feedback/ErrorState';
import LoadingState from '@/components/feedback/LoadingState';
import SampleDataBanner from '@/components/feedback/SampleDataBanner';
import DeadlineChip from '@/components/project/DeadlineChip';
import { formatRelative } from '@/lib/utils/time';
import { useSupervisorDashboard } from '../hooks/useSupervision';

/**
 * §16.3 Supervisor dashboard / plan 12.1 — "assigned students, work awaiting
 * review, deadlines", ordered by what needs the supervisor next: the review
 * queue first, then the caseload, then the calendar (§16.5's promise that a
 * dashboard answers 'where am I and what do I do next' for every role).
 */
export default function SupervisorDashboard() {
  const dash = useSupervisorDashboard();

  if (dash.isPending) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
        <LoadingState label="Loading your caseload…" />
      </div>
    );
  }

  if (dash.isError) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
        <ErrorState
          message="Your dashboard could not be loaded right now."
          onRetry={() => void dash.refetch()}
        />
      </div>
    );
  }

  const data = dash.data;
  const queueCount = data.awaitingProposals.length + data.awaitingSubmissions.length;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
          Supervisor dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          Your assigned students, work awaiting review and upcoming deadlines.
        </p>
      </header>

      {data.usedFallback && (
        <div className="mt-4">
          <SampleDataBanner />
        </div>
      )}

      {/* 1 — the review queue (§16.3 "work awaiting review"). */}
      <section aria-labelledby="dq-queue" className="mt-6 flex flex-col gap-3">
        <h2 id="dq-queue" className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Inbox className="size-4 text-primary" aria-hidden="true" /> Work awaiting review
          <Badge variant="secondary" className="tabular-nums">
            {queueCount}
          </Badge>
        </h2>
        {queueCount === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing waiting right now — new work appears the moment a student submits.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.awaitingProposals.map((proposal) => (
              <li
                key={proposal.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                      <ScrollText className="size-3" aria-hidden="true" /> Proposal
                    </Badge>
                    <p className="truncate text-sm font-semibold text-foreground">
                      {proposal.title}
                    </p>
                    <span className="text-xs text-muted-foreground">v{proposal.version}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {proposal.student.firstName} {proposal.student.lastName} ·{' '}
                    {proposal.submittedAt ? `submitted ${formatRelative(proposal.submittedAt)}` : 'awaiting you'}
                    {proposal.status === 'under_review' && ' · in your review'}
                  </p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link to={`/proposals/${proposal.id}`}>
                    Review <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              </li>
            ))}
            {data.awaitingSubmissions.map((submission) => (
              <li
                key={submission.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                      Submission
                    </Badge>
                    <p className="truncate text-sm font-semibold text-foreground">
                      {submission.title}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {submission.studentName} ·{' '}
                    {submission.submittedAt
                      ? `submitted ${formatRelative(submission.submittedAt)}`
                      : 'awaiting you'}
                  </p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link to={`/supervision/${submission.studentId}/submissions/${submission.id}`}>
                    Review <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 2 — §6.2 I13: N students, one card each, never a single-student layout. */}
      <section aria-labelledby="dq-students" className="mt-8 flex flex-col gap-3">
        <h2
          id="dq-students"
          className="flex items-center gap-2 text-base font-semibold text-foreground"
        >
          <GraduationCap className="size-4 text-primary" aria-hidden="true" /> Assigned students
          <Badge variant="secondary" className="tabular-nums">
            {data.students.length}
          </Badge>
        </h2>
        {data.students.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No students are assigned to you yet — assignments appear here as soon as they exist.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.students.map((row) => (
              <li key={row.student.id}>
                <Link
                  to={`/supervision/${row.student.id}`}
                  className="flex h-full flex-col gap-1.5 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40"
                >
                  <p className="text-sm font-semibold text-foreground">
                    {row.student.firstName} {row.student.lastName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{row.student.email}</p>
                  <p className="mt-1 truncate text-sm text-foreground">
                    {row.projectTitle ?? 'No project yet'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.stageName ? `Stage: ${row.stageName}` : 'No stage to show'}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 3 — nearest deadlines across the caseload (§16.5 computed at read). */}
      <section aria-labelledby="dq-deadlines" className="mt-8 flex flex-col gap-3">
        <h2
          id="dq-deadlines"
          className="flex items-center gap-2 text-base font-semibold text-foreground"
        >
          <CalendarClock className="size-4 text-primary" aria-hidden="true" /> Upcoming deadlines
        </h2>
        {data.deadlines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No milestone deadlines are scheduled — add them on a student’s Milestones tab.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.deadlines.map((deadline) => (
              <li
                key={deadline.milestoneId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3"
              >
                <div className="flex min-w-0 flex-col">
                  <p className="truncate text-sm font-medium text-foreground">{deadline.title}</p>
                  <Link
                    to={`/supervision/${deadline.studentId}/milestones`}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {deadline.studentName}
                  </Link>
                </div>
                <DeadlineChip dueAt={deadline.dueAt} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
