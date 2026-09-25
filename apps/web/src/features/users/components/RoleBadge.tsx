import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { DisplayRole } from '../data/types';

const ROLE_STYLES: Record<DisplayRole, string> = {
  student: 'border-primary/20 bg-primary/10 text-primary',
  supervisor: 'border-success/25 bg-success-bg text-success',
  administrator: 'border-transparent bg-secondary text-secondary-foreground',
  // Display-only fixture label — the API can never produce it (spec §4).
  coordinator: 'border-border bg-background text-foreground',
};

/** Uppercase role pill — renders any string it receives (spec §4). */
export default function RoleBadge({ role, className }: { role: DisplayRole; className?: string }) {
  return (
    <Badge variant="outline" className={cn('uppercase tracking-wide', ROLE_STYLES[role], className)}>
      {role}
    </Badge>
  );
}
