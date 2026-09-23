import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

interface FormMessageProps {
  variant?: 'error' | 'success';
  children: ReactNode;
  className?: string;
}

/** Inline mutation-error/success banner (`role="alert"` for screen readers). */
export default function FormMessage({ variant = 'error', children, className }: FormMessageProps) {
  return (
    <Alert variant={variant === 'error' ? 'destructive' : 'info'} className={cn(className)}>
      {variant === 'error' ? (
        <AlertCircle aria-hidden="true" />
      ) : (
        <CheckCircle2 aria-hidden="true" />
      )}
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
