import type { ReactNode } from 'react';
import { AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CalloutVariant = 'info' | 'danger' | 'neutral';

interface CalloutProps {
  variant?: CalloutVariant;
  /** Uppercase micro-title (e.g. "IMPORTANT NOTE", "SECURITY PROTOCOL"). */
  title?: string;
  /** Icon override — screens pass e.g. `<CheckCircle2 className="size-4 text-success" />`. */
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

const boxStyle: Record<CalloutVariant, string> = {
  info: 'bg-success-bg',
  danger: 'bg-danger-bg',
  neutral: 'border border-border bg-surface-alt',
};

const titleStyle: Record<CalloutVariant, string> = {
  info: 'text-foreground',
  danger: 'text-danger',
  neutral: 'text-muted-foreground',
};

function defaultIcon(variant: CalloutVariant) {
  const className = cn(
    'size-4',
    variant === 'danger' ? 'text-danger' : variant === 'info' ? 'text-foreground/70' : 'text-muted-foreground',
  );
  return variant === 'danger' ? (
    <AlertCircle className={className} aria-hidden="true" />
  ) : (
    <Info className={className} aria-hidden="true" />
  );
}

/** Tinted callout box: icon + uppercase title + body (spec §4). */
export default function Callout({ variant = 'info', title, icon, children, className }: CalloutProps) {
  return (
    <div className={cn('flex gap-3 rounded-lg px-4 py-3 text-left', boxStyle[variant], className)}>
      <span className="mt-0.5 shrink-0">{icon ?? defaultIcon(variant)}</span>
      <div className="min-w-0">
        {title && (
          <p className={cn('text-xs font-bold uppercase tracking-wide', titleStyle[variant])}>
            {title}
          </p>
        )}
        <div className={cn('text-sm leading-relaxed text-foreground/90', title && 'mt-1')}>
          {children}
        </div>
      </div>
    </div>
  );
}
