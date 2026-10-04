import { MessageSquare } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ErrorState from '@/components/feedback/ErrorState';
import LoadingState from '@/components/feedback/LoadingState';
import FeedbackThread from '@/components/project/FeedbackThread';
import { useAuthStore } from '@/stores/auth';
import { useStudentContext } from './StudentDetail';
import {
  useDeleteFeedback,
  usePatchFeedback,
  usePostFeedback,
  useProjectFeedback,
} from '../hooks/useSupervision';

/**
 * §16.3 Feedback (supervisor side) / plan 12.5 — the project's §11.7
 * discussion thread: messages, never decisions (§11.6 owns those, and only
 * an author may edit or delete their own row).
 */
export default function StudentFeedback() {
  const { entry } = useStudentContext();
  const projectId = entry.projectId!;
  const currentUserId = useAuthStore((state) => state.user?.id ?? '');

  const feedback = useProjectFeedback(projectId);
  const post = usePostFeedback(projectId);
  const patch = usePatchFeedback();
  const remove = useDeleteFeedback();

  if (feedback.isPending) return <LoadingState label="Loading the discussion…" />;
  if (feedback.isError) {
    return (
      <ErrorState
        message="The discussion could not be loaded right now."
        onRetry={() => void feedback.refetch()}
      />
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <MessageSquare className="size-4 text-primary" aria-hidden="true" /> Feedback &amp;
          discussion
        </CardTitle>
      </CardHeader>
      <CardContent>
        <FeedbackThread
          entries={feedback.data}
          currentUserId={currentUserId}
          posting={post.isPending || patch.isPending || remove.isPending}
          composerLabel="Reply to your student…"
          emptyHint="No messages yet — start the conversation about this project."
          onPost={(body) => post.mutateAsync(body).then(() => undefined)}
          onEdit={(id, body) => patch.mutateAsync({ feedbackId: id, body }).then(() => undefined)}
          onDelete={(id) => remove.mutateAsync(id).then(() => undefined)}
        />
      </CardContent>
    </Card>
  );
}
