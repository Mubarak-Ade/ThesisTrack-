import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, History, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import EmptyState from '@/components/feedback/EmptyState';
import ErrorState from '@/components/feedback/ErrorState';
import LoadingState from '@/components/feedback/LoadingState';
import FeedbackThread from '@/components/project/FeedbackThread';
import { ApiError } from '@/lib/api/http';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/utils/time';
import { useAuthStore } from '@/stores/auth';
import { DECISION_STYLE, SUBMISSION_STYLE } from '../components/chips';
import type { ReviewDecision } from '../data/types';
import { downloadVersion } from '../data/supervisionRepo';
import {
  useDeleteFeedback,
  usePatchFeedback,
  usePostSubmissionFeedback,
  useReviewSubmission,
  useSubmissionBundle,
} from '../hooks/useSupervision';

const OPTIONS: Array<{ value: ReviewDecision; label: string; hint: string }> = [
  { value: 'approved', label: 'Approved', hint: 'The work stands — a tied milestone completes.' },
  { value: 'revision_required', label: 'Revision required', hint: 'The student sends a new version.' },
  { value: 'rejected', label: 'Rejected', hint: 'Ends this line of work.' },
];

const SUBMIT_LABEL: Record<ReviewDecision, string> = {
  approved: 'Record approval',
  revision_required: 'Request revision',
  rejected: 'Reject submission',
};

/** Input statuses §11.6 accepts a decision from. */
const REVIEWABLE = new Set(['submitted', 'under_review', 'revision_required']);

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : 'The decision could not be recorded.';
}

/**
 * §16.3 Submission review / plan 12.4 — download the version, decide,
 * comment. §11.6's decision form sits between the immutable version history
 * (I7) and the append-only decisions (I8); §11.7 discussion stays a separate
 * thread, never merged with a decision (Phase 11's distinction).
 */
