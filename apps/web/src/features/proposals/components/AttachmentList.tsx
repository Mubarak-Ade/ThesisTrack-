import { useState } from 'react';
import { Download, FileText, Lock, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import ConfirmDialog from '@/components/feedback/ConfirmDialog';
import { formatRelative } from '@/lib/utils/time';
import type { ProposalAttachment } from '../data/types';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface AttachmentListProps {
  attachments: ProposalAttachment[];
  /** Parent status is `draft` | `revision_required` (§11.3 / I14). */
  editable: boolean;
  /**
   * Non-owners (supervisor/admin) never had a remove affordance — hide it
   * for them; the owning student always sees it, disabled + explained (I14).
   */
  showRemove?: boolean;
  onDownload: (attachment: ProposalAttachment) => void;
  onRemove: (attachment: ProposalAttachment) => void;
  removingId?: string | null;
}

/**
 * §11.3 attachment rows. Remove is **disabled and explained** while the
 * proposal is no longer `draft`/`revision_required` (plan 11.2 / I14) — the
 * button stays visible so students see *why* a submitted file can't be
 * swapped, instead of a control that silently disappears. Removal in an
 * editable state confirms first (§16.1 destructive action).
 */
export default function AttachmentList({
  attachments,
  editable,
  showRemove = true,
  onDownload,
  onRemove,
  removingId = null,
}: AttachmentListProps) {
  const [pending, setPending] = useState<ProposalAttachment | null>(null);

  if (attachments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No documents attached yet — add a PDF or Word file below.
      </p>
    );
  }

  return (
    <div>
      <ul className="flex flex-col gap-2">
        {attachments.map((attachment) => (
          <li
            key={attachment.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-2.5"
          >
            <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {attachment.originalFilename}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatBytes(attachment.sizeBytes)} · version {attachment.proposalVersion} ·{' '}
                {formatRelative(attachment.createdAt)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onDownload(attachment)}
                aria-label={`Download ${attachment.originalFilename}`}
              >
                <Download aria-hidden="true" /> Download
              </Button>
              {showRemove && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!editable || removingId === attachment.id}
                  title={
                    editable
                      ? 'Remove this document'
                      : 'Frozen while the proposal is submitted — unlocks after a revision request'
                  }
                  aria-label={`Remove ${attachment.originalFilename}`}
                  onClick={() => setPending(attachment)}
                >
                  <Trash2 aria-hidden="true" /> Remove
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {!editable && showRemove && (
        <p className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Documents are frozen while your proposal is under review — the set your supervisor
            reviewed can’t be changed (I14). It unlocks automatically when a revision is requested.
          </span>
        </p>
      )}

      <ConfirmDialog
        open={pending !== null}
        title="Remove this document?"
        description={
          pending
            ? `“${pending.originalFilename}” will be deleted from this proposal. You can upload it again while the proposal is editable.`
            : ''
        }
        confirmLabel="Remove document"
        destructive
        loading={removingId !== null}
        onConfirm={() => {
          if (pending) onRemove(pending);
          setPending(null);
        }}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
