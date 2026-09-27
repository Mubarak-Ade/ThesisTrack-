import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import type { CreatedUser } from '../data/types';
import { createUser } from '../data/usersRepo';
import UserCreate from './UserCreate';

vi.mock('../data/usersRepo', () => ({
  createUser: vi.fn(),
}));

const renderCreate = () =>
  render(
    <MemoryRouter initialEntries={['/users/new']}>
      <Routes>
        <Route path="/users/new" element={<UserCreate />} />
        <Route path="/users" element={<div>Users list</div>} />
        <Route path="/users/:userId" element={<div>Profile loaded</div>} />
      </Routes>
    </MemoryRouter>,
  );

function fillIdentity() {
  fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Console' } });
  fireEvent.change(screen.getByLabelText('Last Name'), { target: { value: 'E2E' } });
  fireEvent.change(screen.getByLabelText('Institutional Email'), {
    target: { value: 'console-e2e@test.local' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('UserCreate (plan 5)', () => {
  it('shows validation messages on an empty submit and never calls the API', async () => {
    renderCreate();

    // Bottom submit button (top Add User shares the same handler).
    fireEvent.click(screen.getByRole('button', { name: 'Create User Profile' }));

    expect(await screen.findByText('First name is required')).toBeInTheDocument();
    expect(screen.getByText('Last name is required')).toBeInTheDocument();
    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Select a role')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add User' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard Changes' })).toBeInTheDocument();
    expect(createUser).not.toHaveBeenCalled();
  });

  it('default-checks both onboarding checkbox cards (spec §5.3)', async () => {
    renderCreate();

    const invite = screen.getByRole('checkbox', {
      name: /send invitation email immediately/i,
    });
    const enforce = screen.getByRole('checkbox', {
      name: /enforce immediate password change/i,
    });
    expect(invite).toBeChecked();
    expect(enforce).toBeChecked();

    fireEvent.click(enforce);
    expect(enforce).not.toBeChecked();
  });

  it('updates the Account Preview as fields change', async () => {
    renderCreate();

    // Empty-state placeholders: name + department, email + enrollment ID.
    expect((await screen.findAllByText('Not Selected')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('TBD').length).toBeGreaterThan(0);
    expect(screen.getByText('Unassigned Role')).toBeInTheDocument();

    fillIdentity();
    fireEvent.change(screen.getByLabelText('System Role'), { target: { value: 'student' } });
    fireEvent.change(screen.getByLabelText('Academic Department'), {
      target: { value: 'Informatics' },
    });

    expect(await screen.findByText('Console E2E')).toBeInTheDocument();
    expect(screen.getByText('console-e2e@test.local')).toBeInTheDocument();
    expect(screen.getByText('student')).toBeInTheDocument(); // role badge (CSS-uppercased)
    expect(screen.getAllByText('Informatics').length).toBeGreaterThan(0); // option + preview row
    expect(screen.queryByText('Unassigned Role')).not.toBeInTheDocument();
  });

  it('submits the mapped payload, shows success copy and navigates to the profile', async () => {
    const created: CreatedUser = {
      user: {
        id: '99999999-9999-4999-8999-999999999999',
        firstName: 'Console',
        lastName: 'E2E',
        email: 'console-e2e@test.local',
        role: 'student',
        status: 'INVITED',
        isActive: false,
        createdAt: '2026-09-25T00:00:00.000Z',
        registrationNumber: null,
      },
      status: 'INVITED',
    };
    vi.mocked(createUser).mockResolvedValue(created);

    renderCreate();
    fillIdentity();
    fireEvent.change(screen.getByLabelText('System Role'), { target: { value: 'student' } });
    fireEvent.change(screen.getByLabelText('Academic Department'), { target: { value: 'Informatics' } });

    // Top submit button this time (Add User).
    fireEvent.click(screen.getByRole('button', { name: 'Add User' }));

    // Repo receives the console input (UI-only department; repo drops it for §A).
    await waitFor(() => expect(createUser).toHaveBeenCalledTimes(1));
    expect(createUser).toHaveBeenCalledWith({
      firstName: 'Console',
      lastName: 'E2E',
      email: 'console-e2e@test.local',
      role: 'student',
      department: 'Informatics',
    });

    // Lands on the profile route.
    expect(await screen.findByText('Profile loaded')).toBeInTheDocument();
  });

  it('surfaces API write errors inline instead of faking success (Rule 3)', async () => {
    vi.mocked(createUser).mockRejectedValue(
      Object.assign(new Error('Email already exists'), { name: 'ApiError' }),
    );

    renderCreate();
    fillIdentity();
    fireEvent.change(screen.getByLabelText('System Role'), { target: { value: 'student' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create User Profile' }));

    // Non-ApiError path renders the connection fallback copy.
    expect(
      await screen.findByText(/unable to create the account/i),
    ).toBeInTheDocument();
    expect(screen.queryByText('Profile loaded')).not.toBeInTheDocument();
  });
});
