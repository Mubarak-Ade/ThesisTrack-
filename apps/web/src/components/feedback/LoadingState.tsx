import { cn } from '@/lib/utils';

interface LoadingStateProps {
  /** Visible caption under the spinner — announced via role="status". */
  label?: string;
  className?: string;
}

/**
 * §16.1 global chrome — the shared *Loading* state. The same ring spinner
 * RequireAuth uses while the boot refresh is in flight, but content-sized so
 * screens can drop it into a panel instead of a full page.
 */
export default function LoadingState({ label = 'Loading…', className }: LoadingStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-3', className)}
      role="status"
      aria-live="polite"
    >
      <span
        className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
        aria-hidden="true"
      />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}
