import { CalendarDays, Languages, Mail, MapPin, MessageSquare, Phone } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import type { UserDetail } from '../data/types';

interface Row {
  label: string;
  value: string;
  icon: typeof Mail;
}

/** Live `createdAt` → "Sep 12, 2023"; missing/invalid → em-dash (spec §5.4). */
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Contact Information — live core fields (email, member-since); phone /
 * address / language have no endpoint and always render honest em-dashes
 * (mockup parity §5.4 `—` fallbacks).
 */
export default function ContactCard({ detail }: { detail: UserDetail }) {
  const rows: Row[] = [
    { label: 'Email', value: detail.email, icon: Mail },
    { label: 'Phone', value: detail.extras.phone ?? '—', icon: Phone },
    { label: 'Office/Address', value: detail.extras.address ?? '—', icon: MapPin },
    { label: 'Portal Language', value: detail.extras.portalLanguage ?? '—', icon: Languages },
    // Live field — always from the API (mockup parity §5.4).
    { label: 'Member Since', value: formatDate(detail.createdAt), icon: CalendarDays },
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

        <Button
          type="button"
          variant="outline"
          className="mt-4 w-full"
          onClick={() => toast.info('Direct messages are not available yet')}
        >
          <MessageSquare aria-hidden="true" />
          Send Direct Message
        </Button>
      </CardContent>
    </Card>
  );
}
