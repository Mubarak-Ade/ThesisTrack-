import { AlertTriangle } from 'lucide-react';

/** "Showing sample data" notice while a read is in mock-fallback (spec Rule 3). */
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
          The live directory is temporarily unreachable — figures below are illustrative.
        </span>
      </p>
    </div>
  );
}
