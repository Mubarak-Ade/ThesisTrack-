import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { importUsers } from '../data/usersRepo';
import ImportWizard from './ImportWizard';

vi.mock('../data/usersRepo', () => ({
  importUsers: vi.fn(),
}));

const WITH_PROGRAM = [
  'firstName,lastName,email,role,department,program',
  'Marcus,Holloway,m.holloway@student.edu,student,Informatics,MSc Computer Science',
  'Anita,Desai,a.desai@student.edu,student,Cyber Security,',
].join('\n');

const WITHOUT_PROGRAM = [
  'firstName,lastName,email,role,department',
  'Anita,Desai,a.desai@student.edu,student,Informatics',
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

describe('ImportWizard program column (task 13.7 — §11.0.2)', () => {
  it('auto-detects the optional Program column, previews it, and sends it (blank cell omitted)', async () => {
    vi.mocked(importUsers).mockResolvedValue({ created: 2 });
    renderWizard();

    expect(
      screen.getByText(/Department and program are optional/i),
    ).toBeInTheDocument();

    upload(WITH_PROGRAM);
    expect(await screen.findByText(/6 columns detected/)).toBeInTheDocument();
    // Auto-mapped to the 6th column (index 5), still optional.
    expect(screen.getByLabelText('Program')).toHaveValue('5');

    fireEvent.click(screen.getByRole('button', { name: /validate 2 rows/i }));
    expect(await screen.findByRole('columnheader', { name: 'Program' })).toBeInTheDocument();
    expect(screen.getByText('MSc Computer Science')).toBeInTheDocument();

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
        department: 'Informatics',
        program: 'MSc Computer Science',
      },
      // Blank program cell → the key is omitted entirely (never '').
      {
        firstName: 'Anita',
        lastName: 'Desai',
        email: 'a.desai@student.edu',
        role: 'student',
        department: 'Cyber Security',
      },
    ]);
  });

  it('keeps rows valid when the Program column is absent (optional, unmapped)', async () => {
    vi.mocked(importUsers).mockResolvedValue({ created: 1 });
    renderWizard();

    upload(WITHOUT_PROGRAM);
    expect(await screen.findByText(/5 columns detected/)).toBeInTheDocument();

    const programSelect = screen.getByLabelText('Program');
    expect(programSelect).toHaveValue('');
    expect(programSelect.parentElement).toHaveTextContent('Optional — skipped if unmapped');

    fireEvent.click(screen.getByRole('button', { name: /validate 1 rows/i }));
    expect(await screen.findByRole('columnheader', { name: 'Program' })).toBeInTheDocument();
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
        department: 'Informatics',
      },
    ]);
  });
});
