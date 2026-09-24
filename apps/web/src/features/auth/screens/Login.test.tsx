import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import App from '@/app/router/App';
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

type Result = { status: number; data: unknown };

function installAdapter(fn: (config: InternalAxiosRequestConfig) => Result | Promise<Result>): void {
  client.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
    const { status, data } = await fn(config);
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

const envelopeError = (code: string, message: string, status: number) => ({
  status,
  data: { success: false, error: { code, message } },
});

const renderLogin = () =>
  render(
    <MemoryRouter initialEntries={['/login']}>
      <App />
    </MemoryRouter>,
  );

const originalAdapter = client.defaults.adapter;

function fillCredentials() {
  fireEvent.change(screen.getByLabelText(/email address/i), {
    target: { value: 'benjamin.thompson@university.edu' },
  });
  fireEvent.change(screen.getByLabelText(/^password$/i), {
    target: { value: 'S3cretPass!' },
  });
}

beforeEach(() => {
  // Production reality: AuthProvider's boot refresh has always settled by
  // the time a user can submit (failed boot → clear() → 'anonymous').
  // This test renders no provider, so seed the settled state directly.
  useAuthStore.setState({ user: null, accessToken: null, status: 'anonymous' });
});

describe('login (plan 4.1)', () => {
  it('successful sign-in stores the session and navigates to /dashboard', async () => {
    installAdapter((config) => {
      if (config.url === '/auth/login') {
        return {
          status: 200,
          data: { success: true, data: { accessToken: 'tok', expiresIn: 900, user } },
        };
      }
      return envelopeError('UNAUTHORIZED', 'no session', 401);
    });

    renderLogin();
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => expect(screen.getByText('Signed in as Benjamin S. Thompson')).toBeTruthy());
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().accessToken).toBe('tok');

    client.defaults.adapter = originalAdapter;
  });

  it('renders the danger callout inline on 401 without redirecting', async () => {
    const requested: string[] = [];
    installAdapter((config) => {
      requested.push(config.url ?? '');
      if (config.url === '/auth/login') {
        return envelopeError('UNAUTHORIZED', 'Invalid email or password', 401);
      }
      return envelopeError('NOT_FOUND', 'x', 404);
    });

    renderLogin();
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByText('Invalid email or password')).toBeTruthy();
    expect(screen.getByText(/authentication failed/i)).toBeTruthy();
    // Still on /login — no session-expired bounce; store untouched.
    expect(useAuthStore.getState().status).toBe('anonymous');
    // The401 exclusion kept this failure out of the refresh queue entirely
    // (plan risk: login 401 must never trigger the global redirect).
    expect(requested).not.toContain('/auth/refresh');
    // Values are preserved after the failure.
    expect((screen.getByLabelText(/email address/i) as HTMLInputElement).value).toBe(
      'benjamin.thompson@university.edu',
    );

    client.defaults.adapter = originalAdapter;
  });

  it('disables submit while the sign-in request is pending', async () => {
    installAdapter(async (config) => {
      if (config.url === '/auth/login') {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return envelopeError('UNAUTHORIZED', 'Invalid email or password', 401);
      }
      return envelopeError('NOT_FOUND', 'x', 404);
    });

    renderLogin();
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();

    await waitFor(() => expect(screen.getByText('Invalid email or password')).toBeTruthy());

    client.defaults.adapter = originalAdapter;
  });
});
