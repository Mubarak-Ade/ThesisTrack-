import { Wrench } from 'lucide-react';
import EmptyState from './EmptyState';

interface PendingScreenProps {
  title: string;
  description?: string;
}

/**
 * Placeholder for a routed screen whose build step lands in a later phase.
 * User-facing copy only — which phase slot it fills is plan bookkeeping, not
 * something a department member should read.
 */
export default function PendingScreen({ title, description }: PendingScreenProps) {
  return (
    <div className="grid min-h-[60vh] place-items-center p-6">
      <EmptyState
        icon={<Wrench className="size-5" />}
        eyebrow="Coming soon"
        title={title}
        description={description}
      />
    </div>
  );
}
