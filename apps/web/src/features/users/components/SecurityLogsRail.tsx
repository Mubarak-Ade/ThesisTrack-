import { Card, CardContent } from '@/components/ui/card';

/**
 * Recent Security Logs card — layout per mockup parity §5.2, content is an
 * honest gap: no security-audit endpoint exists (engineering spec §19.2
 * rejected the AuditEvent table, so auth events are out of MVP scope).
 * The fixture rows are gone; this goes live only if that decision changes.
 */
export default function SecurityLogsRail() {
  return (
    <Card className="h-full">
      <CardContent className="p-5 sm:p-6">
        <div>
          <h2 className="font-display text-lg font-bold text-foreground">Recent Security Logs</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Administrative audit trail for user actions
          </p>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          No security-audit endpoint exists — sign-in, reset and role-change events are
          out of MVP scope (spec §19.2 rejects the <code>AuditEvent</code> table).
        </p>
      </CardContent>
    </Card>
  );
}
