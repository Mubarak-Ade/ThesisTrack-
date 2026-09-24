import { CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  evaluatePasswordStrength,
  type PasswordStrengthLabel,
  type PasswordVariant,
} from '@/lib/validation/password-rules';

interface PasswordStrengthMeterProps {
  password: string;
  variant: PasswordVariant;
  /** Required for the activate variant's "Passwords match" rule. */
  confirmation?: string;
}

const badgeVariant: Record<PasswordStrengthLabel, 'outline' | 'danger' | 'secondary' | 'success'> = {
  'Not set': 'outline',
  Weak: 'danger',
  Fair: 'secondary',
  Strong: 'success',
};

const barColor: Record<PasswordStrengthLabel, string> = {
  'Not set': '[&>div]:bg-muted-foreground/30',
  Weak: '[&>div]:bg-danger',
  Fair: '[&>div]:bg-primary/70',
  Strong: '[&>div]:bg-primary',
};

/** Header row + progress bar + two-column rule checklist (mockup layout). */
export default function PasswordStrengthMeter({
  password,
  variant,
  confirmation,
}: PasswordStrengthMeterProps) {
  const { rules, score, label } = evaluatePasswordStrength(password, variant, confirmation);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
        <span className="text-sm font-medium text-foreground">Password Strength</span>
        <Badge variant={badgeVariant[label]} className="ml-auto">
          {label}
        </Badge>
      </div>

      <Progress value={Math.round(score * 100)} className={cn('mt-3', barColor[label])} />

      <ul className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {rules.map((rule) => (
          <li key={rule.label} className="flex items-center gap-2 text-sm">
            {rule.passed ? (
              <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
            ) : (
              <XCircle className="size-4 shrink-0 text-muted-foreground/50" aria-hidden="true" />
            )}
            <span className={rule.passed ? 'text-foreground' : 'text-muted-foreground'}>
              {rule.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
