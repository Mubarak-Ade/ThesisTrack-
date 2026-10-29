import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import type { Department } from '@/features/departments/data/types';
import { importUsers } from '../data/usersRepo';
import ImportWizard from './ImportWizard';

vi.mock('../data/usersRepo', () => ({
  importUsers: vi.fn(),
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

const WITH_DEPARTMENT = [
  'firstName,lastName,email,role,registrationNumber,department',
  'Marcus,Holloway,m.holloway@student.edu,student,CST/22/INF/00001,Informatics',
  'Anita,Desai,a.desai@student.edu,student,CST/22/CYB/00002,Cyber Security',
].join('\n');

const WITHOUT_DEPARTMENT = [
  'firstName,lastName,email,role,registrationNumber',
  'Anita,Desai,a.desai@student.edu,student,CST/22/INF/00002',
].join('\n');

const UNKNOWN_DEPARTMENT = [
  'firstName,lastName,email,role,registrationNumber,department',
  'Anita,Desai,a.desai@student.edu,student,CST/22/INF/00002,Robotics',
].join('\n');

const MISMATCHED_CODE = [
  'firstName,lastName,email,role,registrationNumber,department',
  'Anita,Desai,a.desai@student.edu,student,CST/22/INF/00002,Cyber Security',
].join('\n');

const MALFORMED_NUMBER = [
  'firstName,lastName,email,role,registrationNumber',
  'Anita,Desai,a.desai@student.edu,student,STU-2026-0002',
].join('\n');

function upload(csv: string, name = 'users.csv'): void {
  const file = new File([csv], name, { type: 'text/csv' });
  // jsdom does not guarantee Blob.text(); the wizard reads `file.text()`.
  Object.defineProperty(file, 'text', { value: async () => csv });
  fireEvent.change(screen.getByLabelText(/choose a csv file/i), { target: { files: [file] } });
}

const renderWizard = () =>
  render(
    <MemoryRouter initialEntries={['/users/import']}>
      <ImportWizard />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ImportWizard department column (design 2026-10-28)', () => {
  it('auto-detects Department, previews it, and sends the label for repo resolution', async () => {
    vi.mocked(importUsers).mockResolvedValue({ created: 2 });
    renderWizard();

    expect(
      screen.getByText(/Registration number is required for student rows/i),
    ).toBeInTheDocument();

    upload(WITH_DEPARTMENT);
    expect(await screen.findByText(/6 columns detected/)).toBeInTheDocument();
    // Auto-mapped to the 6th column (index 5), still optional.
    expect(screen.getByLabelText('Department')).toHaveValue('5');

    fireEvent.click(screen.getByRole('button', { name: /validate 2 rows/i }));
    expect(await screen.findByRole('columnheader', { name: 'Department' })).toBeInTheDocument();
    expect(screen.getByText('Informatics')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Continue$/ }));
    expect(await screen.findByText(/accounts ready to import/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Import 2 users' }));

    await waitFor(() => expect(importUsers).toHaveBeenCalledTimes(1));
    expect(importUsers).toHaveBeenCalledWith([
      {
        firstName: 'Marcus',
        lastName: 'Holloway',
        email: 'm.holloway@student.edu',
        role: 'student',
        registrationNumber: 'CST/22/INF/00001',
        department: 'Informatics',
      },
      {
        firstName: 'Anita',
        lastName: 'Desai',
        email: 'a.desai@student.edu',
        role: 'student',
        registrationNumber: 'CST/22/CYB/00002',
        department: 'Cyber Security',
      },
    ]);
  });

  it('keeps rows valid when the Department column is absent (optional, unmapped)', async () => {
    vi.mocked(importUsers).mockResolvedValue({ created: 1 });
    renderWizard();

    upload(WITHOUT_DEPARTMENT);
    expect(await screen.findByText(/5 columns detected/)).toBeInTheDocument();

    const departmentSelect = screen.getByLabelText('Department');
    expect(departmentSelect).toHaveValue('');
    expect(departmentSelect.parentElement).toHaveTextContent('Optional — skipped if unmapped');

    fireEvent.click(screen.getByRole('button', { name: /validate 1 rows/i }));
    expect(await screen.findByRole('columnheader', { name: 'Department' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Continue$/ })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /^Continue$/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Import 1 user' }));

    await waitFor(() => expect(importUsers).toHaveBeenCalledTimes(1));
    expect(importUsers).toHaveBeenCalledWith([
      {
        firstName: 'Anita',
        lastName: 'Desai',
        email: 'a.desai@student.edu',
        role: 'student',
        registrationNumber: 'CST/22/INF/00002',
      },
    ]);
  });

  it('flags a department that is not on the managed list', async () => {
    renderWizard();
    upload(UNKNOWN_DEPARTMENT);

    fireEvent.click(await screen.findByRole('button', { name: /validate 1 rows/i }));

    expect(
      await screen.findByText(/Unknown department "Robotics" — pick one from the managed list/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Continue$/ })).toBeDisabled();
  });

  it('flags a DEPT segment that does not match the row department', async () => {
    renderWizard();
    upload(MISMATCHED_CODE);

    fireEvent.click(await screen.findByRole('button', { name: /validate 1 rows/i }));

    expect(
      await screen.findByText(/DEPT must be CYB for Cyber Security/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Continue$/ })).toBeDisabled();
  });

  it('flags a malformed student registration number', async () => {
    renderWizard();
    upload(MALFORMED_NUMBER);

    fireEvent.click(await screen.findByRole('button', { name: /validate 1 rows/i }));

    expect(
      await screen.findByText(/Use FAC\/YY\/DEPT\/NNNNN, e\.g\. CST\/22\/SWE\/00825/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Continue$/ })).toBeDisabled();
  });
});
