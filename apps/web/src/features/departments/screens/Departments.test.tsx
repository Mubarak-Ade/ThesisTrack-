import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { ApiError } from '@/lib/api/http';
import type { Department, DepartmentsPage, ListDepartmentsArgs } from '../data/types';
import { useCreateDepartment, useDepartments, useUpdateDepartment } from '../hooks/useDepartments';
import Departments from './Departments';

vi.mock('../hooks/useDepartments', () => ({
  useDepartments: vi.fn(),
  useCreateDepartment: vi.fn(),
  useUpdateDepartment: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { toast } from 'sonner';

const INF: Department = {
  id: '00000000-0000-4000-8000-000000000101',
  name: 'Informatics',
  code: 'INF',
  archived: false,
  archivedAt: null,
  activeWorkflow: { id: 'wf-inf', name: 'BSc Informatics' },
  studentCount: 12,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const LEGACY: Department = {
  ...INF,
  id: '00000000-0000-4000-8000-000000000102',
  name: 'Information Technology',
  code: null,
  activeWorkflow: null,
  studentCount: 3,
};

const ARCHIVED: Department = {
  ...INF,
  id: '00000000-0000-4000-8000-000000000103',
  name: 'Old Department',
  code: 'OLD',
  archived: true,
  archivedAt: '2026-02-01T00:00:00.000Z',
  activeWorkflow: null,
  studentCount: 0,
};

const createMutate = vi.fn();
const updateMutate = vi.fn();

function pageOf(items: Department[], total = items.length): DepartmentsPage {
  return { items, total, page: 1, limit: 20 };
}

/** The screen reads the banner probe (`missingCode`) as a count. */
function mockDepartments(items: Department[], missingCount = 0) {
  vi.mocked(useDepartments).mockImplementation((args: ListDepartmentsArgs = {}) => {
    if (args.missingCode && args.limit === 1) {
      return {
        data: pageOf([], missingCount),
        isPending: false,
        isError: false,
        isFetching: false,
        refetch: vi.fn(),
      } as never;
    }
    return {
      data: pageOf(items),
      isPending: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    } as never;
  });
}

const renderScreen = () =>
  render(
    <MemoryRouter initialEntries={['/departments']}>
      <Departments />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  createMutate.mockReset();
  updateMutate.mockReset();
  vi.mocked(useCreateDepartment).mockReturnValue({
    mutateAsync: createMutate,
    isPending: false,
  } as never);
  vi.mocked(useUpdateDepartment).mockReturnValue({
    mutateAsync: updateMutate,
    mutate: vi.fn(),
    isPending: false,
  } as never);
});

describe('Departments admin screen (design 2026-10-28)', () => {
  it('lists managed departments with their code, student count and workflow slot', () => {
    mockDepartments([INF, LEGACY]);
    renderScreen();

    expect(screen.getByRole('heading', { name: 'Departments' })).toBeInTheDocument();
    expect(screen.getByText('Informatics')).toBeInTheDocument();
    expect(screen.getByText('INF')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('BSc Informatics')).toBeInTheDocument();
    expect(screen.getByText('Information Technology')).toBeInTheDocument();
    // Legacy row: no code, no workflow.
    expect(screen.getByText('Missing code')).toBeInTheDocument();
    expect(screen.getAllByText('Any (fallback)').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Edit Informatics' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive Informatics' })).toBeInTheDocument();
    expect(screen.getByText('Showing 2 of 2 departments')).toBeInTheDocument();
  });

  it('shows the missing-code banner and narrows the list to legacy rows', async () => {
    mockDepartments([INF, LEGACY], 1);
    renderScreen();

    expect(
      screen.getByRole('status'),
    ).toHaveTextContent(/1 department needs a code/i);

    fireEvent.click(screen.getByRole('button', { name: 'Review departments' }));

    await waitFor(() =>
      expect(useDepartments).toHaveBeenCalledWith(
        expect.objectContaining({ missingCode: true, includeArchived: false }),
      ),
    );
    expect(screen.getByRole('button', { name: 'Show all departments' })).toBeInTheDocument();
  });

  it('toggles archived departments', async () => {
    mockDepartments([INF, ARCHIVED]);
    renderScreen();

    fireEvent.click(screen.getByRole('button', { name: 'Showing archived' }));

    await waitFor(() =>
      expect(useDepartments).toHaveBeenCalledWith(
        expect.objectContaining({ includeArchived: true }),
      ),
    );
  });

  it('creates a department with a trimmed name and upper-cased code', async () => {
    mockDepartments([INF]);
    createMutate.mockResolvedValue({ ...INF, id: 'new', name: 'Software Engineering', code: 'SWE' });
    renderScreen();

    fireEvent.click(screen.getByRole('button', { name: 'New department' }));
    fireEvent.change(screen.getByLabelText('Department name'), {
      target: { value: '  Software Engineering ' },
    });
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'swe' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create department' }));

    await waitFor(() =>
      expect(createMutate).toHaveBeenCalledWith({ name: 'Software Engineering', code: 'SWE' }),
    );
    expect(toast.success).toHaveBeenCalledWith('Department "Software Engineering" created.');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('refuses a malformed code before calling the API', async () => {
    mockDepartments([INF]);
    renderScreen();

    fireEvent.click(screen.getByRole('button', { name: 'New department' }));
    fireEvent.change(screen.getByLabelText('Department name'), {
      target: { value: 'Software Engineering' },
    });
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'SWE1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create department' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Code must be 2–4 letters, e.g. SWE',
    );
    expect(createMutate).not.toHaveBeenCalled();
  });

  it('surfaces a 409 conflict verbatim and keeps the dialog open', async () => {
    mockDepartments([INF]);
    createMutate.mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'CONFLICT',
        message: 'An active department named "Informatics" already exists',
      }),
    );
    renderScreen();

    fireEvent.click(screen.getByRole('button', { name: 'New department' }));
    fireEvent.change(screen.getByLabelText('Department name'), { target: { value: 'informatics' } });
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'INF' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create department' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An active department named "Informatics" already exists',
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('completes a legacy row by saving its first code', async () => {
    mockDepartments([LEGACY]);
    updateMutate.mockResolvedValue({ ...LEGACY, code: 'IT' });
    renderScreen();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Information Technology' }));
    expect(screen.getByLabelText('Code')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'it' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(updateMutate).toHaveBeenCalledWith({ id: LEGACY.id, input: { name: 'Information Technology', code: 'IT' } }),
    );
    expect(toast.success).toHaveBeenCalledWith('Department updated.');
  });

  it('archives after confirmation', async () => {
    mockDepartments([INF]);
    updateMutate.mockResolvedValue({ ...INF, archived: true });
    renderScreen();

    fireEvent.click(screen.getByRole('button', { name: 'Archive Informatics' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('BSc Informatics');
    fireEvent.click(screen.getByRole('button', { name: 'Archive department' }));

    await waitFor(() =>
      expect(updateMutate).toHaveBeenCalledWith({ id: INF.id, input: { archived: true } }),
    );
    expect(toast.success).toHaveBeenCalledWith(
      'Department archived — it stays on historical accounts.',
    );
  });

  it('keeps the dialog open when an active workflow blocks archiving (409)', async () => {
    mockDepartments([INF]);
    updateMutate.mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'CONFLICT',
        message: 'Archive the active workflow "BSc Informatics" before archiving this department',
      }),
    );
    renderScreen();

    fireEvent.click(screen.getByRole('button', { name: 'Archive Informatics' }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive department' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Archive the active workflow "BSc Informatics" before archiving this department',
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('restores an archived row from the table', async () => {
    mockDepartments([ARCHIVED]);
    const mutate = vi.fn((_args, options: { onSuccess?: () => void }) => options.onSuccess?.());
    vi.mocked(useUpdateDepartment).mockReturnValue({
      mutateAsync: updateMutate,
      mutate,
      isPending: false,
    } as never);
    renderScreen();

    expect(screen.queryByRole('button', { name: 'Archive Old Department' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restore Old Department' }));

    expect(mutate).toHaveBeenCalledWith(
      { id: ARCHIVED.id, input: { archived: false } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(toast.success).toHaveBeenCalledWith('Department restored.');
  });
});
