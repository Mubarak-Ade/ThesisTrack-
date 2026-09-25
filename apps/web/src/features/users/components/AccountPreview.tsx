import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ROLES } from '../data/constants';

export interface PreviewValues {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  department: string;
  sendInvite: boolean;
}

function initialsOf(firstName: string, lastName: string): string {
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  return initials || '?';
}

/** Right-rail preview — updates live from `form.watch` (spec §5.3). */
export default function AccountPreview({ values }: { values: PreviewValues }) {
  const fullName = `${values.firstName.trim()} ${values.lastName.trim()}`.trim();
  const isRole = (ROLES as readonly string[]).includes(values.role);

  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Live preview</p>
        <h2 className="mt-1 font-display text-lg font-bold text-foreground">Account Preview</h2>

        <div className="mt-4 flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/10 text-base font-bold text-primary">
            {initialsOf(values.firstName.trim(), values.lastName.trim())}
          </span>
          <div className="min-w-0">
            <p className={cn('truncate text-sm font-semibold', fullName ? 'text-foreground' : 'text-muted-foreground italic')}>
              {fullName || 'Not Selected'}
            </p>
            <p className={cn('truncate text-xs', values.email ? 'text-muted-foreground' : 'text-muted-foreground/70 italic')}>
              {values.email || 'TBD'}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {isRole ? (
            <Badge variant="outline" className="uppercase tracking-wide text-primary ring-1 ring-primary/30">
              {values.role}
            </Badge>
          ) : (
            <Badge variant="outline" className="italic text-muted-foreground">Not Selected</Badge>
          )}
          <Badge variant="outline" className={values.department ? 'text-foreground' : 'italic text-muted-foreground'}>
            {values.department || 'TBD'}
          </Badge>
          <Badge variant="outline" className="bg-primary/10 text-primary ring-1 ring-primary/20">
            Awaiting Setup
          </Badge>
        </div>

        <div className="mt-4 space-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
          <p className="flex justify-between gap-3">
            <span>Account status</span>
            <span className="font-semibold text-foreground">INVITED (on creation)</span>
          </p>
          <p className="flex justify-between gap-3">
            <span>Invitation</span>
            <span className="font-semibold text-foreground">
              {values.sendInvite ? 'Confirmation mentions it' : 'Standard confirmation'}
            </span>
          </p>
          <p className="flex justify-between gap-3">
            <span>Password</span>
            <span className="font-semibold text-foreground">Set by user on activation</span>
          </p>
        </div>

        <p className="mt-4 rounded-lg bg-surface-alt px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          The account is provisioned without a password — the invited user sets their own during
          activation.
        </p>
      </CardContent>
    </Card>
  );
}