export default function SubmissionReview() {
  const { studentId, submissionId } = useParams<{ studentId: string; submissionId: string }>();
  const currentUserId = useAuthStore((state) => state.user?.id ?? '');

  const bundle = useSubmissionBundle(submissionId);
  const review = useReviewSubmission(submissionId ?? '');
  const postFeedback = usePostSubmissionFeedback(submissionId ?? '');
  const editFeedback = usePatchFeedback();
  const removeFeedback = useDeleteFeedback();

  const [decision, setDecision] = useState<ReviewDecision>('approved');
  const [comment, setComment] = useState('');

  if (bundle.isPending) return <LoadingState label="Loading submission…" />;
  if (bundle.isError) {
    return (
      <ErrorState
        message="This submission could not be loaded right now."
        onRetry={() => void bundle.refetch()}
        action={
          <Button asChild variant="outline">
            <Link to={`/supervision/${studentId}/submissions`}>Back to submissions</Link>
          </Button>
        }
      />
    );
  }
  if (!bundle.data) {
    return (
      <EmptyState
        eyebrow="Not found"
        title="No such submission"
        description="It may have been deleted while it was still a draft, or the link is wrong."
        action={
          <Button asChild variant="outline">
            <Link to={`/supervision/${studentId}/submissions`}>Back to submissions</Link>
          </Button>
        }
      />
    );
  }

  const { submission, versions, reviews, feedback } = bundle.data;
  const style = SUBMISSION_STYLE[submission.status];
  const history = [...versions].sort((a, b) => b.versionNumber - a.versionNumber);
  const canDecide = REVIEWABLE.has(submission.status);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    // §11.6 leaves `comment` optional server-side; never fake success.
    try {
      await review.mutateAsync({ decision, comment: comment.trim() || undefined });
      setComment('');
      toast.success(
        decision === 'approved'
          ? 'Recorded as approved — a tied milestone completes with it (§11.6).'
          : decision === 'revision_required'
            ? 'Revision requested — the student has been notified.'
            : 'Submission rejected.',
      );
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <Link to={`/supervision/${studentId}/submissions`} className="hover:text-foreground">
          Submissions
        </Link>
        <span aria-hidden="true">›</span>
        <span className="truncate text-foreground">{submission.title}</span>
      </nav>

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
            {submission.title}
          </h1>
          <Badge variant="outline" className={cn(style.className)}>
            {style.label}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          By {submission.submitter.firstName} {submission.submitter.lastName}
          {submission.submittedAt && ` · submitted ${formatRelative(submission.submittedAt)}`}
          {' · '}
          updated {formatRelative(submission.updatedAt)}
        </p>
        <div>
          <Button asChild size="sm" variant="ghost">
            <Link to={`/supervision/${studentId}/submissions`}>
              <ArrowLeft aria-hidden="true" /> Back
            </Link>
          </Button>
        </div>
      </header>

      {/* Version history (§11.5, I7) — download is §14.5's authenticated stream. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <History className="size-4 text-primary" aria-hidden="true" /> Version history
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {history.length === 0 && (
            <p className="text-sm text-muted-foreground">No versions yet.</p>
          )}
          {history.map((version) => (
            <div key={version.id} className="rounded-xl border bg-surface-alt/50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">v{version.versionNumber}</p>
                <span className="text-xs text-muted-foreground">
                  {formatRelative(version.createdAt)}
                </span>
              </div>
              {version.body ? (
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                  {version.body.slice(0, 400)}
                  {version.body.length > 400 && '…'}
                </p>
              ) : version.originalFilename ? (
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-foreground">{version.originalFilename}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void downloadVersion(version).catch((error: unknown) =>
                        toast.error(
                          error instanceof Error ? error.message : 'Download failed.',
                        ),
                      )
                    }
                  >
                    <Download aria-hidden="true" /> Download
                  </Button>
                </div>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">Empty version.</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* The §11.6 decision form — only while the input statuses allow it. */}
      {canDecide && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Record a decision (§11.6)</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
              <fieldset>
                <legend className="text-sm font-medium text-foreground">Decision</legend>
                <div className="mt-2 flex flex-col gap-2">
                  {OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border bg-surface-alt/40 p-3 transition-colors hover:border-primary/40"
                    >
                      <input
                        type="radio"
                        name="submission-decision"
                        value={option.value}
                        checked={decision === option.value}
                        onChange={() => setDecision(option.value)}
                        className="mt-1 size-4 accent-primary"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-foreground">
                          {option.label}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {option.hint}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="review-comment" className="text-sm font-medium text-foreground">
                  Comment <span className="text-muted-foreground">(optional)</span>
                </label>
                <Textarea
                  id="review-comment"
                  rows={4}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="The student reads whatever you write here…"
                />
              </div>

              <div>
                <Button type="submit" disabled={review.isPending}>
                  {review.isPending ? 'Saving…' : SUBMIT_LABEL[decision]}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Append-only decisions (I8) — reviewer named, never editable. */}
      {reviews.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Decision history (§11.6)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {reviews.map((row) => {
              const chip = DECISION_STYLE[row.decision];
              return (
                <div key={row.id} className="rounded-xl border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={cn(chip.className)}>
                        {chip.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {row.reviewer.firstName} {row.reviewer.lastName}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatRelative(row.createdAt)}
                    </span>
                  </div>
                  {row.comment && (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                      {row.comment}
                    </p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* §11.7 discussion — separate from the decision, always. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <MessageSquare className="size-4 text-primary" aria-hidden="true" /> Discussion
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FeedbackThread
            entries={feedback}
            currentUserId={currentUserId}
            posting={postFeedback.isPending || editFeedback.isPending || removeFeedback.isPending}
            composerLabel="Leave a note or a question…"
            onPost={(body) => postFeedback.mutateAsync(body).then(() => undefined)}
            onEdit={(id, body) =>
              editFeedback.mutateAsync({ feedbackId: id, body }).then(() => undefined)
            }
            onDelete={(id) => removeFeedback.mutateAsync(id).then(() => undefined)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
