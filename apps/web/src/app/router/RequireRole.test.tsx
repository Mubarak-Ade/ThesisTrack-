import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import RequireRole from './RequireRole';
import { useAuthStore } from '@/stores/auth';
import type { PublicUser } from '@/lib/api/http';

const admin: PublicUser = {
  id: 'u-admin',
  email: 'ada.admin@university.edu',
  firstName: 'Ada',
  lastName: 'Admin',
  role: 'administrator',
  isActive: true,
  createdAt: '2026-09-01T00:00:00.000Z',
};

const student: PublicUser = {
  id: 'u-student',
  email: 'sam.student@university.edu',
  firstName: 'Sam',
  lastName: 'Student',
  role: 'student',
  isActive: true,
  createdAt: '2026-09-01T00:00:00.000Z',
};

/** Wraps the guard on `path` with public /forbidden + /unauthorized targets. */
function renderGuarded(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/forbidden" element={<div>forbidden destination</div>} />
        <Route path="/unauthorized" element={<div>unauthorized destination</div>} />
        <Route
          path={path}
          element={
            <RequireRole roles={['administrator']}>
              <div>secret admin area</div>
            </RequireRole>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAuthStore.setState({ user: null, accessToken: null, status: 'unknown', exitTo: null });
});

describe('RequireRole (spec §10.3)', () => {
  it('match → renders the guarded content', () => {
    useAuthStore.setState({ user: admin, accessToken: 'tok', status: 'authenticated' });

    renderGuarded('/users');

    expect(screen.getByText('secret admin area')).toBeTruthy();
    expect(screen.queryByText('forbidden destination')).toBeNull();
  });

  it('mismatch → /forbidden, and the guarded content never mounts', () => {
    useAuthStore.setState({ user: student, accessToken: 'tok', status: 'authenticated' });

    renderGuarded('/users');

    expect(screen.getByText('forbidden destination')).toBeTruthy();
    expect(screen.queryByText('secret admin area')).toBeNull();
  });

  it('anonymous → /unauthorized (RequireAuth owns the bounce + state.from)', () => {
    useAuthStore.setState({ user: null, accessToken: null, status: 'anonymous' });

    renderGuarded('/users');

    expect(screen.getByText('unauthorized destination')).toBeTruthy();
    expect(screen.queryByText('secret admin area')).toBeNull();
  });

  it('layout usage: without children the subtree renders through the Outlet', () => {
    useAuthStore.setState({ user: admin, accessToken: 'tok', status: 'authenticated' });

    render(
      <MemoryRouter initialEntries={['/reports']}>
        <Routes>
          <Route element={<RequireRole roles={['administrator']} />}>
            <Route path="/reports" element={<div>reports screen</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('reports screen')).toBeTruthy();
  });

  it('layout usage: a mismatched role is bounced even for the Outlet subtree', () => {
    useAuthStore.setState({ user: student, accessToken: 'tok', status: 'authenticated' });

    render(
      <MemoryRouter initialEntries={['/reports']}>
        <Routes>
          <Route path="/forbidden" element={<div>forbidden destination</div>} />
          <Route element={<RequireRole roles={['administrator']} />}>
            <Route path="/reports" element={<div>reports screen</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('forbidden destination')).toBeTruthy();
    expect(screen.queryByText('reports screen')).toBeNull();
  });
});
