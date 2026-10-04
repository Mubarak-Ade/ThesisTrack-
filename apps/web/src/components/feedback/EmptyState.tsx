import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  /** Decorative glyph in the muted circle; defaults to Inbox. */
  icon?: ReactNode;
  /** Small uppercase label above the title ("Coming soon", "No results"). */
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  /** Primary action slot (button / link) — never required. */
  action?: ReactNode;
  className?: string;
}

/**
 * §16.1 global chrome — the shared *Empty* state: what this screen is for,
 * when there is nothing yet to show. Also powers the router's "coming soon"
 * placeholders for screens that land in a later delivery phase.
 */
export default function EmptyState({
  icon,
  eyebrow,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex max-w-md flex-col items-center justify-center gap-3 text-center',
        className,
      )}
    >
      <span
        className="grid size-12 place-items-center rounded-full bg-surface-alt text-muted-foreground"
        aria-hidden="true"
      >
        {icon ?? <Inbox className="size-5" />}
      </span>
      {eyebrow && (
        <p className="text-xs font-bold uppercase tracking-widest text-primary">{eyebrow}</p>
      )}
      <h2 className="font-display text-xl font-semibold text-foreground">{title}</h2>
      {description && (
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-1 flex justify-center gap-3">{action}</div>}
    </div>
  );
}
