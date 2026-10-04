import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PublicUser } from '@/lib/api/http';

import SettingsScreen from './SettingsScreen';

vi.mock('../data/settingsRepo', () => ({
  getProfile: vi.fn(),
  sendPasswordReset: vi.fn(),
}));
vi.mock('@/lib/auth/signOut', () => ({ signOut: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

const { getProfile, sendPasswordReset } = await import('../data/settingsRepo');
const { signOut } = await import('@/lib/auth/signOut');

const USER: PublicUser = {
  id: 'u-1',
  email: 'rbac-owner@test.local',
  firstName: 'Ola',
  lastName: 'Nordmann',
  role: 'student',
  isActive: true,
  createdAt: '2026-09-01T00:00:00.000Z',
  registrationNumber: 'STU-2026-0001',
  program: 'Computer Science',
};

const renderScreen = () =>
  render(
    <MemoryRouter initialEntries={['/settings']}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <SettingsScreen />
      </QueryClientProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getProfile).mockResolvedValue({ user: USER, usedFallback: false });
  vi.mocked(sendPasswordReset).mockResolvedValue(
    'If an account exists for that email, a password reset link has been sent.',
  );
});

describe('SettingsScreen', () => {
  it('renders the stored profile fields (no invented values)', async () => {
    renderScreen();

    expect(await screen.findByText('Ola Nordmann')).toBeInTheDocument();
    expect(screen.getAllByText('rbac-owner@test.local').length).toBeGreaterThan(0);
    expect(screen.getByText('STU-2026-0001')).toBeInTheDocument();
    expect(screen.getByText('Computer Science')).toBeInTheDocument();
    expect(screen.getByText('Student')).toBeInTheDocument();
  });

  it('shows an em dash for fields the API never received', async () => {
    vi.mocked(getProfile).mockResolvedValue({
      user: { ...USER, program: null, registrationNumber: null },
      usedFallback: false,
    });
    renderScreen();

    await screen.findByText('Ola Nordmann');
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('sends the reset request for the signed-in address and reports the server message', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /email me a password reset/i }));
    expect(sendPasswordReset).toHaveBeenCalledWith('rbac-owner@test.local');
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/password reset link has been sent/i),
    );
  });

  it('surfaces a failed reset instead of pretending it worked', async () => {
    const user = userEvent.setup();
    vi.mocked(sendPasswordReset).mockRejectedValue(new Error('Mail service down'));
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /email me a password reset/i }));
    const { toast } = await import('sonner');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Mail service down'));
    expect(screen.queryByText(/password reset link has been sent/i)).toBeNull();
  });

  it('signs out through the shared sign-out path', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /^sign out$/i }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
