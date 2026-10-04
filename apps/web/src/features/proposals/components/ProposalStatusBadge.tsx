import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ProposalStatus } from '../data/types';

const STYLE: Record<ProposalStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'border-border bg-surface-alt text-muted-foreground' },
  submitted: { label: 'Submitted', className: 'border-primary/30 bg-primary/10 text-primary' },
  under_review: { label: 'Under review', className: 'border-primary/30 bg-primary/10 text-primary' },
  revision_required: { label: 'Revision required', className: 'border-warning/40 bg-warning-bg text-warning' },
  approved: { label: 'Approved', className: 'border-success/40 bg-success-bg text-success' },
  rejected: { label: 'Rejected', className: 'border-danger/40 bg-danger-bg text-danger' },
};

/** §16.2/§16.4 status chip — one visual language for proposal states. */
export default function ProposalStatusBadge({
  status,
  className,
}: {
  status: ProposalStatus;
  className?: string;
}) {
  const style = STYLE[status];
  return (
    <Badge variant="outline" className={cn(style.className, className)}>
      {style.label}
    </Badge>
  );
}
