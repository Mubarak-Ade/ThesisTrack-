import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import DashboardByRole from '@/app/router/DashboardByRole';
import type { PublicUser } from '@/lib/api/http';
import { useAuthStore } from '@/stores/auth';
import type { DashboardData } from '../data/types';
import OversightDashboard from './OversightDashboard';

vi.mock('../data', () => ({ getDashboard: vi.fn() }));

const { getDashboard } = await import('../data');

function data(): DashboardData {
  return {
    project: { total: 0, active: 0, completed: 0, archived: 0 },
    department: { students: 0, faculty: 0, awaiting: 0 },
    workspace: [],
    workspaceTotal: 0,
    tasks: {
      upcoming: [],
      action: [],
      overdue: [],
      critical: {
        bodyLead: 'Nothing is overdue.',
        dateEm: 'today',
        bodyTail: '',
        cta: 'Open monitoring',
        to: '/monitoring',
      },
    },
    activity: [],
    quickActions: [],
    usedFallback: false,
  };
}

function userFor(role: 'administrator' | 'coordinator'): PublicUser {
  return {
    id: `u-${role}`,
    email: `${role}@test.local`,
    firstName: role === 'coordinator' ? 'Cora' : 'Ada',
    lastName: 'Person',
    role,
    isActive: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    department:
      role === 'coordinator'
        ? { id: 'dept-inf', name: 'Informatics', code: 'INF' }
        : null,
  };
}

function renderScreen(node: ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        {node}
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDashboard).mockResolvedValue(data());
});

describe('OversightDashboard — role-derived chrome (design 2026-11-02)', () => {
  it('super admin: title and institution-wide scope', async () => {
    useAuthStore.setState({
      user: userFor('administrator'),
      status: 'authenticated',
      accessToken: 'token',
    });

    renderScreen(<OversightDashboard />);

    expect(
      await screen.findByRole('heading', { name: 'Super Admin Dashboard' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Scope: All departments')).toBeInTheDocument();
    expect(screen.getByText(/^Super Admin$/)).toBeInTheDocument();
  });

  it('coordinator: title and own department scope', async () => {
    useAuthStore.setState({
      user: userFor('coordinator'),
      status: 'authenticated',
      accessToken: 'token',
    });

    renderScreen(<OversightDashboard />);

    expect(
      await screen.findByRole('heading', { name: 'Coordinator Dashboard' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Scope: Informatics')).toBeInTheDocument();
    expect(screen.getByText(/Session: Cora Person \(Informatics\)/)).toBeInTheDocument();
  });

  it('DashboardByRole sends a coordinator to the oversight dashboard', async () => {
    useAuthStore.setState({
      user: userFor('coordinator'),
      status: 'authenticated',
      accessToken: 'token',
    });

    renderScreen(<DashboardByRole />);

    expect(
      await screen.findByRole('heading', { name: 'Coordinator Dashboard' }),
    ).toBeInTheDocument();
  });
});
