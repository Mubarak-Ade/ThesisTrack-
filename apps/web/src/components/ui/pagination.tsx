import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Row-page sizes — shared by the All Users toolbar's `Show:` control (spec §5.2). */
export const PAGE_SIZES = [10, 20, 50];

interface PaginationProps {
  page: number;
  pageCount: number;
  loading?: boolean;
  /**
   * Left-hand honest count text, built by the caller — each list words it
   * differently (spec §5.2 "Showing 1–20 of 65 users", §5.5 "Showing 5 of 8
   * faculty supervisors", §5.6 "Showing 5 of 12 students").
   */
  footer?: string;
  /** `numbered` = windowed page chips; `prevNext` = PREV/NEXT only (faculty). */
  variant?: 'numbered' | 'prevNext';
  onPageChange: (page: number) => void;
}

/** Windowed page list: 1 … p-1 p p+1 … N (spec §5.2 — no phantom pages). */
function pageWindow(page: number, lastPage: number): (number | '…')[] {
  if (lastPage <= 7) return Array.from({ length: lastPage }, (_, i) => i + 1);
  const pages: (number | '…')[] = [1];
  if (page > 3) pages.push('…');
  for (let p = Math.max(2, page - 1); p <= Math.min(lastPage - 1, page + 1); p += 1) pages.push(p);
  if (page < lastPage - 2) pages.push('…');
  pages.push(lastPage);
  return pages;
}

/** Shared list footer + pager (spec §5.2/§5.5/§5.6). Disabled at bounds — no phantom pages. */
export default function Pagination({
  page,
  pageCount,
  loading,
  footer,
  variant = 'numbered',
  onPageChange,
}: PaginationProps) {
  const lastPage = Math.max(1, pageCount);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {footer && <p className="text-sm text-muted-foreground">{footer}</p>}

      <nav aria-label="Pagination" className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1 || loading}
          onClick={() => onPageChange(page - 1)}
        >
          {variant === 'numbered' && <ChevronLeft aria-hidden="true" />}
          {variant === 'numbered' ? 'Prev' : 'PREV'}
        </Button>

        {variant === 'numbered' &&
          pageWindow(page, lastPage).map((entry, index) =>
            entry === '…' ? (
              <span
                key={`gap-${index}`}
                className="px-1.5 text-sm text-muted-foreground"
                aria-hidden="true"
              >
                …
              </span>
            ) : (
              <button
                key={entry}
                type="button"
                aria-current={entry === page ? 'page' : undefined}
                aria-label={`Page ${entry}`}
                disabled={loading}
                onClick={() => onPageChange(entry)}
                className={cn(
                  'grid h-8 min-w-8 place-items-center rounded-md px-2 text-sm font-medium transition-colors',
                  entry === page
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {entry}
              </button>
            ),
          )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= lastPage || loading}
          onClick={() => onPageChange(page + 1)}
        >
          {variant === 'numbered' ? 'Next' : 'NEXT'}
          {variant === 'numbered' && <ChevronRight aria-hidden="true" />}
        </Button>
      </nav>
    </div>
  );
}
