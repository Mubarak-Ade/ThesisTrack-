import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * §16.1 *Destructive action* tone — the confirm button goes red and the
   * safe choice keeps focus. Without it the dialog is the plain
   * §16.1 *Confirmation* state.
   */
  destructive?: boolean;
  /** Disables confirm (e.g. while a mutation is in flight). */
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * §16.1 global chrome — shared *Confirmation* / *Destructive action* dialog.
 * Keyboard-reachable per §16.7: focus starts on the safe side, Escape and a
 * backdrop click cancel, and the panel is a labelled `aria-modal` dialog.
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus lands on the safe choice when the dialog opens (destructive
  // confirmations must not be one stray Enter away).
  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  // Escape cancels — the listener rides the open state so a stale callback
  // can never swallow a keypress after close.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    // mousedown (not click) on the backdrop cancels: a text-selection drag
    // that ends outside the panel must not dismiss the dialog.
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-2xl"
      >
        <h2 className="font-display text-xl font-semibold text-foreground" id={titleId}>
          {title}
        </h2>
        {description && (
          <div
            className="mt-2 text-sm leading-relaxed text-muted-foreground"
            id={descriptionId}
          >
            {description}
          </div>
        )}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button ref={cancelRef} type="button" variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? 'destructive' : 'default'}
            disabled={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** §16.1 *Destructive action* — ConfirmDialog pre-set to the red tone. */
export function DestructiveConfirmDialog(props: Omit<ConfirmDialogProps, 'destructive'>) {
  return <ConfirmDialog {...props} destructive />;
}
