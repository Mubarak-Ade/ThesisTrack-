import { useState, type FormEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import ConfirmDialog from '@/components/feedback/ConfirmDialog';
import EmptyState from '@/components/feedback/EmptyState';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/utils/time';

/** §11.7 discussion row — never a decision (that is §11.6's review card). */
export interface FeedbackEntry {
  id: string;
  projectId: string;
  submissionId: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: { id: string; firstName: string; lastName: string; email: string };
}

interface FeedbackThreadProps {
  entries: FeedbackEntry[];
  currentUserId: string;
  /** POST (§11.7) — parent mutation, already wired to invalidation. */
  onPost: (body: string) => Promise<void>;
  posting: boolean;
  /** Author-only edit/delete (§11.7) — omitted where the API route doesn't apply. */
  onEdit?: (id: string, body: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  emptyHint?: string;
  composerLabel?: string;
}

/**
 * §11.7 discussion thread — messages, *never decisions* (that distinction
 * is §11.6's review card). Authors may edit or delete their own rows; the
 * destructive path goes through ConfirmDialog (`destructive` flag), other
 * people's messages are read-only (§4.8/§4.9).
 */
export default function FeedbackThread({
  entries,
  currentUserId,
  onPost,
  posting,
  onEdit,
  onDelete,
  emptyHint = 'No messages yet — start the conversation.',
  composerLabel = 'Type a message…',
}: FeedbackThreadProps) {
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setError(null);
    try {
      await onPost(body);
      setDraft('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The message could not be posted.');
    }
  }

  async function saveEdit(): Promise<void> {
    if (!editingId || !onEdit) return;
    const body = editingBody.trim();
    if (!body) return;
    try {
      await onEdit(editingId, body);
      setEditingId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The message could not be updated.');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {entries.length === 0 ? (
        <EmptyState title="No messages yet" description={emptyHint} className="py-6" />
      ) : (
        <ol className="flex flex-col gap-3">
          {entries.map((entry) => {
            const mine = entry.author.id === currentUserId;
            return (
              <li
                key={entry.id}
                className={cn(
                  'rounded-xl border bg-card p-3',
                  mine && 'border-primary/25 bg-primary/5',
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    {entry.author.firstName} {entry.author.lastName}
                    {mine && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">you</span>
                    )}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {formatRelative(entry.createdAt)}
                    {entry.updatedAt !== entry.createdAt && ' · edited'}
                  </span>
                </div>

                {editingId === entry.id ? (
                  <div className="mt-2 flex flex-col gap-2">
                    <Textarea
                      value={editingBody}
                      rows={3}
                      aria-label="Edit message"
                      onChange={(event) => setEditingBody(event.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" disabled={posting} onClick={() => void saveEdit()}>
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{entry.body}</p>
                )}

                {mine && editingId !== entry.id && (onEdit || onDelete) && (
                  <div className="mt-2 flex gap-3">
                    {onEdit && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setEditingId(entry.id);
                          setEditingBody(entry.body);
                        }}
                      >
                        <Pencil className="size-3.5" aria-hidden="true" /> Edit
                      </button>
                    )}
                    {onDelete && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs font-medium text-danger hover:underline"
                        onClick={() => setConfirmId(entry.id)}
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" /> Delete
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <form className="flex flex-col gap-2" onSubmit={(event) => void submit(event)} noValidate>
        <label htmlFor="feedback-composer" className="sr-only">
          {composerLabel}
        </label>
        <Textarea
          id="feedback-composer"
          value={draft}
          rows={3}
          placeholder={composerLabel}
          onChange={(event) => setDraft(event.target.value)}
        />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={posting || draft.trim().length === 0}>
            {posting ? 'Posting…' : 'Post message'}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmId !== null}
        destructive
        title="Delete this message?"
        description="The message is removed from the thread for everyone. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => {
          const id = confirmId;
          setConfirmId(null);
          if (id && onDelete) void onDelete(id);
        }}
        onCancel={() => setConfirmId(null)}
      />
    </div>
  );
}
