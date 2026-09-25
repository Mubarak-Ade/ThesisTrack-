import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import App from './App';
import { AuthProvider, resetAuthBoot } from '@/app/providers/AuthProvider';
import { client } from '@/lib/api/http';
import { useAuthStore } from '@/stores/auth';
import type { PublicUser } from '@/lib/api/http';

const user: PublicUser = {
  id: 'u-1',
  email: 'benjamin.thompson@university.edu',
  firstName: 'Benjamin S.',
  lastName: 'Thompson',
  role: 'student',
  isActive: true,
  createdAt: '2026-09-01T00:00:00.000Z',
};

function installAdapter(
  fn: (config: InternalAxiosRequestConfig) => { status: number; data: unknown },
): void {
  client.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
    const { status, data } = fn(config);
    const response = { data, status, statusText: String(status), headers: {}, config };
    if (status >= 400) {
      throw new AxiosError(
        `Request failed with status code ${status}`,
        String(status),
        config,
        null,
        response as AxiosResponse,
      );
    }
    return response;
  }) as unknown as typeof client.defaults.adapter;
}

const unauthorized = (config: InternalAxiosRequestConfig) => {
  if (config.url === '/auth/refresh' || config.url === '/auth/me') {
    return {
      status: 401,
      data: { success: false, error: { code: 'UNAUTHORIZED', message: 'Refresh token is missing' } },
    };
  }
  return { status: 404, data: { success: false, error: { code: 'NOT_FOUND', message: 'x' } } };
};

const authorized = (config: InternalAxiosRequestConfig) => {
  if (config.url === '/auth/refresh') {
    return {
      status: 200,
      data: { success: true, data: { accessToken: 'boot-token', expiresIn: 900, user } },
    };
  }
  return { status: 200, data: { success: true, data: { user } } };
};

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );

const originalAdapter = client.defaults.adapter;

beforeEach(() => {
  resetAuthBoot();
  useAuthStore.setState({ user: null, accessToken: null, status: 'unknown' });
});

describe('routing (spec §3)', () => {
  it('/dashboard while logged out → /unauthorized', async () => {
    installAdapter(unauthorized);

    renderAt('/dashboard');

    await waitFor(() => expect(screen.getByText('Sign in required')).toBeTruthy());
    expect(useAuthStore.getState().status).toBe('anonymous');

    client.defaults.adapter = originalAdapter;
  });

  it('/dashboard with a session → console shell renders for the real user', async () => {
    installAdapter(authorized);

    renderAt('/dashboard');

    // Coordinator Dashboard heading (screen) + real name (sidebar footer).
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Coordinator Dashboard' })).toBeTruthy(),
    );
    expect(screen.getByText('Benjamin S. Thompson')).toBeTruthy();
    const sidebar = document.querySelector('aside[aria-label="Sidebar"]');
    expect(sidebar).toBeTruthy();
    // Scoped to the sidebar: the workspace table has its own "Student" header.
    expect(within(sidebar as HTMLElement).getByText('Student')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign Out' })).toBeTruthy();

    client.defaults.adapter = originalAdapter;
  });

  it('/invite without a token → /login', async () => {
    installAdapter(unauthorized);

    renderAt('/invite');

    await waitFor(() => expect(screen.getByText('Sign in')).toBeTruthy());

    client.defaults.adapter = originalAdapter;
  });

  it('unknown paths fall back to / → /dashboard → guard', async () => {
    installAdapter(unauthorized);

    renderAt('/no-such-page');

    await waitFor(() => expect(screen.getByText('Sign in required')).toBeTruthy());

    client.defaults.adapter = originalAdapter;
  });
});
