import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { downloadCsv } from '@/lib/csv';
import { Button } from '@/components/ui/button';
import { Download, UserPlus } from 'lucide-react';
import type { ConsoleStats, Role, UsersPage } from '../data/types';
import { getStats, listUsers } from '../data/usersRepo';
import Pagination from '@/components/ui/pagination';
import SampleDataBanner from '@/components/feedback/SampleDataBanner';
import SecurityLogsRail from '../components/SecurityLogsRail';
import StatCards from '../components/StatCards';
import UsersTable, { type SortKey, type SortState } from '../components/UsersTable';
import { BulkEnrollmentCard } from '../components/UsersSideCards';
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
 * All Users (mockup parity §5.2): live list/search/filter/paging via
 * `listUsers`, client-side sorting of the loaded page, four live stat probes
 * and an honest no-endpoint security rail (spec §19.2).
 */
export default function UserList() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [role, setRole] = useState<Role | undefined>(undefined);
  const [isActive, setIsActive] = useState<boolean | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [sort, setSort] = useState<SortState>({ key: 'name', dir: 'asc' });
  const [data, setData] = useState<UsersPage | null>(null);
  const [stats, setStats] = useState<ConsoleStats | null>(null);

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

  // Shared pager inputs (spec §5.2 — footer counts real rows).
  const total = data?.total ?? 0;
  const pagerPage = data?.page ?? page;
  const pagerLimit = data?.limit ?? limit;
  const pagerCount = Math.max(1, Math.ceil(total / pagerLimit));
  const pagerFrom = total === 0 ? 0 : (pagerPage - 1) * pagerLimit + 1;
  const pagerTo = Math.min(pagerPage * pagerLimit, total);

  const clearFilters = () => {
    setRole(undefined);
    setIsActive(undefined);
    setPage(1);
  };

  const exportCsv = () => {
    downloadCsv(
      `thesistrack-users-page-${page}.csv`,
      ['Name', 'Code', 'Email', 'Role', 'Department', 'Status', 'Last Login'],
      rows.map((user) => [
        `${user.firstName} ${user.lastName}`,
        user.code ?? '',
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
      {/* Breadcrumb (spec §3): ADMINISTRATION › USER MANAGEMENT */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <span>Administration</span>
        <span aria-hidden="true">›</span>
        <span className="text-foreground">User Management</span>
      </nav>

      <header className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
            All Users
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Manage institutional accounts, permissions, and department assignments.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={exportCsv}>
            <Download aria-hidden="true" />
            Export CSV
          </Button>
          <Button type="button" onClick={() => navigate('/users/new')}>
            <UserPlus aria-hidden="true" />
            Create User
          </Button>
        </div>
      </header>

      <div className="mt-6 space-y-4">
        {data?.usedFallback && <SampleDataBanner />}

        {stats && <StatCards stats={stats} />}

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
          limit={limit}
          onLimitChange={(value) => {
            setLimit(value);
            setPage(1);
          }}
        />

        <UsersTable
          rows={rows}
          sort={sort}
          onSort={handleSort}
          loading={data === null}
        />

        <Pagination
          page={pagerPage}
          pageCount={pagerCount}
          footer={`Showing ${pagerFrom}–${pagerTo} of ${total} users`}
          onPageChange={setPage}
          loading={data === null}
        />

        {/* Full-width 2-col below the grid (mockup parity §5.2). */}
        <div className="grid gap-4 lg:grid-cols-2">
          <SecurityLogsRail />
          <BulkEnrollmentCard />
        </div>
      </div>
    </div>
  );
}
