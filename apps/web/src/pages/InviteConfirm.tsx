import { ArrowRight, BadgeCheck, CreditCard, HelpCircle, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import Callout from '@/components/Callout';
import InvitationFlow from '@/components/InvitationFlow';
import StatusLayout from '@/components/StatusLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-alt">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

/** 4.7 — review the invitation payload before setting credentials (4.8). */
function InviteConfirm() {
  const [params] = useSearchParams();
  const token = params.get('token');

  return (
    <InvitationFlow>
      {(invitation) => (
        <StatusLayout
          image="images/graduation-success.jpg"
          imageAlt="A graduate in cap and gown holding a certificate"
          title="Confirm your identity"
          subcopy="We've found an invitation linked to your institutional email. Please verify that the details below are correct."
        >
          <Card>
            <div className="relative rounded-t-lg bg-success-bg p-4">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-background px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-foreground ring-1 ring-border">
                <BadgeCheck className="size-3.5 text-success" aria-hidden="true" /> Identity
                verified
              </span>
              <span className="absolute right-4 top-4 grid size-9 place-items-center rounded-full bg-background ring-1 ring-border">
                <UserRound className="size-4 text-muted-foreground" aria-hidden="true" />
              </span>
              <p className="mt-3 font-display text-xl font-semibold text-foreground">
                {invitation.name}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Institutional credentials found in the University Registry.
              </p>
            </div>

            <CardContent className="divide-y divide-border p-4">
              <DetailRow
                icon={<CreditCard className="size-4 text-muted-foreground" aria-hidden="true" />}
                label="Registration number"
                value={invitation.registrationNumber ?? 'Not on file — contact your department'}
              />
              <DetailRow
                icon={<Mail className="size-4 text-muted-foreground" aria-hidden="true" />}
                label="Academic email"
                value={invitation.email}
              />
              <DetailRow
                icon={<ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" />}
                label="Account role"
                value={invitation.role.charAt(0).toUpperCase() + invitation.role.slice(1)}
              />

              <div className="pt-4">
                <Callout variant="info" uppercase={false} title="Please check before continuing">
                  Ensure these details match your official university ID. If you notice any
                  discrepancies, do not continue — contact your department first.
                </Callout>
              </div>
            </CardContent>
          </Card>

          <Button className="w-full" asChild>
            <Link to={`/invite/activate?token=${encodeURIComponent(token ?? '')}`}>
              Confirm &amp; Continue <ArrowRight aria-hidden="true" />
            </Link>
          </Button>

          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <HelpCircle className="size-3.5" aria-hidden="true" />
            <span className="font-semibold text-foreground">Contact Department</span>
          </p>

          <div className="space-y-2 pt-2">
            <p className="mx-auto inline-flex items-center gap-1.5 rounded-full bg-success-bg px-3 py-1.5 text-xs font-semibold text-primary ring-1 ring-primary/20">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              Institutional Security Protocol Active
            </p>
            <p className="mx-auto max-w-xs text-[11px] leading-relaxed text-muted-foreground">
              ThesisTrack uses your university&apos;s Central Authentication Service (CAS) for
              secure data handling.
            </p>
          </div>
        </StatusLayout>
      )}
    </InvitationFlow>
  );
}

export default InviteConfirm;
