import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { ApiError } from '@/lib/api/http';
import type { ConsoleUser } from '../data/types';
import { sendInvite } from '../data/usersRepo';
import UsersTable, { type SortState } from './UsersTable';

vi.mock('../data/usersRepo', () => ({ sendInvite: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { toast } from 'sonner';

/**
 * Orphan-account prevention — the Users list row menu gains "Resend
 * invitation" for INVITED rows (same admin re-invite endpoint as the details
 * screen's "Reset Password"). Errors surface via toast (Rule 3).
 */

const INVITED: ConsoleUser = {
  id: 'inv-1',
  code: 'USR-4242',
  firstName: 'Sadie',
  lastName: 'Kasir',
  email: 'sadie.kasir@student.edu',
  role: 'student',
  status: 'INVITED',
  isActive: false,
  createdAt: null,
  registrationNumber: null,
  program: null,
};

const ACTIVE: ConsoleUser = {
  ...INVITED,
  id: 'act-1',
  firstName: 'Adam',
  lastName: 'Active',
  email: 'adam.active@university.edu',
  status: 'ACTIVE',
  isActive: true,
};

const SORT: SortState = { key: 'name', dir: 'asc' };

const renderTable = (rows: ConsoleUser[]) =>
  render(
    <MemoryRouter>
      <UsersTable rows={rows} sort={SORT} onSort={() => {}} loading={false} />
    </MemoryRouter>,
  );

const openMenu = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name: `Actions for ${name}` }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('UsersTable row menu — resend invitation', () => {
  it('offers "Resend invitation" on INVITED rows', () => {
    renderTable([INVITED]);

    openMenu('Sadie Kasir');
    expect(screen.getByRole('menuitem', { name: /resend invitation/i })).toBeTruthy();
  });

  it('ACTIVE rows keep the menu but have no resend item', () => {
    renderTable([ACTIVE]);

    openMenu('Adam Active');
    expect(screen.queryByRole('menuitem', { name: /resend invitation/i })).toBeNull();
    expect(screen.getByRole('menuitem', { name: /view profile/i })).toBeTruthy();
  });

  it('clicking resend calls sendInvite for that row and confirms via toast', async () => {
    vi.mocked(sendInvite).mockResolvedValue({ status: 'INVITED' });
    renderTable([INVITED]);

    openMenu('Sadie Kasir');
    fireEvent.click(screen.getByRole('menuitem', { name: /resend invitation/i }));

    await waitFor(() => expect(sendInvite).toHaveBeenCalledWith('inv-1'));
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining(INVITED.email));
  });

  it('surfaces resend failures via an error toast (Rule 3)', async () => {
    vi.mocked(sendInvite).mockRejectedValue(
      new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Invitation not found' }),
    );
    renderTable([INVITED]);

    openMenu('Sadie Kasir');
    fireEvent.click(screen.getByRole('menuitem', { name: /resend invitation/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Invitation not found'));
    expect(toast.success).not.toHaveBeenCalled();
  });
});
