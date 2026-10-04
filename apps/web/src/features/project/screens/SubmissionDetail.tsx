import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, History, MessageSquare, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ConfirmDialog from '@/components/feedback/ConfirmDialog';
import EmptyState from '@/components/feedback/EmptyState';
import ErrorState from '@/components/feedback/ErrorState';
import LoadingState from '@/components/feedback/LoadingState';
import { ApiError } from '@/lib/api/http';
import { useAuthStore } from '@/stores/auth';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/utils/time';
import FeedbackThread from '@/components/project/FeedbackThread';
import VersionComposer from '../components/VersionComposer';
import type { SubmissionStatus } from '../data/types';
import { downloadVersion } from '../data/projectRepo';
import {
  useAppendVersion,
  useDeleteFeedback,
  useDeleteSubmission,
  useMyProject,
  usePatchFeedback,
  usePostSubmissionFeedback,
  useSubmission,
  useSubmissionFeedback,
  useSubmissionReviews,
  useSubmissionVersions,
  useSubmitSubmission,
} from '../hooks/useProject';

const STATUS_STYLE: Record<SubmissionStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'border-border bg-surface-alt text-muted-foreground' },
  submitted: { label: 'Submitted', className: 'border-primary/30 bg-primary/10 text-primary' },
  under_review: {
    label: 'Under review',
    className: 'border-primary/30 bg-primary/10 text-primary',
  },
  revision_required: {
    label: 'Revision required',
    className: 'border-warning/40 bg-warning-bg text-warning',
  },
  approved: { label: 'Approved', className: 'border-success/40 bg-success-bg text-success' },
  rejected: { label: 'Rejected', className: 'border-danger/40 bg-danger-bg text-danger' },
};

/**
 * §16.3 submission detail — content, immutable version history (I7), the
 * formal review decisions (§11.6, never merged with §11.7 discussion) and
 * the discussion thread. Student actions follow §5.5: submit while draft,
 * delete while draft, append a version when a revision was requested.
 */
export default function SubmissionDetail() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const navigate = useNavigate();
  const projectId = useMyProject().data?.id;
  const currentUserId = useAuthStore((state) => state.user?.id ?? '');

  const submission = useSubmission(submissionId);
  const versions = useSubmissionVersions(submissionId);
  const reviews = useSubmissionReviews(submissionId);
  const feedback = useSubmissionFeedback(submissionId);

  const doSubmit = useSubmitSubmission(submissionId);
  const doDelete = useDeleteSubmission();
  const doAppend = useAppendVersion(submissionId);
  const postFeedback = usePostSubmissionFeedback(submissionId);
  const editFeedback = usePatchFeedback(projectId);
  const removeFeedback = useDeleteFeedback(projectId);

  const [confirmDelete, setConfirmDelete] = useState(false);

  if (submission.isPending || versions.isPending) {
    return <LoadingState label="Loading submission…" />;
  }
  if (submission.isError) {
    return (
      <ErrorState
        message="This submission could not be loaded."
        onRetry={() => void submission.refetch()}
        action={
          <Button asChild variant="outline">
            <Link to="/project/submissions">Back to submissions</Link>
          </Button>
        }
      />
    );
  }
  if (!submission.data) {
    return (
      <EmptyState
        eyebrow="Not found"
        title="No such submission"
        description="It may have been deleted while it was still a draft, or the link is wrong."
        action={
          <Button asChild>
            <Link to="/project/submissions">Back to submissions</Link>
          </Button>
        }
      />
    );
  }

  const row = submission.data;
  const style = STATUS_STYLE[row.status];
  const history = [...(versions.data ?? [])].sort((a, b) => b.versionNumber - a.versionNumber);

  async function runSubmit(): Promise<void> {
    try {
      await doSubmit.mutateAsync();
      toast.success('Sent to your supervisor.');
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'The submission could not be sent.',
      );
    }
  }

  async function runDelete(): Promise<void> {
    try {
      await doDelete.mutateAsync(row.id);
      toast.success('Draft deleted.');
      navigate('/project/submissions', { replace: true });
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'The draft could not be deleted.',
      );
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <Link to="/project/submissions" className="hover:text-foreground">
          Submissions
        </Link>
        <span aria-hidden="true">›</span>
        <span className="truncate text-foreground">{row.title}</span>
      </nav>

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
            {row.title}
          </h1>
          <Badge variant="outline" className={cn(style.className)}>
            {style.label}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          By {row.submitter.firstName} {row.submitter.lastName}
          {row.submittedAt && ` · submitted ${formatRelative(row.submittedAt)}`}
          {' · '}
          updated {formatRelative(row.updatedAt)}
        </p>
        <div className="flex flex-wrap gap-2">
          {row.status === 'draft' && (
            <>
              <Button size="sm" disabled={doSubmit.isPending} onClick={() => void runSubmit()}>
                <Send aria-hidden="true" /> {doSubmit.isPending ? 'Sending…' : 'Submit now'}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={doDelete.isPending}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 aria-hidden="true" /> Delete draft
              </Button>
            </>
          )}
          <Button asChild size="sm" variant="ghost">
            <Link to="/project/submissions">
              <ArrowLeft aria-hidden="true" /> Back
            </Link>
          </Button>
        </div>
        {row.status === 'draft' && (
          <p className="text-xs text-muted-foreground">
            A draft is yours alone — submitting hands it to your supervisor and locks the content
            until a revision is requested (§5.5).
          </p>
        )}
      </header>

      {row.status === 'revision_required' && (
        <VersionComposer
          busy={doAppend.isPending}
          onAppend={(payload, onProgress) =>
            doAppend.mutateAsync({ ...payload, onProgress }).then(() => undefined)
          }
        />
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <History className="size-4 text-primary" aria-hidden="true" /> Version history
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {versions.isError && (
            <ErrorState
              message="Version history could not be loaded."
              onRetry={() => void versions.refetch()}
            />
          )}
          {!versions.isError && history.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No versions yet — one is created the moment the submission leaves draft.
            </p>
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
                      void downloadVersion(version)
                        .catch((error: unknown) =>
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

      {reviews.data && reviews.data.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Supervisor decisions (§11.6)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {reviews.data.map((review) => (
              <div key={review.id} className="rounded-xl border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      review.decision === 'approved'
                        ? 'border-success/40 bg-success-bg text-success'
                        : review.decision === 'rejected'
                          ? 'border-danger/40 bg-danger-bg text-danger'
                          : 'border-warning/40 bg-warning-bg text-warning',
                    )}
                  >
                    {review.decision.replace(/_/g, ' ')}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatRelative(review.createdAt)}
                  </span>
                </div>
                {review.comment && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                    {review.comment}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <MessageSquare className="size-4 text-primary" aria-hidden="true" /> Discussion
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FeedbackThread
            entries={feedback.data ?? []}
            currentUserId={currentUserId}
            posting={postFeedback.isPending || editFeedback.isPending || removeFeedback.isPending}
            composerLabel="Ask a question or leave a note…"
            onPost={(body) => postFeedback.mutateAsync(body).then(() => undefined)}
            onEdit={(id, body) =>
              editFeedback.mutateAsync({ feedbackId: id, body }).then(() => undefined)
            }
            onDelete={(id) => removeFeedback.mutateAsync(id).then(() => undefined)}
          />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        destructive
        title="Delete this draft?"
        description="The draft and any versions it carries are removed for good. This cannot be undone."
        confirmLabel="Delete draft"
        loading={doDelete.isPending}
        onConfirm={() => {
          setConfirmDelete(false);
          void runDelete();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
