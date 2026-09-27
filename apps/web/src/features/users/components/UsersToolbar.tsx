import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Role } from '../data/types';
import { PAGE_SIZES } from '@/components/ui/pagination';

const ROLE_OPTIONS: { value: Role | ''; label: string }[] = [
  { value: '', label: 'All roles' },
  { value: 'student', label: 'Student' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'administrator', label: 'Administrator' },
];

const STATUS_OPTIONS: { value: '' | 'true' | 'false'; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'true', label: 'Active' },
  { value: 'false', label: 'Inactive / Invited' },
];

const SELECT_CLASS =
  'h-10 w-full rounded-md border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1';

interface UsersToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  role: Role | undefined;
  onRoleChange: (role: Role | undefined) => void;
  isActive: boolean | undefined;
  onIsActiveChange: (value: boolean | undefined) => void;
  onClearFilters: () => void;
  /** `Show: [N Rows]` row-size control (spec §5.2). */
  limit: number;
  onLimitChange: (limit: number) => void;
}

export default function UsersToolbar({
  search,
  onSearchChange,
  role,
  onRoleChange,
  isActive,
  onIsActiveChange,
  onClearFilters,
  limit,
  onLimitChange,
}: UsersToolbarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const activeFilters = (role ? 1 : 0) + (isActive !== undefined ? 1 : 0);

  // Close the filters popover on outside click / Escape.
  useEffect(() => {
    if (!filtersOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (filtersRef.current && !filtersRef.current.contains(event.target as Node)) {
        setFiltersOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFiltersOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [filtersOpen]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      {/* Search → debounced `q` on the parent (spec §5.2). */}
      <div className="relative flex-1 sm:max-w-md">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by name, email, or user ID…"
          aria-label="Search users"
          className="pl-9"
        />
      </div>

      {/* `contents` keeps Filters beside the search while `Show:` sits right. */}
      <div className="contents">
        <div className="relative" ref={filtersRef}>
          <Button
            type="button"
            variant="outline"
            aria-expanded={filtersOpen}
            aria-haspopup="dialog"
            onClick={() => setFiltersOpen((open) => !open)}
            className="h-11"
          >
            <SlidersHorizontal aria-hidden="true" />
            Filters
            {activeFilters > 0 && (
              <span className="grid size-5 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                {activeFilters}
              </span>
            )}
          </Button>

          {filtersOpen && (
            <div
              role="dialog"
              aria-label="Filter users"
              className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-border bg-popover p-4 shadow-lg"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Filters
                </p>
                <button
                  type="button"
                  aria-label="Close filters"
                  onClick={() => setFiltersOpen(false)}
                  className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>

              <label className="mt-3 block text-sm font-medium text-foreground">
                Role
                <select
                  value={role ?? ''}
                  onChange={(event) =>
                    onRoleChange(event.target.value ? (event.target.value as Role) : undefined)
                  }
                  className={`${SELECT_CLASS} mt-1.5`}
                >
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="mt-3 block text-sm font-medium text-foreground">
                Status
                <select
                  value={isActive === undefined ? '' : isActive ? 'true' : 'false'}
                  onChange={(event) => {
                    const value = event.target.value;
                    onIsActiveChange(value === '' ? undefined : value === 'true');
                  }}
                  className={`${SELECT_CLASS} mt-1.5`}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <Button type="button" variant="ghost" size="sm" className="mt-3 w-full" onClick={onClearFilters}>
                Clear filters
              </Button>
            </div>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-muted-foreground sm:ml-auto">
          Show:
          <select
            aria-label="Rows per page"
            value={limit}
            onChange={(event) => onLimitChange(Number(event.target.value))}
            className="h-11 rounded-md border border-input bg-white px-2.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} Rows
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
