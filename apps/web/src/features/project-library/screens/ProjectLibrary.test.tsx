import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ProjectLibrary from './ProjectLibrary';
import { getLibraryProject, listLibrary } from '../data/projectLibraryRepo';
import type { LibraryPage, LibraryRow } from '../data/types';

vi.mock('../data/projectLibraryRepo', () => ({
  checkSimilarity: vi.fn(),
  getLibraryProject: vi.fn(),
  listLibrary: vi.fn(),
}));

const ROW: LibraryRow = {
  id: 'project-1',
  title: 'Photovoltaic scheduling ledger',
  description: 'Matches solar generation to campus load with a shared ledger.',
  status: 'active',
  session: '2025/2026',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  student: { id: 'student-1', firstName: 'Ola', lastName: 'Nordmann' },
  department: { id: 'dept-1', name: 'Informatics', code: 'INF' },
  supervisors: [{ id: 'supervisor-1', firstName: 'Ada', lastName: 'Lovelace' }],
  score: null,
  excerpt: 'A shared ledger for solar generation.',
};

const OTHER: LibraryRow = {
  ...ROW,
  id: 'project-2',
  title: 'Campus solar generation ledger',
  excerpt: 'Schedules photovoltaic output against demand.',
  session: '2024/2025',
  student: { id: 'student-2', firstName: 'Kari', lastName: 'Berg' },
  department: { id: 'dept-2', name: 'Data Science', code: 'DS' },
  supervisors: [{ id: 'supervisor-2', firstName: 'Grace', lastName: 'Hopper' }],
};

function page(items: LibraryRow[], total = items.length): LibraryPage {
  return {
    items,
    total,
    page: 1,
    limit: 10,
    departments: [{ id: 'dept-1', name: 'Informatics', count: total }],
  };
}

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

function renderScreen() {
  const { wrapper } = setup();
  return render(<ProjectLibrary />, { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ProjectLibrary screen', () => {
  it('renders the header, filters, rows and pagination', async () => {
    vi.mocked(listLibrary).mockResolvedValue(page([ROW, OTHER], 25));

    renderScreen();

    expect(screen.getByRole('heading', { name: 'Project Library' })).toBeTruthy();
    expect(screen.getByText('Read-only')).toBeTruthy();
    expect(screen.getByLabelText('Search the project library')).toBeTruthy();
    for (const label of ['All', 'Active', 'Completed', 'Archived']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }

    expect(await screen.findByText('Photovoltaic scheduling ledger')).toBeTruthy();
    expect(screen.getByText('Ola Nordmann')).toBeTruthy();
    expect(screen.getByText('Informatics')).toBeTruthy();
    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText('2025/2026')).toBeTruthy();
    expect(screen.getByText('A shared ledger for solar generation.')).toBeTruthy();
    expect(screen.getByLabelText('Page 3')).toBeTruthy();
  });

  it('debounces typing into one request after 300 ms', async () => {
    vi.mocked(listLibrary).mockResolvedValue(page([ROW]));
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText(ROW.title);

    const callsBefore = vi.mocked(listLibrary).mock.calls.length;
    await user.type(screen.getByLabelText('Search the project library'), 'ledger');

    await waitFor(() =>
      expect(vi.mocked(listLibrary).mock.calls.length).toBe(callsBefore + 1),
    );
    expect(vi.mocked(listLibrary).mock.lastCall?.[0]).toMatchObject({ q: 'ledger', page: 1 });
  });

  it('status and department filters reset the page and refetch', async () => {
    vi.mocked(listLibrary).mockResolvedValue(page([ROW], 25));
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText(ROW.title);

    await user.click(screen.getByLabelText('Page 2'));
    await waitFor(() =>
      expect(vi.mocked(listLibrary).mock.lastCall?.[0]).toMatchObject({ page: 2 }),
    );

    await user.click(screen.getByRole('button', { name: 'Archived' }));
    await waitFor(() =>
      expect(vi.mocked(listLibrary).mock.lastCall?.[0]).toMatchObject({
        page: 1,
        status: 'archived',
      }),
    );

    await user.selectOptions(screen.getByLabelText('Filter by department'), 'dept-1');
    await waitFor(() =>
      expect(vi.mocked(listLibrary).mock.lastCall?.[0]).toMatchObject({
        page: 1,
        departmentId: 'dept-1',
      }),
    );
  });

  it('keeps the previous page visible while the next one loads', async () => {
    let resolveSecond: ((value: LibraryPage) => void) | undefined;
    vi.mocked(listLibrary)
      .mockResolvedValueOnce(page([ROW], 25))
      .mockImplementationOnce(
        () =>
          new Promise<LibraryPage>((resolve) => {
            resolveSecond = resolve;
          }),
      );

    const user = userEvent.setup();
    renderScreen();
    await screen.findByText(ROW.title);

    await user.click(screen.getByLabelText('Page 2'));
    // The old row stays on screen under keepPreviousData.
    expect(screen.getByText(ROW.title)).toBeTruthy();
    expect(screen.queryByText('Loading the project library…')).toBeNull();

    resolveSecond?.(page([OTHER], 25));
    await screen.findByText(OTHER.title);
  });

  it('renders empty, error and loading states', async () => {
    vi.mocked(listLibrary).mockResolvedValueOnce(page([], 0));
    const empty = renderScreen();
    expect(await screen.findByText('No projects in the library yet')).toBeTruthy();
    empty.unmount();

    vi.mocked(listLibrary).mockRejectedValueOnce(new Error('offline'));
    const error = renderScreen();
    expect(await screen.findByText('The project library could not be loaded right now.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Try again/i })).toBeTruthy();
    error.unmount();

    vi.mocked(listLibrary).mockImplementationOnce(() => new Promise(() => {}));
    renderScreen();
    expect(screen.getByText('Loading the project library…')).toBeTruthy();
  });

  it('renders excerpts as text, never as HTML', async () => {
    vi.mocked(listLibrary).mockResolvedValue(
      page([{ ...ROW, excerpt: '<script>window.__pwned = true</script>' }]),
    );
    renderScreen();

    expect(
      await screen.findByText('<script>window.__pwned = true</script>'),
    ).toBeTruthy();
    expect(document.querySelector('script')).toBeNull();
  });

  it('opens the detail panel, swaps to a similar row, and closes on Escape', async () => {
    vi.mocked(listLibrary).mockResolvedValue(page([ROW]));
    vi.mocked(getLibraryProject).mockImplementation(async (id) =>
      id === OTHER.id
        ? { project: OTHER, similar: [ROW] }
        : { project: ROW, similar: [OTHER] },
    );

    const user = userEvent.setup();
    renderScreen();
    await screen.findByText(ROW.title);

    const trigger = screen.getByRole('button', { name: `View ${ROW.title}` });
    await user.click(trigger);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(ROW.title)).toBeTruthy();
    expect(within(dialog).getByText('Similar projects')).toBeTruthy();

    // A similar row swaps the panel content.
    await user.click(within(dialog).getByRole('button', { name: new RegExp(OTHER.title) }));
    await waitFor(() => expect(within(dialog).getByText(OTHER.title)).toBeTruthy());
    expect(getLibraryProject).toHaveBeenLastCalledWith(OTHER.id);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});
