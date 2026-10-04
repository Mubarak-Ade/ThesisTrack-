import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import type { ConsoleUser, ConsoleStats, SecurityLog, UsersPage } from '../data/types';
import { getStats, listSecurityLogs, listUsers } from '../data/usersRepo';
import UserList from './UserList';

vi.mock('../data/usersRepo', () => ({
  listUsers: vi.fn(),
  getStats: vi.fn(),
  listSecurityLogs: vi.fn(),
}));

const MARCUS: ConsoleUser = {
  id: '00000000-0000-4000-8000-000000000002',
  code: 'USR-9012',
  firstName: 'Marcus',
  lastName: 'Holloway',
  email: 'm.holloway@student.edu',
  role: 'student',
  status: 'ACTIVE',
  isActive: true,
  createdAt: '2023-09-12T09:00:00.000Z',
  registrationNumber: 'STU-2023-0457',
  program: 'MSc Computer Science',
  department: 'Informatics',
  lastLoginLabel: '5 hours ago',
};

const ANITA: ConsoleUser = {
  ...MARCUS,
  id: '00000000-0000-4000-8000-000000000004',
  code: 'USR-1102',
  firstName: 'Anita',
  lastName: 'Desai',
  email: 'a.desai@student.edu',
  lastLoginLabel: '1 day ago',
};

const STATS: ConsoleStats = {
  total: 1248,
  students: 842,
  faculty: 156,
  alerts: 4,
  totalDelta: '+12 this month',
  engagement: '92% engagement',
  facultyNote: '12 departments',
  alertsNote: 'Pending verification',
  usedFallback: false,
};

const LOGS: SecurityLog[] = [
  { id: 'sl-1', action: 'Password Reset', target: 'Marcus Holloway', actor: 'System', when: '12 MINS AGO', severity: 'ok' },
];

function page(items: ConsoleUser[], usedFallback = false): UsersPage {
  return { items, total: items.length, page: 1, limit: 20, usedFallback };
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
  vi.mocked(listSecurityLogs).mockResolvedValue(LOGS);
});

describe('UserList (plan 4)', () => {
  it('renders rows returned by the repo (live shape)', async () => {
    vi.mocked(listUsers).mockResolvedValue(page([MARCUS, ANITA]));

    renderList();

    expect(await screen.findByText('Marcus Holloway')).toBeInTheDocument();
    expect(screen.getByText('Anita Desai')).toBeInTheDocument();
    expect(await screen.findByText(/m\.holloway@student\.edu/)).toBeInTheDocument();
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);

    // Spec §5.2 structure: checkbox column, numbered pager, Show control.
    expect(screen.getByRole('checkbox', { name: /select all users/i })).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: /select marcus holloway/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Showing 1–2 of 2 users')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /pagination/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Rows per page')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search by name, email, or user ID…')).toBeInTheDocument();

    // First fetch uses the default paging args.
    expect(listUsers).toHaveBeenCalledWith({
      q: '',
      role: undefined,
      isActive: undefined,
      page: 1,
      limit: 20,
    });
  });

  it('shows em-dashes for live rows lacking department / last login', async () => {
    const LIVE = {
      ...MARCUS,
      id: '1e98a7c3-2f11-4b6d-9c0a-55aa77bb88cc',
      code: 'USR-1E98',
      department: undefined,
      lastLoginLabel: undefined,
    } satisfies ConsoleUser;

    vi.mocked(listUsers).mockResolvedValue(page([LIVE]));

    renderList();

    expect(await screen.findByText('Marcus Holloway')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('shows the sample-data banner when the repo fell back to fixtures', async () => {
    vi.mocked(listUsers).mockResolvedValue(page([MARCUS], true));

    renderList();

    expect(await screen.findByText(/showing sample data/i)).toBeInTheDocument();
  });

  it('shows no banner while live data is served', async () => {
    vi.mocked(listUsers).mockResolvedValue(page([MARCUS], false));

    renderList();

    expect(await screen.findByText('Marcus Holloway')).toBeInTheDocument();
    expect(screen.queryByText(/showing sample data/i)).not.toBeInTheDocument();
  });
});
