import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import type { Department } from '@/features/departments/data/types';
import type { ConsoleUser, ConsoleStats, UsersPage } from '../data/types';
import { getStats, listUsers } from '../data/usersRepo';
import UserList from './UserList';

vi.mock('../data/usersRepo', () => ({
  listUsers: vi.fn(),
  getStats: vi.fn(),
}));

const INF: Department = {
  id: '00000000-0000-4000-8000-000000000101',
  name: 'Informatics',
  code: 'INF',
  archived: false,
  archivedAt: null,
  activeWorkflow: null,
  studentCount: 4,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

vi.mock('@/features/departments/hooks/useDepartments', () => ({
  useDepartments: () => ({
    data: { items: [INF], total: 1, page: 1, limit: 100 },
    isLoading: false,
  }),
}));

const MARCUS: ConsoleUser = {
  id: '00000000-0000-4000-8000-000000000002',
  firstName: 'Marcus',
  lastName: 'Holloway',
  email: 'm.holloway@student.edu',
  role: 'student',
  status: 'ACTIVE',
  isActive: true,
  createdAt: '2023-09-12T09:00:00.000Z',
  registrationNumber: 'CST/22/INF/00457',
  department: { id: INF.id, name: INF.name, code: INF.code },
  lastLoginLabel: '5 hours ago',
};

const ANITA: ConsoleUser = {
  ...MARCUS,
  id: '00000000-0000-4000-8000-000000000004',
  firstName: 'Anita',
  lastName: 'Desai',
  email: 'a.desai@student.edu',
  lastLoginLabel: '1 day ago',
};

const STATS: ConsoleStats = {
  total: 1248,
  students: 842,
  faculty: 156,
  inactive: 4,
  usedFallback: false,
};

function page(items: ConsoleUser[], usedFallback = false): UsersPage {
  return { items, total: items.length, page: 1, limit: 20, usedFallback };
}

/** The banner probe asks for a single missing-number row; default to zero. */
function mockMissing(total = 0) {
  vi.mocked(listUsers).mockImplementation((args) => {
    if (args.missingRegistrationNumber && args.limit === 1) {
      return Promise.resolve({ items: [], total, page: 1, limit: 1, usedFallback: false });
    }
    return Promise.resolve(page([MARCUS, ANITA]));
  });
}

const renderList = () =>
  render(
    <MemoryRouter initialEntries={['/users']}>
      <UserList />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getStats).mockResolvedValue(STATS);
});

describe('UserList (plan 4)', () => {
  it('renders rows returned by the repo (live shape)', async () => {
    mockMissing();

    renderList();

    expect(await screen.findByText('Marcus Holloway')).toBeInTheDocument();
    expect(screen.getByText('Anita Desai')).toBeInTheDocument();
    expect(await screen.findByText(/m\.holloway@student\.edu/)).toBeInTheDocument();
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    // The department column shows the managed name (design 2026-10-28).
    expect(screen.getAllByText('Informatics').length).toBeGreaterThan(0);

    // Spec §5.2 structure: checkbox column, numbered pager, Show control.
    expect(screen.getByRole('checkbox', { name: /select all users/i })).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: /select marcus holloway/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Showing 1–2 of 2 users')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /pagination/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Rows per page')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search by name, email, or user ID…')).toBeInTheDocument();

    // First fetch uses the default paging args plus the new (inactive) filters.
    expect(listUsers).toHaveBeenCalledWith({
      q: '',
      role: undefined,
      isActive: undefined,
      departmentId: undefined,
      missingRegistrationNumber: undefined,
      page: 1,
      limit: 20,
    });
  });

  it('shows em-dashes for live rows lacking department / last login', async () => {
    const LIVE = {
      ...MARCUS,
      id: '1e98a7c3-2f11-4b6d-9c0a-55aa77bb88cc',
      department: null,
      lastLoginLabel: undefined,
    } satisfies ConsoleUser;

    vi.mocked(listUsers).mockImplementation((args) =>
      Promise.resolve(
        args.missingRegistrationNumber && args.limit === 1
          ? { items: [], total: 0, page: 1, limit: 1, usedFallback: false }
          : page([LIVE]),
      ),
    );

    renderList();

    expect(await screen.findByText('Marcus Holloway')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('shows the sample-data banner when the repo fell back to fixtures', async () => {
    vi.mocked(listUsers).mockImplementation((args) =>
      Promise.resolve(
        args.missingRegistrationNumber && args.limit === 1
          ? { items: [], total: 0, page: 1, limit: 1, usedFallback: false }
          : page([MARCUS], true),
      ),
    );

    renderList();

    expect(await screen.findByText(/showing sample data/i)).toBeInTheDocument();
  });

  it('shows no banner while live data is served', async () => {
    mockMissing();

    renderList();

    expect(await screen.findByText('Marcus Holloway')).toBeInTheDocument();
    expect(screen.queryByText(/showing sample data/i)).not.toBeInTheDocument();
  });

  it('lists students missing a registration number and offers the review view', async () => {
    mockMissing(3);

    renderList();

    expect(await screen.findByRole('status')).toHaveTextContent(/3 students have no registration number/i);

    fireEvent.click(screen.getByRole('button', { name: /review students/i }));

    await waitFor(() =>
      expect(listUsers).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'student',
          missingRegistrationNumber: true,
          page: 1,
        }),
      ),
    );
  });

  it('filters by the managed department through the toolbar', async () => {
    mockMissing();

    renderList();
    await screen.findByText('Marcus Holloway');

    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    fireEvent.change(screen.getByLabelText('Department'), { target: { value: INF.id } });

    await waitFor(() =>
      expect(listUsers).toHaveBeenCalledWith(expect.objectContaining({ departmentId: INF.id })),
    );
  });

  it('renders the four live stat probes and the honest security rail (Phase 14)', async () => {
    mockMissing();

    renderList();

    expect(await screen.findByText('Total Accounts')).toBeInTheDocument();
    expect(screen.getByText('Students')).toBeInTheDocument();
    expect(screen.getByText('Faculty Members')).toBeInTheDocument();
    expect(screen.getByText('Inactive Accounts')).toBeInTheDocument();
    expect(screen.getByText('1,248')).toBeInTheDocument();
    // Honest no-endpoint copy instead of fixture log rows (spec §19.2).
    expect(screen.getByText(/no security-audit endpoint exists/i)).toBeInTheDocument();
    expect(screen.queryByText('Password Reset')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /full audit log/i })).not.toBeInTheDocument();
  });
});
