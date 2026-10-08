import { useState } from 'react';
import { Download, FileBarChart2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import ErrorState from '@/components/feedback/ErrorState';
import LoadingState from '@/components/feedback/LoadingState';
import { downloadCsv } from '@/lib/csv';
import { useBuildReport, useReportCounts } from '../hooks';
import type { ReportKey } from '../data';

/**
 * §16.3 Reports — departmental summaries (headline counts, live probes) plus
 * five CSV exports built on click via `lib/csv.ts` (plan 13.4: no new
 * dependency). Datasets cap at 500 rows with an honest `note` surfaced in the
 * toast — a report is a document, so the repos are LIVE-ONLY and the screen
 * never renders fixture numbers.
 */

const EXPORTS: { key: ReportKey; title: string; description: string }[] = [
  {
    key: 'projects',
    title: 'Projects',
    description: 'Title, student, status and lifecycle timestamps for every project.',
  },
  {
    key: 'students',
    title: 'Students',
    description: 'Directory rows with program and account state.',
  },
  {
    key: 'faculty',
    title: 'Supervisors',
    description: 'Faculty directory with account state.',
  },
  {
    key: 'proposals',
    title: 'Proposals',
    description: 'Title, author, status and version for every proposal.',
  },
  {
    key: 'assignments',
    title: 'Assignments',
    description: 'Each student with their active supervisor (Flow C state, §11.1).',
  },
];

function StatCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-1 font-display text-3xl font-bold text-foreground">{value}</p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function AdminReports() {
  const counts = useReportCounts();
  const build = useBuildReport();
  const [lastAt, setLastAt] = useState<string | null>(null);

  const exportCsv = (key: ReportKey) => {
    build.mutate(key, {
      onSuccess: (dataset) => {
        downloadCsv(dataset.filename, dataset.headers, dataset.rows);
        const at = new Date().toLocaleTimeString();
        setLastAt(at);
        if (dataset.note) toast.warning(dataset.note);
        toast.success(`${dataset.rows.length} rows exported — ${dataset.filename}`);
      },
      onError: (error) => toast.error(`Export failed: ${error.message}`),
    });
  };

  if (counts.isPending) return <LoadingState label="Loading reports…" />;
  if (counts.isError || !counts.data) {
    return (
      <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
        <ErrorState
          message="Report counts could not be loaded right now."
          onRetry={() => void counts.refetch()}
        />
      </div>
    );
  }

  const c = counts.data;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <span>Admin</span>
        <span aria-hidden="true">›</span>
        <span className="text-foreground">Reports</span>
      </nav>

      <header className="mt-3">
        <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
          Departmental Reports
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          Lifecycle summaries across the department (§4 R13): counts probe the API live
          ({lastAt ? `last refreshed ${lastAt}` : 'never cached'}), exports are built on
          click as client-side CSV (§16.3).
        </p>
      </header>

      <section aria-label="Headline counts" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Students" value={c.students} />
        <StatCard label="Supervisors" value={c.faculty} />
        <StatCard
          label="Projects"
          value={c.projectsTotal}
          sub={`${c.projectsActive} active · ${c.projectsCompleted} completed · ${c.projectsArchived} archived`}
        />
        <StatCard
          label="Proposals"
          value={c.proposalsTotal}
          sub={`${c.proposalsDraft} draft · ${c.proposalsSubmitted} submitted · ${c.proposalsUnderReview} under review · ${c.proposalsRevisionRequired} revision required · ${c.proposalsApproved} approved · ${c.proposalsRejected} rejected`}
        />
      </section>

      <section aria-label="CSV exports" className="mt-8">
        <h2 className="font-display text-lg font-bold text-foreground">CSV exports</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Each export walks the source pages up to 500 rows and says so in a warning when
          the cap trims it.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {EXPORTS.map((item) => {
            const busy = build.isPending && build.variables === item.key;
            return (
              <Card key={item.key}>
                <CardContent className="flex h-full flex-col gap-3 p-5">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <FileBarChart2 className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-foreground">{item.title}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                  <div className="mt-auto pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={build.isPending}
                      aria-label={`Export ${item.title} as CSV`}
                      onClick={() => exportCsv(item.key)}
                    >
                      {busy ? (
                        <Loader2 className="animate-spin" aria-hidden="true" />
                      ) : (
                        <Download aria-hidden="true" />
                      )}
                      {busy ? 'Building…' : 'Download CSV'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
