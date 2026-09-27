import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import type { UserDetail } from '../data/types';
import { getUser, sendInvite } from '../data/usersRepo';
import UserProfile from './UserProfile';

vi.mock('../data/usersRepo', () => ({
  getUser: vi.fn(),
  sendInvite: vi.fn(),
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
  department: 'Informatics',
  lastLoginLabel: '5 hours ago',
  extras: {
    department: 'Informatics',
    phone: '+1 (555) 012-3456',
    address: '742 Evergreen Terrace, Springfield',
    portalLanguage: 'English (UK)',
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
  audit: [
    { action: 'Account Login', ip: '192.168.1.45', at: 'Oct 24, 2024, 10:22 AM', outcome: 'SUCCESS' },
  ],
  activity: [
    { iconKind: 'system', before: 'System allocated supervisor ', strong: 'Dr. Elena Rossi', when: '2 DAYS AGO' },
  ],
  oversight: { lastLogin: 'Oct 24, 2024 (10:22 AM)', createdBy: 'Admin Portal', permissions: 'Standard User' },
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
  it('renders live detail merged with fixture rails', async () => {
    vi.mocked(getUser).mockResolvedValue(DETAIL);

    renderProfile();

    expect(await screen.findByRole('heading', { name: 'User Profile' })).toBeInTheDocument();
    expect(await screen.findByText('Marcus Holloway')).toBeInTheDocument();
    // Derived code in the header (spec §5.4 — mockup shows ID: USR-XXXX).
    expect(screen.getByText(`ID: ${DETAIL.code}`)).toBeInTheDocument();
    // Header card counters (fixture milestones).
    expect(screen.getByText('Theses')).toBeInTheDocument();
    expect(screen.getByText('Milestones')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
    // Contact extras merged from fixtures + live Member Since.
    expect(screen.getByText('+1 (555) 012-3456')).toBeInTheDocument();
    expect(screen.getByText('742 Evergreen Terrace, Springfield')).toBeInTheDocument();
    expect(screen.getByText('Member Since')).toBeInTheDocument();
    expect(screen.getByText('Send Direct Message')).toBeInTheDocument();
    // Rails rendered with their new actions.
    expect(screen.getByText('Neural Network Optimization for Edge Devices')).toBeInTheDocument();
    expect(screen.getByText('Add Project ›')).toBeInTheDocument();
    expect(screen.getByText('Account Login')).toBeInTheDocument();
    expect(screen.getByText('View Full Audit History ↗')).toBeInTheDocument();
    expect(getUser).toHaveBeenCalledWith(DETAIL.id);
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
