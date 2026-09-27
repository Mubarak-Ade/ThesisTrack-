import { BookOpen, ChevronDown, Clock, Download, GraduationCap, MoreHorizontal, TriangleAlert, UserPlus, UsersRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import Pagination from '@/components/ui/pagination';
import { downloadCsv } from '@/lib/csv';
import { cn } from '@/lib/utils';
import { getStudents, type StudentRow, type StudentSnapshot, type ThesisStatus } from '../data';

/** Honest paging over fixture rows (spec §5.6 — page size 5 → 3 real pages). */
const PAGE_SIZE = 5;

const STATUS_STYLE: Record<ThesisStatus, string> = {
  'IN PROGRESS': 'border-primary/20 bg-primary/10 text-primary',
  PROPOSED: 'border-blue-200 bg-blue-50 text-blue-600',
  DELAYED: 'border-transparent bg-danger-bg text-danger',
  COMPLETED: 'border-transparent bg-success-bg text-success',
};

/** Four aggregate cards (spec §5.6) — total/risk notes tinted per the mockup. */
function StudentStatCards({ stats }: { stats: StudentSnapshot['stats'] }) {
  const tiles = [
    {
      label: 'Total Students',
      value: stats.total.toLocaleString('en-US'),
      note: stats.totalNote,
      icon: UsersRound,
      iconClass: 'bg-primary/10 text-primary',
      noteClass: 'text-success',
    },
    {
      label: 'Postgraduates',
      value: stats.postgraduates.toLocaleString('en-US'),
      note: stats.postgraduatesNote,
      icon: GraduationCap,
      iconClass: 'bg-success-bg text-success',
    },
    {
      label: 'Thesis Active',
      value: stats.thesisActive.toLocaleString('en-US'),
      note: stats.thesisActiveNote,
      icon: BookOpen,
      iconClass: 'bg-secondary text-secondary-foreground',
    },
    {
      label: 'Risk Alerts',
      value: String(stats.riskAlerts).padStart(2, '0'),
      note: stats.riskNote,
      icon: TriangleAlert,
      iconClass: 'bg-danger-bg text-danger',
      noteClass: 'text-danger',
      valueClass: 'text-danger',
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => {
        const Icon = tile.icon;
        return (
          <Card key={tile.label}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {tile.label}
                </p>
                <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', tile.iconClass)}>
                  <Icon className="size-4" aria-hidden="true" />
                </span>
              </div>
              <p className={cn('mt-2 font-display text-3xl font-bold text-foreground', tile.valueClass)}>
                {tile.value}
              </p>
              <p className={cn('mt-1 text-xs', tile.noteClass ?? 'text-muted-foreground')}>
                {tile.note}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/** Student Management screen (spec §5.6) — fixture snapshot behind an async repo. */
export default function StudentList() {
  const [snapshot, setSnapshot] = useState<StudentSnapshot | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    let alive = true;
    void getStudents().then((next) => {
      if (alive) setSnapshot(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Local search over the fixture rows (spec §5.6).
  const rows = useMemo(() => {
    const items = snapshot?.rows ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        row.code.toLowerCase().includes(q) ||
        row.email.toLowerCase().includes(q),
    );
  }, [snapshot, search]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const pageRows = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const onSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const exportCsv = () => {
    downloadCsv(
      'thesistrack-students.csv',
      ['Name', 'Student ID', 'Email', 'Level', 'Department', 'Thesis Status', 'Enrolled', 'Supervisor'],
      rows.map((row) => [
        row.name,
        row.code,
        row.email,
        row.level,
        row.department,
        row.thesisStatus,
        row.enrolledYear,
        row.supervisor,
      ]),
    );
  };

  const stats = snapshot?.stats;
  const infoCards = snapshot?.infoCards ?? [];

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
      {/* Breadcrumb (spec §3): USERS › STUDENT DIRECTORY */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <Link to="/users" className="transition-colors hover:text-primary">
          Users
        </Link>
        <span aria-hidden="true">›</span>
        <span className="text-foreground">Student Directory</span>
      </nav>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
            Student Management
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            Manage institutional enrollment, departmental assignments, and thesis progress.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={exportCsv}>
            <Download aria-hidden="true" />
            Export CSV
          </Button>
          <Button type="button" asChild>
            <Link to="/users/new">
              <UserPlus aria-hidden="true" />
              Enroll Student
            </Link>
          </Button>
        </div>
      </header>

      {stats && (
        <>
          <div className="mt-6">
            <StudentStatCards stats={stats} />
          </div>

          {/* Student Directory section header + local search (spec §5.6). */}
          <Card className="mt-4">
            <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="font-display text-lg font-bold text-foreground">
                  Student Directory
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Full database of registered students and their academic standing.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-0 flex-1 sm:w-64">
                  <Input
                    value={search}
                    onChange={(event) => onSearch(event.target.value)}
                    placeholder="Search by name, ID or email…"
                    aria-label="Search students"
                    className="pr-9"
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    <span className="grid size-4 place-items-center">⌕</span>
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => toast.info('Program filtering is not available yet')}
                >
                  All Programs
                  <ChevronDown aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => toast.info('Department filtering is not available yet')}
                >
                  All Depts
                  <ChevronDown aria-hidden="true" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Directory table (spec §5.6). */}
          <Card className="mt-4">
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[840px] table-fixed border-collapse text-sm">
                <colgroup>
                  <col style={{ width: '32%' }} />
                  <col style={{ width: '17%' }} />
                  <col style={{ width: '19%' }} />
                  <col style={{ width: '23%' }} />
                  <col style={{ width: '9%' }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th scope="col" className="px-5 py-3 font-semibold">Student Identity</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Academic Group</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Thesis Status</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Primary Supervisor</th>
                    <th scope="col" className="px-3 py-3 font-semibold">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <StudentRowView
                      key={row.code}
                      row={row}
                      onAction={() => toast.info('Row actions are not available yet')}
                    />
                  ))}
                  {pageRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-sm text-muted-foreground">
                        No students match your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="px-5 py-4">
              <Pagination
                page={current}
                pageCount={pageCount}
                footer={`Showing ${pageRows.length} of ${rows.length} students`}
                onPageChange={setPage}
              />
            </div>
          </Card>

          {/* Bottom 3 cards (spec §5.6): VIEW LOGS / IMPORT TOOL / PREVIEW PORTAL. */}
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {infoCards.map((card) => (
              <Card key={card.title}>
                <CardContent className="flex h-full flex-col p-5">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    {card.title}
                  </h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                    {card.body}
                  </p>
                  {card.to ? (
                    <Link
                      to={card.to}
                      className={cn(
                        'mt-4 inline-flex w-fit items-center gap-1.5 text-xs font-bold uppercase tracking-wider transition-opacity hover:opacity-80',
                        card.tone === 'blue' ? 'text-blue-600' : 'text-primary',
                      )}
                    >
                      {card.cta} →
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toast.info(card.toast ?? 'Not available yet')}
                      className={cn(
                        'mt-4 inline-flex w-fit items-center gap-1.5 text-xs font-bold uppercase tracking-wider transition-opacity hover:opacity-80',
                        card.tone === 'blue' ? 'text-blue-600' : 'text-primary',
                      )}
                    >
                      {card.cta} →
                    </button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {!stats && (
        <p className="mt-8 flex items-center gap-3 text-sm text-muted-foreground" role="status">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Loading students…
        </p>
      )}
    </div>
  );
}

/** One directory row — identity, group, thesis pill + enrolment, supervisor. */
function StudentRowView({ row, onAction }: { row: StudentRow; onAction: () => void }) {
  return (
    <tr className="border-b border-border last:border-0 hover:bg-accent/40">
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-3">
          <Avatar size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{row.name}</p>
            <p className="truncate font-mono text-xs text-primary">{row.code}</p>
            <p className="truncate text-xs text-muted-foreground">{row.email}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3.5">
        <p className="text-sm font-medium text-foreground">{row.level}</p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <GraduationCap className="size-3.5 shrink-0" aria-hidden="true" />
          {row.department}
        </p>
      </td>
      <td className="px-3 py-3.5">
        <span
          className={cn(
            'inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide',
            STATUS_STYLE[row.thesisStatus],
          )}
        >
          {row.thesisStatus}
        </span>
        <p className="mt-1 flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
          <Clock className="size-3" aria-hidden="true" />
          Enrolled {row.enrolledYear}
        </p>
      </td>
      <td className="px-3 py-3.5">
        <span className="flex items-center gap-2 text-sm text-foreground">
          <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
          <span className="truncate">{row.supervisor}</span>
        </span>
      </td>
      <td className="px-3 py-3.5 text-right">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Actions for ${row.name}`}
          onClick={onAction}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </td>
    </tr>
  );
}
