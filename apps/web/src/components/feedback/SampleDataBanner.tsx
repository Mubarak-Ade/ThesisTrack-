import { AlertTriangle } from 'lucide-react';

/**
 * "Showing sample data" notice while a read is in fixture-fallback (§10.4:
 * reads may fall back to fixtures *with a visible banner*; writes never do).
 * Lives with the shared feedback chrome because every feature's repository
 * can end up behind it — it is not the user-management screen's own widget.
 */
export default function SampleDataBanner() {
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm text-foreground"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <p>
        <strong className="font-semibold">Showing sample data.</strong>{' '}
        <span className="text-muted-foreground">
          Live data is temporarily unreachable — figures below are illustrative.
        </span>
      </p>
    </div>
  );
}
