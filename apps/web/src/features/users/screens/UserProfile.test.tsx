import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

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
  registrationNumber: 'STU-2023-0457',
  program: 'MSc Computer Science',
  department: 'Informatics',
  lastLoginLabel: '5 hours ago',
  extras: {
    // No contact endpoint exists — the repo always returns nulls (honest `—`).
    department: null,
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
    // Role line carries the §11.0.2 program (ADR-16 match key).
    expect(screen.getByText(/Student • MSc Computer Science/)).toBeInTheDocument();
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

describe('UserProfile program edit (task 13.7 — §11.0.2 / ADR-16)', () => {
  it('shows the program read-only with an Edit affordance and honest helper copy', async () => {
    vi.mocked(getUser).mockResolvedValue(DETAIL);

    renderProfile();

    expect(await screen.findByText('MSc Computer Science')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByText(/ADR-16: the student/)).toBeInTheDocument();
    expect(screen.getByText(/blank = default workflow/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Program')).not.toBeInTheDocument();
  });

  it('saves an edited program through PATCH /users/:id', async () => {
    vi.mocked(getUser).mockResolvedValue(DETAIL);
    vi.mocked(updateUser).mockResolvedValue({ ...DETAIL, program: 'Data Science' });

    renderProfile();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Program'), { target: { value: 'Data Science' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updateUser).toHaveBeenCalledWith(DETAIL.id, { program: 'Data Science' }),
    );
    expect(toast.success).toHaveBeenCalledWith('Program updated');
    // Back to read-only with the stored value.
    expect(await screen.findByText('Data Science')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('clears the program (sends null) when the field is saved blank', async () => {
    vi.mocked(getUser).mockResolvedValue(DETAIL);
    vi.mocked(updateUser).mockResolvedValue({ ...DETAIL, program: null });

    renderProfile();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Program'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith(DETAIL.id, { program: null }));
    expect(toast.success).toHaveBeenCalledWith('Program updated');
  });

  it('surfaces a failed program PATCH inline and never fakes success (Rule 3)', async () => {
    vi.mocked(getUser).mockResolvedValue(DETAIL);
    vi.mocked(updateUser).mockRejectedValue(
      new ApiError({ status: 422, code: 'VALIDATION', message: 'Program is too long' }),
    );

    renderProfile();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Program'), { target: { value: 'Data Science' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Program is too long')).toBeInTheDocument();
    // The editor stays open on the entered value — no optimistic success.
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByLabelText('Program')).toHaveValue('Data Science');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('falls back to connection copy for non-ApiError failures', async () => {
    vi.mocked(getUser).mockResolvedValue(DETAIL);
    vi.mocked(updateUser).mockRejectedValue(new Error('offline'));

    renderProfile();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(/unable to save the program/i),
    ).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
