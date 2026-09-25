import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';

const PAGE_SIZES = [10, 20, 50];

const SELECT_CLASS =
  'h-9 rounded-md border border-input bg-white px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1';

interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
}

/** API-driven paging (spec §5.2): total comes from the list envelope. */
export default function Pagination({
  page,
  limit,
  total,
  loading,
  onPageChange,
  onLimitChange,
}: PaginationProps) {
  const lastPage = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>
          Showing {from}–{to} of {total}
        </span>
        <label className="flex items-center gap-1.5">
          <span className="text-xs">per page</span>
          <select
            aria-label="Rows per page"
            value={limit}
            onChange={(event) => onLimitChange(Number(event.target.value))}
            className={SELECT_CLASS}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1 || loading}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft aria-hidden="true" />
          Prev
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {page} of {lastPage}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= lastPage || loading}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
