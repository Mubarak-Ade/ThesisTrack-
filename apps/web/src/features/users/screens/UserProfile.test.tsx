import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import type { Department } from '@/features/departments/data/types';
import { ApiError } from '@/lib/api/http';
import type { UserDetail } from '../data/types';
import { getUser, sendInvite, updateUser } from '../data/usersRepo';
import UserProfile from './UserProfile';

vi.mock('../data/usersRepo', () => ({
  getUser: vi.fn(),
  sendInvite: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

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
const DAT: Department = {
  ...INF,
  id: '00000000-0000-4000-8000-000000000105',
  name: 'Data Science',
  code: 'DAT',
};

vi.mock('@/features/departments/hooks/useDepartments', () => ({
  useDepartments: () => ({
    data: { items: [INF, DAT], total: 2, page: 1, limit: 100 },
    isLoading: false,
  }),
}));

import { toast } from 'sonner';

const DETAIL: UserDetail = {
  id: '00000000-0000-4000-8000-000000000002',
  code: 'USR-9012',
  firstName: 'Marcus',
  lastName: 'Holloway',
  email: 'm.holloway@student.edu',
  role: 'student',
  status: 'ACTIVE',
  isActive: true,
  createdAt: '2023-09-12T09:00:00.000Z',
  registrationNumber: 'CST/22/INF/00457',
  department: { id: INF.id, name: INF.name, code: INF.code },
  lastLoginLabel: '5 hours ago',
  extras: {
    // No contact endpoint exists — the repo always returns nulls (honest `—`).
    department: 'Informatics',
    phone: null,
    address: null,
    portalLanguage: null,
  },
  theses: [
    {
      code: 'TH-2024-001',
      badge: 'IN PROGRESS',
      title: 'Neural Network Optimization for Edge Devices',
      supervisor: 'Dr. Elena Rossi',
      updated: '2 hours ago',
    },
  ],
  milestones: 14,
  activity: [
    { iconKind: 'system', before: 'System allocated supervisor ', strong: 'Dr. Elena Rossi', when: '2 DAYS AGO' },
  ],
  oversight: { lastLogin: '—', createdBy: '—', permissions: 'Student' },
  railsError: false,
};

const renderProfile = (id = DETAIL.id) =>
  render(
    <MemoryRouter initialEntries={[`/users/${id}`]}>
      <Routes>
        <Route path="/users/:userId" element={<UserProfile />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('UserProfile (plan 6)', () => {
  it('renders live detail with live rails and honest gaps', async () => {
    vi.mocked(getUser).mockResolvedValue(DETAIL);

    renderProfile();

    expect(await screen.findByRole('heading', { name: 'User Profile' })).toBeInTheDocument();
    expect(await screen.findByText('Marcus Holloway')).toBeInTheDocument();
    // Derived code in the header (mockup parity §5.4 — mockup shows ID: USR-XXXX).
    expect(screen.getByText(`ID: ${DETAIL.code}`)).toBeInTheDocument();
    // Header card counters (live theses count + summed milestones).
    expect(screen.getByText('Theses')).toBeInTheDocument();
    expect(screen.getByText('Milestones')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
    // Role line carries the managed department (the ADR-16 match key).
    expect(screen.getByText(/Student • Informatics/)).toBeInTheDocument();
    // Contact card: live Member Since; no endpoint → em-dash phone/address rows.
    expect(screen.getByText('Member Since')).toBeInTheDocument();
    expect(screen.getByText('Send Direct Message')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
    // Rails rendered with their new actions.
    expect(screen.getByText('Neural Network Optimization for Edge Devices')).toBeInTheDocument();
    expect(screen.getByText('Add Project ›')).toBeInTheDocument();
    // Audit rail is an honest gap (spec §19.2 rejects AuditEvent) — no fixture table.
    expect(screen.getByText(/no audit feed exists/i)).toBeInTheDocument();
    expect(screen.queryByText('Account Login')).not.toBeInTheDocument();
    expect(screen.queryByText(/view full audit history/i)).not.toBeInTheDocument();
    expect(getUser).toHaveBeenCalledWith(DETAIL.id);
  });

  it('shows honest error copy when the live rail fan-out failed', async () => {
    vi.mocked(getUser).mockResolvedValue({ ...DETAIL, theses: [], activity: [], milestones: 0, railsError: true });

    renderProfile();

    expect(await screen.findByText(/project assignments could not be loaded/i)).toBeInTheDocument();
    expect(screen.getByText(/activity could not be loaded/i)).toBeInTheDocument();
    expect(screen.queryByText('Neural Network Optimization for Edge Devices')).not.toBeInTheDocument();
  });

  it('shows the not-found state with a back link for unknown ids', async () => {
    vi.mocked(getUser).mockResolvedValue(null);

    renderProfile('99999999-9999-4999-8999-999999999999');

    expect(await screen.findByText('User not found')).toBeInTheDocument();
    // Exact-case name: the header back arrow is "Back to All Users".
    const back = screen.getByRole('link', { name: 'Back to all users' });
    expect(back).toHaveAttribute('href', '/users');
    expect(sendInvite).not.toHaveBeenCalled();
  });

  it('Reset Password calls the re-invite endpoint and confirms via toast', async () => {
    vi.mocked(getUser).mockResolvedValue(DETAIL);
    vi.mocked(sendInvite).mockResolvedValue({ status: 'INVITED' });

    renderProfile();
    fireEvent.click(await screen.findByRole('button', { name: 'Reset Password' }));

    await waitFor(() => expect(sendInvite).toHaveBeenCalledWith(DETAIL.id));
    expect(toast.success).toHaveBeenCalledWith(`Invitation re-sent to ${DETAIL.email}`);
  });

  it('surfaces re-invite failures via an error toast (Rule 3)', async () => {
    vi.mocked(getUser).mockResolvedValue(DETAIL);
    vi.mocked(sendInvite).mockRejectedValue(new Error('boom'));

    renderProfile();
    fireEvent.click(await screen.findByRole('button', { name: 'Reset Password' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Unable to re-send the invitation. Try again.'),
    );
  });
});

describe('UserProfile enrollment edit (design 2026-10-28)', () => {
  it('shows the number and managed department read-only with an Edit affordance', async () => {
    vi.mocked(getUser).mockResolvedValue(DETAIL);

    renderProfile();

    expect((await screen.findAllByText('CST/22/INF/00457')).length).toBeGreaterThan(0);
    expect(screen.getByText('Informatics (INF)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit enrollment' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Department' })).not.toBeInTheDocument();
  });

  it('saves the department id and a normalized registration number', async () => {
    vi.mocked(getUser).mockResolvedValue(DETAIL);
    vi.mocked(updateUser).mockResolvedValue({
      ...DETAIL,
      registrationNumber: 'CST/22/DAT/00999',
      department: { id: DAT.id, name: DAT.name, code: DAT.code },
    });

    renderProfile();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit enrollment' }));
    fireEvent.change(screen.getByLabelText(/Registration number/i), {
      target: { value: ' cst/22/dat/00999 ' },
    });
    fireEvent.change(screen.getByLabelText('Department'), { target: { value: DAT.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updateUser).toHaveBeenCalledWith(DETAIL.id, {
        registrationNumber: 'CST/22/DAT/00999',
        departmentId: DAT.id,
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('Enrollment details updated');
  });

  it('refuses a DEPT segment that does not match the selected department', async () => {
    vi.mocked(getUser).mockResolvedValue(DETAIL);

    renderProfile();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit enrollment' }));
    fireEvent.change(screen.getByLabelText('Department'), { target: { value: DAT.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('The DEPT segment must be DAT for the selected department'),
    ).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('refuses a malformed student number', async () => {
    vi.mocked(getUser).mockResolvedValue(DETAIL);

    renderProfile();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit enrollment' }));
    fireEvent.change(screen.getByLabelText(/Registration number/i), {
      target: { value: 'STU-2023-0457' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Use FAC/YY/DEPT/NNNNN, e.g. CST/22/SWE/00825'),
    ).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('never clears a student registration number', async () => {
    vi.mocked(getUser).mockResolvedValue(DETAIL);

    renderProfile();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit enrollment' }));
    fireEvent.change(screen.getByLabelText(/Registration number/i), { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Registration number is required for students'),
    ).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('lets a supervisor save an arbitrary staff number and clear it', async () => {
    const SUP: UserDetail = {
      ...DETAIL,
      role: 'supervisor',
      registrationNumber: null,
      department: null,
    };
    vi.mocked(getUser).mockResolvedValue(SUP);
    vi.mocked(updateUser).mockResolvedValue({ ...SUP, registrationNumber: 'STAFF-0042' });

    renderProfile();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit enrollment' }));
    fireEvent.change(screen.getByLabelText(/Registration number/i), {
      target: { value: 'staff-0042' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updateUser).toHaveBeenCalledWith(DETAIL.id, {
        registrationNumber: 'STAFF-0042',
        departmentId: null,
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('Enrollment details updated');
  });

  it('surfaces a failed PATCH inline and never fakes success (Rule 3)', async () => {
    vi.mocked(getUser).mockResolvedValue(DETAIL);
    vi.mocked(updateUser).mockRejectedValue(
      new ApiError({
        status: 422,
        code: 'BUSINESS_RULE_VIOLATION',
        message: 'Registration number is already in use',
      }),
    );

    renderProfile();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit enrollment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Registration number is already in use'),
    ).toBeInTheDocument();
    // The editor stays open — no optimistic success.
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('falls back to connection copy for non-ApiError failures', async () => {
    vi.mocked(getUser).mockResolvedValue(DETAIL);
    vi.mocked(updateUser).mockRejectedValue(new Error('offline'));

    renderProfile();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit enrollment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(/unable to save enrollment details/i),
    ).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
