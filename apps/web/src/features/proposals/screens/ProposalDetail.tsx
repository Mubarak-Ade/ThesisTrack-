import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock3, Gavel, Lock, PencilLine, Play, Send } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import ConfirmDialog from '@/components/feedback/ConfirmDialog';
import EmptyState from '@/components/feedback/EmptyState';
import ErrorState from '@/components/feedback/ErrorState';
import LoadingState from '@/components/feedback/LoadingState';
import SampleDataBanner from '@/components/feedback/SampleDataBanner';
import { ApiError } from '@/lib/api/http';
import { formatRelative } from '@/lib/utils/time';
import { useAuthStore } from '@/stores/auth';
import AttachmentList from '../components/AttachmentList';
import ProposalReviews from '../components/ProposalReviews';
import ProposalStatusBadge from '../components/ProposalStatusBadge';
import { downloadAttachment } from '../data/proposalsRepo';
import { isProposalEditable, type ReviewDecision } from '../data/types';
import {
  useProposal,
  useRemoveAttachment,
  useReviewProposal,
  useStartReview,
  useSubmitProposal,
} from '../hooks/useProposals';

const DECISIONS: Array<{ value: ReviewDecision; label: string; hint: string }> = [
  { value: 'approved', label: 'Approved', hint: 'Creates the project and locks the proposal.' },
  { value: 'revision_required', label: 'Revision required', hint: 'The student edits and resubmits.' },
  { value: 'rejected', label: 'Rejected', hint: 'Ends this proposal.' },
];

const SUBMIT_LABEL: Record<ReviewDecision, string> = {
  approved: 'Approve',
  revision_required: 'Request revision',
  rejected: 'Reject proposal',
};

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : 'Something went wrong.';
}

/**
 * §16.3 Proposal details — the read view §16.4 describes for reviewers:
 * abstract, the document rendered through its sanitized `body`, the
 * attachment list (download everywhere; remove only for the owning student,
 * and disabled + explained while frozen by I14) and the append-only review
 * history (I8). The editor control itself never renders here.
 */
