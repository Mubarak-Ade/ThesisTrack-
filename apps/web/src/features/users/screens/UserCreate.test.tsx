import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import type { Department } from '@/features/departments/data/types';
import type { CreatedUser } from '../data/types';
import { createUser } from '../data/usersRepo';
import UserCreate from './UserCreate';

vi.mock('../data/usersRepo', () => ({ createUser: vi.fn() }));

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
const CYB: Department = {
  ...INF,
  id: '00000000-0000-4000-8000-000000000102',
  name: 'Cyber Security',
  code: 'CYB',
};

vi.mock('@/features/departments/hooks/useDepartments', () => ({
  useDepartments: () => ({
    data: { items: [INF, CYB], total: 2, page: 1, limit: 100 },
    isLoading: false,
  }),
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

function createdStudent(extra: Partial<CreatedUser['user']> = {}): CreatedUser {
  return {
    user: {
      id: '99999999-9999-4999-8999-999999999999',
      firstName: 'Console',
      lastName: 'E2E',
      email: 'console-e2e@test.local',
      role: 'student',
      status: 'INVITED',
      isActive: false,
      createdAt: '2026-09-25T00:00:00.000Z',
      registrationNumber: 'CST/22/INF/00001',
      department: { id: INF.id, name: INF.name, code: INF.code },
      ...extra,
    },
    status: 'INVITED',
  };
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

  it('requires a registration number when the role is student', async () => {
    renderCreate();
    fillIdentity();
    fireEvent.change(screen.getByLabelText('System Role'), { target: { value: 'student' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create User Profile' }));

    expect(
      await screen.findByText('Registration number is required for students'),
    ).toBeInTheDocument();
    expect(createUser).not.toHaveBeenCalled();
  });

  it('rejects a malformed student number with the FAC/YY/DEPT/NNNNN hint', async () => {
    renderCreate();
    fillIdentity();
    fireEvent.change(screen.getByLabelText('System Role'), { target: { value: 'student' } });
    fireEvent.change(screen.getByLabelText(/Registration Number/i), {
      target: { value: 'STU-2026-0001' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create User Profile' }));

    expect(
      await screen.findByText('Use FAC/YY/DEPT/NNNNN, e.g. CST/22/SWE/00825'),
    ).toBeInTheDocument();
    expect(createUser).not.toHaveBeenCalled();
  });

  it('rejects a DEPT segment that does not match the department code', async () => {
    renderCreate();
    fillIdentity();
    fireEvent.change(screen.getByLabelText('System Role'), { target: { value: 'student' } });
    fireEvent.change(screen.getByLabelText('Academic Department'), { target: { value: INF.id } });
    fireEvent.change(screen.getByLabelText(/Registration Number/i), {
      target: { value: 'CST/22/CYB/00001' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create User Profile' }));

    expect(
      await screen.findByText('The DEPT segment must be INF for the selected department'),
    ).toBeInTheDocument();
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
      target: { value: INF.id },
    });
    fireEvent.change(screen.getByLabelText(/Registration Number/i), {
      target: { value: 'CST/22/INF/00001' },
    });

    expect(await screen.findByText('Console E2E')).toBeInTheDocument();
    expect(screen.getByText('console-e2e@test.local')).toBeInTheDocument();
    expect(screen.getByText('student')).toBeInTheDocument(); // role badge (CSS-uppercased)
    expect(screen.getAllByText('Informatics').length).toBeGreaterThan(0); // preview row
    expect(screen.getByText('CST/22/INF/00001')).toBeInTheDocument();
    expect(screen.queryByText('Unassigned Role')).not.toBeInTheDocument();
  });

  it('submits departmentId with the number and navigates to the profile', async () => {
    vi.mocked(createUser).mockResolvedValue(createdStudent());

    renderCreate();
    fillIdentity();
    fireEvent.change(screen.getByLabelText('System Role'), { target: { value: 'student' } });
    fireEvent.change(screen.getByLabelText(/Registration Number/i), {
      target: { value: 'CST/22/INF/00001' },
    });
    fireEvent.change(screen.getByLabelText('Academic Department'), { target: { value: INF.id } });

    // Top submit button this time (Add User).
    fireEvent.click(screen.getByRole('button', { name: 'Add User' }));

    await waitFor(() => expect(createUser).toHaveBeenCalledTimes(1));
    expect(createUser).toHaveBeenCalledWith({
      firstName: 'Console',
      lastName: 'E2E',
      email: 'console-e2e@test.local',
      role: 'student',
      registrationNumber: 'CST/22/INF/00001',
      departmentId: INF.id,
    });
    expect(vi.mocked(createUser).mock.calls[0]![0]).not.toHaveProperty('program');
    expect(vi.mocked(createUser).mock.calls[0]![0]).not.toHaveProperty('department');

    // Lands on the profile route.
    expect(await screen.findByText('Profile loaded')).toBeInTheDocument();
  });

  it('leaves the department off the wire when none is chosen (unaffiliated)', async () => {
    vi.mocked(createUser).mockResolvedValue(
      createdStudent({ registrationNumber: 'STAFF-42', department: null, role: 'supervisor' }),
    );

    renderCreate();
    fillIdentity();
    fireEvent.change(screen.getByLabelText('System Role'), { target: { value: 'supervisor' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add User' }));

    await waitFor(() => expect(createUser).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createUser).mock.calls[0]![0]).toEqual({
      firstName: 'Console',
      lastName: 'E2E',
      email: 'console-e2e@test.local',
      role: 'supervisor',
    });
  });

  it('allows a supervisor an arbitrary staff number (no format check)', async () => {
    vi.mocked(createUser).mockResolvedValue(
      createdStudent({ registrationNumber: 'STAFF-42', department: null, role: 'supervisor' }),
    );

    renderCreate();
    fillIdentity();
    fireEvent.change(screen.getByLabelText('System Role'), { target: { value: 'supervisor' } });
    fireEvent.change(screen.getByLabelText(/Registration Number/i), {
      target: { value: 'STAFF-42' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add User' }));

    await waitFor(() => expect(createUser).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createUser).mock.calls[0]![0]).toMatchObject({
      registrationNumber: 'STAFF-42',
      role: 'supervisor',
    });
  });

  it('surfaces API write errors inline instead of faking success (Rule 3)', async () => {
    vi.mocked(createUser).mockRejectedValue(
      Object.assign(new Error('Email already exists'), { name: 'ApiError' }),
    );

    renderCreate();
    fillIdentity();
    fireEvent.change(screen.getByLabelText('System Role'), { target: { value: 'student' } });
    fireEvent.change(screen.getByLabelText(/Registration Number/i), {
      target: { value: 'CST/22/INF/00003' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create User Profile' }));

    // Non-ApiError path renders the connection fallback copy.
    expect(
      await screen.findByText(/unable to create the account/i),
    ).toBeInTheDocument();
    expect(screen.queryByText('Profile loaded')).not.toBeInTheDocument();
  });
});
