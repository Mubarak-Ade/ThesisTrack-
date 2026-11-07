import { ArrowUpRight } from 'lucide-react';

import { cn } from '@/lib/utils';

export type SimilarProjectStatus = 'active' | 'completed' | 'archived';

/**
 * Structural row contract for the shared list. Defined here (not imported
 * from a feature) because `components/` is a shared layer; every feature row
 * that carries these fields is assignable.
 */
export interface SimilarProjectRow {
  id: string;
  title: string;
  status: SimilarProjectStatus;
  session: string | null;
  student: { firstName: string; lastName: string };
  department: { name: string } | null;
  excerpt: string | null;
  score: number | null;
}

const STATUS_BADGE: Record<SimilarProjectStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'border-primary/20 bg-primary/10 text-primary' },
  completed: { label: 'Completed', className: 'border-transparent bg-success-bg text-success' },
  archived: { label: 'Archived', className: 'bg-muted text-muted-foreground' },
};

export interface SimilarProjectsListProps {
  items: SimilarProjectRow[];
  /** Makes each row a button (the panel swaps to it); omit for a static list. */
  onSelect?: (projectId: string) => void;
  emptyMessage?: string;
  label?: string;
}

/**
 * Shared similar-row rendering (ADR-18) — used by the library detail panel and
 * the proposal review card so both surfaces show exactly the same projection.
 * Excerpts are plain text: React escapes them, and nothing is parsed as HTML.
 */
export default function SimilarProjectsList({
  items,
  onSelect,
  emptyMessage = 'No similar projects found in the library.',
  label = 'Similar projects',
}: SimilarProjectsListProps) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <ul aria-label={label} className="flex flex-col gap-2">
      {items.map((row) => {
        const badge = STATUS_BADGE[row.status];
        const body = (
          <>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="min-w-0 font-semibold text-foreground">{row.title}</p>
              <span
                className={cn(
                  'inline-flex shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                  badge.className,
                )}
              >
                {badge.label}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {row.student.firstName} {row.student.lastName}
              {row.department ? ` · ${row.department.name}` : ''}
              {row.session ? ` · ${row.session}` : ''}
              {row.score !== null ? ` · ${Math.round(row.score * 100)}% match` : ''}
            </p>
            {row.excerpt && (
              <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                {row.excerpt}
              </p>
            )}
          </>
        );

        return (
          <li key={row.id}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(row.id)}
                className="group flex w-full items-start justify-between gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0">{body}</span>
                <ArrowUpRight
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground group-hover:text-foreground"
                />
              </button>
            ) : (
              <div className="rounded-lg border border-border bg-card p-3">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
