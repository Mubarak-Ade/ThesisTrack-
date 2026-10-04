import { useRef, useState, type DragEvent } from 'react';
import { FileUp, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * §11.3 drag-or-click upload (PDF/Word — §14.4's gate is the API's; the
 * picker's `accept` is a hint, not the rule). Upload progress (task 11.4)
 * arrives as 0–100 and renders as a determinate bar; errors are the caller's
 * (writes never fake success, §10.4).
 */

export const PROPOSAL_ACCEPT = '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

interface AttachmentDropzoneProps {
  onFile: (file: File) => void;
  disabled?: boolean;
  /** 0–100 while an upload is in flight, null otherwise. */
  progress?: number | null;
  error?: string | null;
  /** Accepted extensions/MIME hint for the picker (§14.4 gate is the API's). */
  accept?: string;
  /** Helper line under the prompt — defaults to the proposal's wording. */
  hint?: string;
}

export default function AttachmentDropzone({
  onFile,
  disabled = false,
  progress = null,
  error = null,
  accept = PROPOSAL_ACCEPT,
  hint = 'PDF or Word documents (§14.4 limits apply)',
}: AttachmentDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const busy = progress !== null;

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setDragging(false);
    if (disabled || busy) return;
    const file = event.dataTransfer.files?.[0];
    if (file) onFile(file);
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Upload a document"
        aria-disabled={disabled || undefined}
        onClick={() => !disabled && !busy && inputRef.current?.click()}
        onKeyDown={(event) => {
          if ((event.key === 'Enter' || event.key === ' ') && !disabled && !busy) {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled && !busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          dragging ? 'border-primary bg-primary/5' : 'border-border bg-surface-alt/60',
          (disabled || busy) && 'cursor-not-allowed opacity-60',
        )}
      >
        {busy ? (
          <Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" />
        ) : (
          <FileUp className="size-5 text-muted-foreground" aria-hidden="true" />
        )}
        <p className="text-sm text-foreground">
          {busy ? `Uploading… ${progress}%` : 'Drag a file here, or click to browse'}
        </p>
        <p className="text-xs text-muted-foreground">{hint}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-1"
          disabled={disabled || busy}
          onClick={(event) => {
            event.stopPropagation();
            inputRef.current?.click();
          }}
        >
          Choose file
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file && !disabled && !busy) onFile(file);
            event.target.value = ''; // same file twice must re-trigger
          }}
        />
      </div>
      {busy && (
        <div
          role="progressbar"
          aria-label="Upload progress"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary"
        >
          <div
            className="h-full bg-primary transition-all duration-200"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
