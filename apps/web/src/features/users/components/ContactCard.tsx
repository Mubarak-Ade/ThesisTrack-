import { Building2, Mail, MapPin, Phone, Languages } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import type { UserDetail } from '../data/types';

interface Row {
  label: string;
  value: string;
  icon: typeof Mail;
}

/** Contact Information — live core fields over fixture extras (spec §5.4). */
export default function ContactCard({ detail }: { detail: UserDetail }) {
  const rows: Row[] = [
    { label: 'Email', value: detail.email, icon: Mail },
    {
      label: 'Department',
      value: detail.extras.department ?? detail.department ?? '—',
      icon: Building2,
    },
    { label: 'Phone', value: detail.extras.phone ?? '—', icon: Phone },
    { label: 'Address', value: detail.extras.address ?? '—', icon: MapPin },
    { label: 'Portal language', value: detail.extras.portalLanguage ?? '—', icon: Languages },
  ];

  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Details</p>
        <h2 className="mt-1 font-display text-lg font-bold text-foreground">
          Contact Information
        </h2>

        <dl className="mt-4 space-y-3">
          {rows.map((row) => {
            const Icon = row.icon;
            return (
              <div
                key={row.label}
                className="flex items-start gap-3 rounded-lg border border-border bg-background px-3.5 py-2.5"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    {row.label}
                  </dt>
                  <dd className="break-words text-sm text-foreground">{row.value}</dd>
                </div>
              </div>
            );
          })}
        </dl>
      </CardContent>
    </Card>
  );
}
