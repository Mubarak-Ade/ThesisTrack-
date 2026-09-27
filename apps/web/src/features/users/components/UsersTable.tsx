import { ChevronDown, ChevronUp, ChevronsUpDown, Clock, EllipsisVertical, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ConsoleUser, UserStatus } from '../data/types';
import { Avatar } from '@/components/ui/avatar';
import RoleBadge from './RoleBadge';

export type SortKey = 'name' | 'role' | 'status';
export interface SortState {
  key: SortKey;
  dir: 'asc' | 'desc';
}

/** Dot + title-case label statuses (spec §5.2 — mockup's dot style). */
const STATUS_VIEW: Record<UserStatus, { label: string; dotClass: string }> = {
  ACTIVE: { label: 'Active', dotClass: 'bg-success' },
  INVITED: { label: 'Invited', dotClass: 'bg-amber-500' },
  INACTIVE: { label: 'Inactive', dotClass: 'bg-muted-foreground' },
};

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Icon = active ? (sort.dir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <th
      scope="col"
      className={cn('px-3 py-3 font-bold', className)}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-foreground',
          active && 'text-foreground',
        )}
      >
        {label}
        <Icon className={cn('size-3.5', active ? 'text-primary' : 'text-muted-foreground/60')} aria-hidden="true" />
      </button>
    </th>
  );
}

function RowMenu({ user }: { user: ConsoleUser }) {
  const [open, setOpen] = useState(false);
  const name = `${user.firstName} ${user.lastName}`;

  return (
    <div className="relative text-right">
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          tabIndex={-1}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-10 cursor-default"
        />
      )}
      <button
        type="button"
        aria-label={`Actions for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <EllipsisVertical className="size-4" aria-hidden="true" />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-border bg-popover py-1 text-left shadow-lg">
          <Link
            to={`/users/${user.id}`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
          >
            <UserRound className="size-4 text-muted-foreground" aria-hidden="true" />
            View profile
          </Link>
        </div>
      )}
    </div>
  );
}

/** Native checkbox — pinned over shadcn (no Radix dep, spec §4). */
function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      className="size-4 shrink-0 cursor-pointer accent-primary"
    />
  );
}

interface UsersTableProps {
  rows: ConsoleUser[];
  sort: SortState;
  onSort: (key: SortKey) => void;
  loading: boolean;
}

export default function UsersTable({ rows, sort, onSort, loading }: UsersTableProps) {
  // Selection state only — no bulk actions wired (spec §5.2).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));

  const toggleAll = () =>
    setSelected(() => (allSelected ? new Set() : new Set(rows.map((row) => row.id))));
  const toggleRow = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Card>
      <CardContent className="p-0">
        {/* Table scrolls inside the card — the page itself never overflows.
            `relative` matters: it keeps absolutely-positioned descendants
            (sr-only spans) inside this clip chain instead of the ICB. */}
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[760px] table-fixed text-left text-[13px]">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <th scope="col" className="w-[5%] px-4 py-3 text-center font-bold sm:px-5">
                  <Check
                    checked={allSelected}
                    onChange={toggleAll}
                    label="Select all users"
                  />
                </th>
                <SortHeader label="User" sortKey="name" sort={sort} onSort={onSort} className="w-[29%] px-3" />
                <SortHeader label="Role & Dept" sortKey="role" sort={sort} onSort={onSort} className="w-[17%]" />
                <SortHeader label="Status" sortKey="status" sort={sort} onSort={onSort} className="w-[13%]" />
                <th scope="col" className="w-[20%] px-3 py-3 font-bold uppercase tracking-wider">
                  Last Login
                </th>
                <th scope="col" className="w-[6%] px-3 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={index} className="border-b border-border/70">
                    <td colSpan={6} className="px-4 py-4 sm:px-5">
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground sm:px-5">
                    No users match the current search or filters.
                  </td>
                </tr>
              ) : (
                rows.map((user) => {
                  const status = STATUS_VIEW[user.status] ?? STATUS_VIEW.INVITED;
                  return (
                    <tr
                      key={user.id}
                      className="border-b border-border/70 transition-colors last:border-0 hover:bg-surface-alt/60"
                    >
                      <td className="px-4 py-3.5 text-center sm:px-5">
                        <span className="inline-flex">
                          <Check
                            checked={selected.has(user.id)}
                            onChange={() => toggleRow(user.id)}
                            label={`Select ${user.firstName} ${user.lastName}`}
                          />
                        </span>
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-3">
                          <Avatar size="sm" />
                          <div className="min-w-0">
                            <Link
                              to={`/users/${user.id}`}
                              className="block truncate font-medium text-foreground transition-colors hover:text-primary"
                            >
                              {user.firstName} {user.lastName}
                            </Link>
                            {user.code && (
                              <span className="block truncate text-xs font-semibold text-primary">
                                {user.code}
                              </span>
                            )}
                            <span className="block truncate text-xs text-muted-foreground">
                              {user.email}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3.5">
                        <RoleBadge role={user.role} />
                        <span className="mt-1 block truncate text-xs text-muted-foreground">
                          {user.department ?? '—'}
                        </span>
                      </td>
                      <td className="px-3 py-3.5">
                        <span className="inline-flex items-center gap-2 whitespace-nowrap text-foreground">
                          <span className={cn('size-2 shrink-0 rounded-full', status.dotClass)} aria-hidden="true" />
                          {status.label}
                        </span>
                      </td>
                      <td className="px-3 py-3.5">
                        {user.lastLoginLabel ? (
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                            <Clock className="size-3.5 shrink-0" aria-hidden="true" />
                            {user.lastLoginLabel}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3.5">
                        <RowMenu user={user} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
