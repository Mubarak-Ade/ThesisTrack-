import { ChevronDown, ChevronUp, ChevronsUpDown, EllipsisVertical, Pencil, MessageSquare, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ConsoleUser } from '../data/types';
import RoleBadge from './RoleBadge';
import StatusBadge from './StatusBadge';

export type SortKey = 'name' | 'role' | 'status';
export interface SortState {
  key: SortKey;
  dir: 'asc' | 'desc';
}

function initialsOf(user: ConsoleUser): string {
  return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
}

function sublineOf(user: ConsoleUser): string {
  // Live rows carry no fixture code → email alone (spec §4).
  return [user.code, user.email].filter(Boolean).join(' · ');
}

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
        <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-border bg-popover py-1 text-left shadow-lg">
          <Link
            to={`/users/${user.id}`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
          >
            <UserRound className="size-4 text-muted-foreground" aria-hidden="true" />
            View profile
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              toast.info('Editing users is not available yet');
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
          >
            <Pencil className="size-4 text-muted-foreground" aria-hidden="true" />
            Edit user
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              toast.info('Direct messages are not available yet');
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
          >
            <MessageSquare className="size-4 text-muted-foreground" aria-hidden="true" />
            Send message
          </button>
        </div>
      )}
    </div>
  );
}

interface UsersTableProps {
  rows: ConsoleUser[];
  sort: SortState;
  onSort: (key: SortKey) => void;
  loading: boolean;
}

export default function UsersTable({ rows, sort, onSort, loading }: UsersTableProps) {
  return (
    <Card>
      <CardContent className="p-0">
        {/* Table scrolls inside the card — the page itself never overflows.
            `relative` matters: it keeps absolutely-positioned descendants
            (sr-only spans) inside this clip chain instead of the ICB. */}
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[560px] min-[1440px]:min-w-[780px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <SortHeader label="User" sortKey="name" sort={sort} onSort={onSort} className="px-5 sm:px-6" />
                <SortHeader label="Role" sortKey="role" sort={sort} onSort={onSort} />
                <th scope="col" className="hidden px-3 py-3 font-bold uppercase tracking-wider min-[1440px]:table-cell">
                  Department
                </th>
                <SortHeader label="Status" sortKey="status" sort={sort} onSort={onSort} />
                <th scope="col" className="hidden px-3 py-3 font-bold uppercase tracking-wider min-[1440px]:table-cell">
                  Last Login
                </th>
                <th scope="col" className="px-5 py-3 sm:px-6">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={index} className="border-b border-border/70">
                    <td colSpan={6} className="px-5 py-4 sm:px-6">
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground sm:px-6">
                    No users match the current search or filters.
                  </td>
                </tr>
              ) : (
                rows.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-border/70 transition-colors last:border-0 hover:bg-surface-alt/60"
                  >
                    <td className="px-5 py-3.5 sm:px-6">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {initialsOf(user)}
                        </span>
                        <div className="min-w-0">
                          <Link
                            to={`/users/${user.id}`}
                            className="block truncate font-medium text-foreground transition-colors hover:text-primary"
                          >
                            {user.firstName} {user.lastName}
                          </Link>
                          <span className="block truncate text-xs text-muted-foreground">
                            {sublineOf(user)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3.5">
                      <RoleBadge role={user.role} />
                    </td>
                    <td className="hidden px-3 py-3.5 text-muted-foreground min-[1440px]:table-cell">
                      {user.department ?? '—'}
                    </td>
                    <td className="px-3 py-3.5">
                      <StatusBadge status={user.status} />
                    </td>
                    <td className="hidden px-3 py-3.5 text-xs text-muted-foreground min-[1440px]:table-cell">
                      {user.lastLoginLabel ?? '—'}
                    </td>
                    <td className="px-5 py-3.5 sm:px-6">
                      <RowMenu user={user} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
