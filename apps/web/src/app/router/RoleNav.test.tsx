import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import App from './App';
import { AuthProvider, resetAuthBoot } from '@/app/providers/AuthProvider';
import { client } from '@/lib/api/http';
import { useAuthStore } from '@/stores/auth';
import type { PublicUser, Role } from '@/lib/api/http';

/**
 * Role-aware shell integration (spec §10.3/§10.5, Phase 10 Check): signing
 * in as each of the three roles yields exactly that role's §10.5 column and
 * no cross-role items — plus the student's state-dependent "My Project ▾"
 * (§10.5) and the real unread badge (task 10.4).
 */

type Result = { status: number; data: unknown };

function sessionUser(role: Role): PublicUser {
  return {
    id: `u-${role}`,
    email: `${role}.person@university.edu`,
    firstName: 'Taylor',
    lastName: 'Test',
    role,
    isActive: true,
    createdAt: '2026-09-01T00:00:00.000Z',
  };
}

function installAdapter(
  fn: (config: InternalAxiosRequestConfig) => Result,
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

interface AdapterOptions {
  /** /projects payload — non-empty flips the student nav to "approved". */
  projects?: unknown[];
  /** /proposals payload — an `approved` entry also flips the nav. */
  proposals?: unknown[];
  /** GET /notifications/unread-count answer. */
  unreadCount?: number;
}

function adapterFor(role: Role, options: AdapterOptions = {}) {
  const user = sessionUser(role);
  const ok = (payload: unknown): Result => ({
    status: 200,
    data: { success: true, data: payload },
  });

  return (config: InternalAxiosRequestConfig): Result => {
    const url = config.url ?? '';
    if (url === '/auth/refresh') {
      return ok({ accessToken: 'boot-token', expiresIn: 900, user });
    }
    if (url === '/notifications/unread-count') {
      return ok({ unreadCount: options.unreadCount ?? 0 });
    }
    if (url === '/projects') {
      return ok({ projects: options.projects ?? [], pagination: { total: 0 } });
    }
    if (url === '/proposals') {
      return ok({ proposals: options.proposals ?? [], pagination: { total: 0 } });
    }
    return ok({ user });
  };
}

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <AuthProvider>
          <App />
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

/** Waits for the shell to boot and returns its <aside aria-label="Sidebar">. */
async function sidebar(): Promise<HTMLElement> {
  // The shell mounts only after the boot refresh settles — query inside the
  // wait, never cache the element beforehand.
  await waitFor(() => {
    const el = document.querySelector('aside[aria-label="Sidebar"]');
    expect(el).toBeTruthy();
    expect(within(el as HTMLElement).getByText('Dashboard')).toBeTruthy();
  });
  return document.querySelector('aside[aria-label="Sidebar"]') as HTMLElement;
}

const originalAdapter = client.defaults.adapter;

beforeEach(() => {
  resetAuthBoot();
  useAuthStore.setState({ user: null, accessToken: null, status: 'unknown' });
});

afterEach(() => {
  client.defaults.adapter = originalAdapter;
});

describe('role-aware shell (spec §10.3/§10.5)', () => {
  it('administrator → the §10.5 admin column, nothing student/supervisor', async () => {
    installAdapter(adapterFor('administrator'));

    renderApp('/dashboard');
    const rail = await sidebar();

    for (const label of [
      'Dashboard',
      'Faculty',
      'Students',
      'Projects',
      'Proposals',
      'Assignments',
      'Monitoring',
      'Reports',
      'Notifications',
      'Settings',
    ]) {
      expect(within(rail).getByText(label), `admin nav: ${label}`).toBeTruthy();
    }
    expect(within(rail).queryByText('My Project')).toBeNull();
  });

  it('supervisor → the §10.5 supervisor column, no admin-only entries', async () => {
    installAdapter(adapterFor('supervisor'));

    renderApp('/dashboard');
    const rail = await sidebar();

    for (const label of ['Dashboard', 'Students', 'Proposals', 'Notifications', 'Settings']) {
      expect(within(rail).getByText(label), `supervisor nav: ${label}`).toBeTruthy();
    }
    for (const label of ['Faculty', 'Projects', 'Assignments', 'Monitoring', 'Reports', 'My Project']) {
      expect(within(rail).queryByText(label), `not in supervisor nav: ${label}`).toBeNull();
    }
  });

  it('student (pre-approval) → the §10.5 base column, no "My Project"', async () => {
    installAdapter(adapterFor('student'));

    renderApp('/dashboard');
    const rail = await sidebar();

    for (const label of ['Dashboard', 'Proposals', 'Notifications', 'Settings']) {
      expect(within(rail).getByText(label), `student nav: ${label}`).toBeTruthy();
    }
    // Cross-role items stay out; the footer's "Student" role title is not a
    // nav entry — query the plural directory label instead.
    for (const label of ['Students', 'Faculty', 'Projects', 'Assignments', 'My Project']) {
      expect(within(rail).queryByText(label), `not in student nav: ${label}`).toBeNull();
    }
  });

  it('student (approved) → state-dependent "My Project ▾" expands its children', async () => {
    installAdapter(adapterFor('student', { projects: [{ id: 'p-1' }] }));

    renderApp('/dashboard');
    const rail = await sidebar();

    await waitFor(() => expect(within(rail).getByText('My Project')).toBeTruthy());
    // Collapsed by default — children only after the toggle.
    expect(within(rail).queryByText('Milestones')).toBeNull();

    const user = userEvent.setup();
    await user.click(within(rail).getByText('My Project'));

    for (const label of ['Overview', 'Milestones', 'Submissions', 'Feedback', 'Activity']) {
      expect(within(rail).getByText(label), `My Project child: ${label}`).toBeTruthy();
    }
  });

  it('topbar bell carries the real unread badge (task 10.4)', async () => {
    installAdapter(adapterFor('administrator', { unreadCount: 3 }));

    renderApp('/dashboard');

    await waitFor(() => expect(screen.getByTestId('topbar-bell-badge').textContent).toBe('3'));
    expect(screen.getByLabelText('Notifications, 3 unread')).toBeTruthy();
  });

  it('a student opening an administrator URL lands on /forbidden (§4.5)', async () => {
    installAdapter(adapterFor('student'));

    renderApp('/users');

    await waitFor(() => expect(screen.getByText('Access restricted')).toBeTruthy());
    expect(screen.queryByText('All Users')).toBeNull();
  });
});