export default function ProposalDetail() {
  const { proposalId } = useParams<{ proposalId: string }>();
  const user = useAuthStore((s) => s.user);
  const query = useProposal(proposalId);
  const submit = useSubmitProposal(proposalId ?? '');
  const remove = useRemoveAttachment();
  const startReview = useStartReview(proposalId ?? '');
  const review = useReviewProposal(proposalId ?? '');

  const [decision, setDecision] = useState<ReviewDecision>('approved');
  const [comment, setComment] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);

  if (query.isPending && !query.data) {
    return (
      <div className="mx-auto w-full max-w-[900px] px-4 py-6 sm:px-6 sm:py-8">
        <LoadingState label="Loading proposal…" />
      </div>
    );
  }

  if (query.isError && !query.data) {
    return (
      <div className="mx-auto w-full max-w-[900px] px-4 py-6 sm:px-6 sm:py-8">
        <ErrorState
          message={errorMessage(query.error)}
          onRetry={() => void query.refetch()}
          action={
            <Button asChild variant="outline">
              <Link to="/proposals">Back to proposals</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (!query.data) {
    return (
      <div className="mx-auto w-full max-w-[900px] px-4 py-6 sm:px-6 sm:py-8">
        <EmptyState
          eyebrow="Not found"
          title="That proposal doesn’t exist"
          description="It may have been removed, or the link is wrong."
          action={
            <Button asChild variant="outline">
              <Link to="/proposals">Back to proposals</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const { proposal, attachments, reviews, usedFallback } = query.data;
  const isOwner = user?.id === proposal.studentId;
  const editable = isProposalEditable(proposal.status);
  const canRemove = isOwner && editable;
  const isReviewer = (user?.role === 'supervisor' || user?.role === 'administrator') && !isOwner;
  const canDecide =
    isReviewer && (proposal.status === 'submitted' || proposal.status === 'under_review');

  /** §5.4 — one mutation; approval creates the project server-side (§10.4 Rule 3). */
  async function sendDecision(): Promise<void> {
    try {
      await review.mutateAsync({ decision, comment: comment.trim() || undefined });
      setComment('');
      toast.success(
        decision === 'approved'
          ? 'Proposal approved — the project has been created.'
          : decision === 'revision_required'
            ? 'Revision requested — the student has been notified.'
            : 'Proposal rejected.',
      );
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  /** §16.4/§11.3: comment required unless Approved; Approve goes through the dialog. */
  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    if (decision !== 'approved' && !comment.trim()) {
      setCommentError('A comment is required unless you approve.');
      return;
    }
    setCommentError(null);
    if (decision === 'approved') {
      setConfirmApprove(true);
      return;
    }
    void sendDecision();
  }

  async function handleStartReview(): Promise<void> {
    try {
      await startReview.mutateAsync();
      toast.success('Under review — record your decision below.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-6 sm:px-6 sm:py-8">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <Link to="/proposals" className="hover:text-foreground">
          Proposals
        </Link>
        <span aria-hidden="true">›</span>
        <span className="text-foreground truncate">{proposal.title}</span>
      </nav>

      {usedFallback && (
        <div className="mt-4">
          <SampleDataBanner />
        </div>
      )}

      <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
            {proposal.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <ProposalStatusBadge status={proposal.status} />
            <Badge variant="outline">v{proposal.version}</Badge>
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="size-3.5" aria-hidden="true" />
              {proposal.submittedAt
                ? `submitted ${formatRelative(proposal.submittedAt)}`
                : `updated ${formatRelative(proposal.updatedAt)}`}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {proposal.student.firstName} {proposal.student.lastName} · {proposal.student.email}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isOwner && editable && (
            <>
              <Button asChild variant="outline">
                <Link to={`/proposals/${proposal.id}/edit`}>
                  <PencilLine aria-hidden="true" /> Edit
                </Link>
              </Button>
              <Button
                type="button"
                disabled={submit.isPending}
                onClick={() =>
                  submit.mutate(undefined, {
                    onSuccess: () => toast.success('Proposal submitted for review.'),
                    onError: (error) => toast.error(errorMessage(error)),
                  })
                }
              >
                <Send aria-hidden="true" /> Submit for review
              </Button>
            </>
          )}
          <Button asChild variant="ghost">
            <Link to="/proposals">
              <ArrowLeft aria-hidden="true" /> All proposals
            </Link>
          </Button>
        </div>
      </header>

      {!editable && (
        <p className="mt-4 flex items-start gap-2 rounded-lg border bg-surface-alt/60 px-3 py-2 text-xs text-muted-foreground">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Read-only while under review — editing unlocks when a revision is requested (I14).
          </span>
        </p>
      )}

      <div className="mt-6 flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Abstract</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {proposal.abstract}
            </p>
          </CardContent>
        </Card>

        {proposal.body && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Document</CardTitle>
              <CardDescription>
                Rendered from the server-sanitized HTML the editor saved (ADR-14).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Sanitized on write (§11.3); rendered from that string, never re-parsed. */}
              <div
                className="prose prose-sm max-w-none break-words text-foreground [&_a]:text-primary [&_h2]:font-display [&_h3]:font-display"
                dangerouslySetInnerHTML={{ __html: proposal.body }}
              />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Documents</CardTitle>
            <CardDescription>
              Every version’s files — downloads work for everyone with access (§11.3).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AttachmentList
              attachments={attachments}
              editable={canRemove}
              showRemove={isOwner}
              removingId={remove.isPending ? (remove.variables ?? null) : null}
              onDownload={(attachment) =>
                downloadAttachment(attachment).catch((error) => toast.error(errorMessage(error)))
              }
              onRemove={(attachment) =>
                remove.mutate(attachment.id, {
                  onSuccess: () => toast.success('Document removed.'),
                  onError: (error) => toast.error(errorMessage(error)),
                })
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Review history</CardTitle>
            <CardDescription>
              {isOwner ? 'Append-only decisions from your supervisor (I8).' : 'Append-only decisions recorded on this proposal (I8).'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProposalReviews reviews={reviews} />
          </CardContent>
        </Card>

        {canDecide && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Review decision</CardTitle>
              <CardDescription>
                {proposal.status === 'submitted'
                  ? 'Start the review first — the student sees every step of it (§5.4).'
                  : 'Approved creates the project; every other decision needs a comment (§11.3).'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {proposal.status === 'submitted' ? (
                <Button
                  type="button"
                  disabled={startReview.isPending}
                  onClick={() => void handleStartReview()}
                >
                  <Play aria-hidden="true" /> {startReview.isPending ? 'Starting…' : 'Start review'}
                </Button>
              ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <fieldset>
                    <legend className="text-sm font-medium text-foreground">Decision</legend>
                    <div className="mt-2 flex flex-col gap-2">
                      {DECISIONS.map((option) => (
                        <label
                          key={option.value}
                          className="flex cursor-pointer items-start gap-3 rounded-xl border bg-surface-alt/40 p-3 transition-colors hover:border-primary/40"
                        >
                          <input
                            type="radio"
                            name="proposal-decision"
                            value={option.value}
                            checked={decision === option.value}
                            onChange={() => {
                              setDecision(option.value);
                              setCommentError(null);
                            }}
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
                      Comment
                    </label>
                    <Textarea
                      id="review-comment"
                      value={comment}
                      onChange={(event) => {
                        setComment(event.target.value);
                        if (commentError) setCommentError(null);
                      }}
                      placeholder={
                        decision === 'approved'
                          ? 'Optional when you approve…'
                          : 'Required — tell the student what to act on…'
                      }
                      aria-invalid={commentError ? 'true' : undefined}
                      rows={4}
                    />
                    {commentError && (
                      <p role="alert" className="text-xs font-medium text-danger">
                        {commentError}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Required unless you approve (§11.3).
                    </p>
                  </div>

                  <div>
                    <Button type="submit" disabled={review.isPending}>
                      <Gavel aria-hidden="true" />{' '}
                      {review.isPending ? 'Saving…' : SUBMIT_LABEL[decision]}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={confirmApprove}
        title="Approve this proposal?"
        description="This will create the project and lock the proposal."
        confirmLabel="Approve"
        loading={review.isPending}
        onConfirm={() => {
          setConfirmApprove(false);
          void sendDecision();
        }}
        onCancel={() => setConfirmApprove(false)}
      />
    </div>
  );
}
