import { useAuthStore } from '@/stores/auth';
import ErrorState from '@/components/feedback/ErrorState';
import LoadingState from '@/components/feedback/LoadingState';
import FeedbackThread from '@/components/project/FeedbackThread';
import {
  useDeleteFeedback,
  useMyProject,
  usePatchFeedback,
  usePostFeedback,
  useProjectFeedback,
} from '../hooks/useProject';

/**
 * §16.3 Feedback — the project-level §11.7 discussion: messages between the
 * student and supervisor, explicitly *not* a decision (§11.6 owns those).
 * Authors edit/delete their own rows; everyone reads the rest (§4.8/§4.9).
 */
export default function ProjectFeedback() {
  const currentUserId = useAuthStore((state) => state.user?.id ?? '');
  const projectId = useMyProject().data?.id;
  const feedback = useProjectFeedback(projectId);
  const post = usePostFeedback(projectId);
  const edit = usePatchFeedback(projectId);
  const remove = useDeleteFeedback(projectId);

  if (feedback.isPending) return <LoadingState label="Loading discussion…" />;
  if (feedback.isError) {
    return (
      <ErrorState
        message="The discussion could not be loaded."
        onRetry={() => void feedback.refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        A running conversation about this project — feedback messages are guidance, not
        approvals; formal decisions live on the submission itself (§11.6 vs §11.7).
      </p>
      <FeedbackThread
        entries={feedback.data ?? []}
        currentUserId={currentUserId}
        posting={post.isPending || edit.isPending || remove.isPending}
        composerLabel="Write to your supervisor…"
        emptyHint="No messages yet — say hello or ask the first question."
        onPost={(body) => post.mutateAsync(body).then(() => undefined)}
        onEdit={(id, body) => edit.mutateAsync({ feedbackId: id, body }).then(() => undefined)}
        onDelete={(id) => remove.mutateAsync(id).then(() => undefined)}
      />
    </div>
  );
}
