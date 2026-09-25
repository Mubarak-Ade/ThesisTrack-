import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { downloadCsv } from '@/lib/csv';
import type { ConsoleStats, Role, SecurityLog, UsersPage } from '../data/types';
import { getStats, listSecurityLogs, listUsers } from '../data/usersRepo';
import Pagination from '../components/Pagination';
import SampleDataBanner from '../components/SampleDataBanner';
import SecurityLogsRail from '../components/SecurityLogsRail';
import StatCards from '../components/StatCards';
import UsersTable, { type SortKey, type SortState } from '../components/UsersTable';
import { BulkEnrollmentCard, GuideLinks } from '../components/UsersSideCards';
import UsersToolbar from '../components/UsersToolbar';

function compareUsers(
  a: UsersPage['items'][number],
  b: UsersPage['items'][number],
  key: SortKey,
): number {
  if (key === 'name') {
    return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
  }
  if (key === 'role') return a.role.localeCompare(b.role);
  return a.status.localeCompare(b.status);
}

/**
 * All Users (spec §5.2): live list/search/filter/paging via `listUsers`,
 * client-side sorting of the loaded page, mock stat/security rails.
 */
export default function UserList() {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [role, setRole] = useState<Role | undefined>(undefined);
  const [isActive, setIsActive] = useState<boolean | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [sort, setSort] = useState<SortState>({ key: 'name', dir: 'asc' });
  const [data, setData] = useState<UsersPage | null>(null);
  const [stats, setStats] = useState<ConsoleStats | null>(null);
  const [logs, setLogs] = useState<SecurityLog[]>([]);

  // Debounced search (350ms) — each keystroke only updates `search`.
  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let alive = true;
    void listUsers({ q, role, isActive, page, limit }).then((next) => {
      if (alive) setData(next);
    });
    return () => {
      alive = false;
    };
  }, [q, role, isActive, page, limit]);

  useEffect(() => {
    let alive = true;
    void getStats().then((next) => {
      if (alive) setStats(next);
    });
    void listSecurityLogs().then((next) => {
      if (alive) setLogs(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  const rows = useMemo(() => {
    const items = data ? [...data.items] : [];
    items.sort((a, b) => {
      const result = compareUsers(a, b, sort.key);
      return sort.dir === 'asc' ? result : -result;
    });
    return items;
  }, [data, sort]);

  const handleSort = (key: SortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' },
    );
  };

  const clearFilters = () => {
    setRole(undefined);
    setIsActive(undefined);
    setPage(1);
  };

  const exportCsv = () => {
    downloadCsv(
      `thesistrack-users-page-${page}.csv`,
      ['Name', 'Email', 'Role', 'Department', 'Status', 'Last Login'],
      rows.map((user) => [
        `${user.firstName} ${user.lastName}`,
        user.email,
        user.role,
        user.department ?? '',
        user.status,
        user.lastLoginLabel ?? '',
      ]),
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link to="/" className="transition-colors hover:text-primary">
          Home
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-medium text-foreground">Users</span>
      </nav>

      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-primary">
            User Management
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-foreground sm:text-3xl">
            All Users
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Search, filter and manage every account in the department directory.
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {data?.usedFallback && <SampleDataBanner />}

        {stats && <StatCards stats={stats} />}

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="min-w-0 space-y-4 lg:col-span-2">
            <UsersToolbar
              search={search}
              onSearchChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
              role={role}
              onRoleChange={(value) => {
                setRole(value);
                setPage(1);
              }}
              isActive={isActive}
              onIsActiveChange={(value) => {
                setIsActive(value);
                setPage(1);
              }}
              onClearFilters={clearFilters}
              onExport={exportCsv}
            />

            <UsersTable
              rows={rows}
              sort={sort}
              onSort={handleSort}
              loading={data === null}
            />

            <Pagination
              page={data?.page ?? page}
              limit={data?.limit ?? limit}
              total={data?.total ?? 0}
              onPageChange={setPage}
              onLimitChange={(value) => {
                setLimit(value);
                setPage(1);
              }}
            />
          </div>

          <div className="space-y-4">
            <SecurityLogsRail logs={logs} />
            <BulkEnrollmentCard />
            <GuideLinks />
          </div>
        </div>
      </div>
    </div>
  );
}
