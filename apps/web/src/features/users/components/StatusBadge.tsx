import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { UserStatus } from '../data/types';

const STATUS_STYLES: Record<UserStatus, { label: string; className: string }> = {
  ACTIVE: { label: 'Active', className: 'border-transparent bg-success-bg text-success' },
  INVITED: { label: 'Invited', className: 'border-primary/20 bg-primary/10 text-primary' },
  INACTIVE: { label: 'Inactive', className: 'border-transparent bg-danger-bg text-danger' },
};

export default function StatusBadge({
  status,
  className,
}: {
  status: UserStatus;
  className?: string;
}) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.INVITED;
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap', style.className, className)}>
      {style.label}
    </Badge>
  );
}
