import { Info, Lock, Save } from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
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
}

/**
 * Right-rail preview — sage banner, large silhouette, live pills and rows;
 * updates from `form.watch` (spec §5.3).
 */
export default function AccountPreview({ values }: { values: PreviewValues }) {
  const fullName = `${values.firstName.trim()} ${values.lastName.trim()}`.trim();
  const isRole = (ROLES as readonly string[]).includes(values.role);

  return (
    <Card className="overflow-hidden">
      {/* Solid sage banner block (spec §5.3). */}
      <div className="h-14 bg-primary/20 sm:h-16" aria-hidden="true" />

      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-col items-center text-center">
          <Avatar size="xl" className="-mt-11 ring-4 ring-white shadow-sm" />
          <h2 className="mt-3 font-display text-lg font-bold text-foreground">Account Preview</h2>
          <p
            className={cn(
              'mt-0.5 text-sm',
              fullName ? 'text-foreground' : 'text-muted-foreground italic',
            )}
          >
            {fullName || 'Not Selected'}
          </p>
          <p
            className={cn(
              'text-xs',
              values.email ? 'text-muted-foreground' : 'text-muted-foreground/70 italic',
            )}
          >
            {values.email || 'TBD'}
          </p>

          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {isRole ? (
              <Badge variant="outline" className="uppercase tracking-wide text-primary ring-1 ring-primary/30">
                {values.role}
              </Badge>
            ) : (
              <Badge variant="outline" className="uppercase tracking-wide text-muted-foreground">
                Unassigned Role
              </Badge>
            )}
            <Badge
              variant="outline"
              className="border-amber-300 bg-amber-50 text-amber-700"
            >
              Pending Invite
            </Badge>
          </div>
        </div>

        <dl className="mt-4 space-y-2 border-t border-border pt-4 text-xs">
          <div className="flex items-center justify-between gap-3">
            <dt className="font-semibold uppercase tracking-wider text-muted-foreground">
              Department
            </dt>
            <dd className={values.department ? 'text-foreground' : 'text-muted-foreground italic'}>
              {values.department || 'Not Selected'}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="font-semibold uppercase tracking-wider text-muted-foreground">
              Enrollment ID
            </dt>
            <dd className="text-muted-foreground italic">TBD</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="font-semibold uppercase tracking-wider text-muted-foreground">Status</dt>
            <dd className="inline-flex items-center gap-2 text-foreground">
              <span className="size-2 rounded-full bg-amber-500" aria-hidden="true" />
              Awaiting Setup
            </dd>
          </div>
        </dl>

        <p className="mt-3 flex items-center gap-1.5 text-xs italic text-muted-foreground">
          <Info className="size-3.5 shrink-0" aria-hidden="true" />
          Changes reflect in real-time
        </p>

        {/* Green Administrative Tip callout (spec §5.3). */}
        <div className="mt-4 rounded-lg border border-success/30 bg-success-bg p-3.5 text-left">
          <p className="text-sm font-bold text-success">Administrative Tip</p>
          <p className="mt-1 text-xs leading-relaxed text-foreground/80">
            Ensure the user&rsquo;s role matches their official university contract. Assigning a
            Supervisor role gives them power to grade and review student theses.
          </p>
        </div>

        <div className="mt-4 border-t border-border pt-4 text-left">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Creation Log
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Save className="size-3.5" aria-hidden="true" />
              Auto-save enabled
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Lock className="size-3.5" aria-hidden="true" />
              SSL Encrypted Transfer
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
