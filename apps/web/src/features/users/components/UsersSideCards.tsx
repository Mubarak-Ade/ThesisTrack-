import { FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const GUIDES = ['User Role Matrix', 'Permission Protocols'];

/** Bulk Enrollment card + Administrative Guides (spec §5.2). */
export function BulkEnrollmentCard() {
  const navigate = useNavigate();
  return (
    <Card className="h-full">
      <CardContent className="p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold text-foreground">Bulk Enrollment</h2>
        <p className="mt-1 text-sm text-muted-foreground">Institutional onboarding tools</p>

        {/* Dashed import box → the frozen import wizard (spec §5.2). */}
        <div className="mt-4 rounded-xl border-2 border-dashed border-border bg-surface-alt/50 px-4 py-6 text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-full bg-primary/10 text-primary">
            <FileText className="size-5" aria-hidden="true" />
          </span>
          <p className="mt-3 text-sm font-medium text-foreground">Import Users via CSV</p>
          <Button type="button" size="sm" className="mt-3" onClick={() => navigate('/users/import')}>
            SELECT FILE
          </Button>
        </div>

        <div className="mt-5 border-t border-border pt-4">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Administrative Guides
          </p>
          <ul className="mt-2">
            {GUIDES.map((guide) => (
              <li key={guide}>
                <button
                  type="button"
                  onClick={() => toast.info(`${guide} is not available yet`)}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-primary"
                >
                  {guide}
                  <span aria-hidden="true" className="text-muted-foreground">›</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
