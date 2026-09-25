import { FileUp, LifeBuoy, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/** Bulk enrollment card → the import wizard (spec §5.2). */
export function BulkEnrollmentCard() {
  const navigate = useNavigate();
  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
          <FileUp className="size-5" aria-hidden="true" />
        </span>
        <h2 className="mt-3 font-display text-lg font-bold text-foreground">Bulk Enrollment</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Provision many accounts at once by uploading a spreadsheet of students and supervisors.
        </p>
        <Button type="button" className="mt-4 w-full" onClick={() => navigate('/users/import')}>
          <Upload aria-hidden="true" />
          Import users
        </Button>
      </CardContent>
    </Card>
  );
}

const GUIDES = [
  'How to invite students',
  'Role permissions explained',
  'Bulk CSV formatting guide',
];

/** Decorative help links — placeholders until real docs exist (spec §5.2). */
export function GuideLinks() {
  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Help</p>
        <h2 className="mt-1 font-display text-lg font-bold text-foreground">Guides</h2>
        <ul className="mt-3 space-y-1">
          {GUIDES.map((guide) => (
            <li key={guide}>
              <button
                type="button"
                onClick={() => toast.info('Guides are not available yet')}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
              >
                <LifeBuoy className="size-4 shrink-0" aria-hidden="true" />
                {guide}
              </button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
