import type { ReactNode } from 'react';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  title?: string;
  /** What actually failed, in the user's terms — never a stack trace. */
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  /** Extra escape hatch (link, secondary button) beside the retry. */
  action?: ReactNode;
  className?: string;
}

/**
 * §16.1 global chrome — the shared *Error* state. Announced as an alert so
 * assistive tech hears the failure without hunting for it; the retry is the
 * default recovery, with `action` for alternatives (ErrorBoundary's home link).
 */
export default function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
  action,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        'flex max-w-md flex-col items-center justify-center gap-3 text-center',
        className,
      )}
      role="alert"
    >
      <span
        className="grid size-12 place-items-center rounded-full bg-danger-bg text-danger"
        aria-hidden="true"
      >
        <TriangleAlert className="size-5" />
      </span>
      <h2 className="font-display text-xl font-semibold text-foreground">{title}</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">{message}</p>
      {(onRetry || action) && (
        <div className="mt-1 flex flex-col items-center gap-3 sm:flex-row">
          {onRetry && (
            <Button type="button" variant="outline" onClick={onRetry}>
              <RotateCcw aria-hidden="true" /> {retryLabel}
            </Button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}
