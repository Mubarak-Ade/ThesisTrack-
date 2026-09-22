import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { AuthProvider, resetAuthBoot } from './AuthProvider';
import { client } from '../lib/http';
import { useAuthStore } from '../stores/auth';
import type { PublicUser } from '../lib/http';

const user: PublicUser = {
  id: 'u-1',
  email: 'benjamin@university.edu',
  firstName: 'Benjamin S.',
  lastName: 'Thompson',
  role: 'student',
  isActive: true,
  createdAt: '2026-09-01T00:00:00.000Z',
};

function installAdapter(fn: (config: InternalAxiosRequestConfig) => { status: number; data: unknown }): void {
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

function Probe() {
  const status = useAuthStore((s) => s.status);
  return <div data-testid="status">{status}</div>;
}

const renderProvider = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </MemoryRouter>,
  );

const originalAdapter = client.defaults.adapter;

beforeEach(() => {
  resetAuthBoot();
  useAuthStore.setState({ user: null, accessToken: null, status: 'unknown' });
});

describe('AuthProvider boot sequence', () => {
  it("transitions unknown → authenticated when refresh + me succeed", async () => {
    client.defaults.adapter = originalAdapter;
    installAdapter((config) => {
      if (config.url === '/auth/refresh') {
        return {
          status: 200,
          data: { success: true, data: { accessToken: 'boot-token', expiresIn: 900, user } },
        };
      }
      return { status: 200, data: { success: true, data: { user } } };
    });

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(useAuthStore.getState().accessToken).toBe('boot-token');
    expect(useAuthStore.getState().user).toEqual(user);

    client.defaults.adapter = originalAdapter;
  });

  it("transitions unknown → anonymous when the boot refresh fails", async () => {
    installAdapter(() => ({
      status: 401,
      data: { success: false, error: { code: 'UNAUTHORIZED', message: 'Refresh token is missing' } },
    }));

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'));
    expect(useAuthStore.getState().accessToken).toBeNull();

    client.defaults.adapter = originalAdapter;
  });
});
