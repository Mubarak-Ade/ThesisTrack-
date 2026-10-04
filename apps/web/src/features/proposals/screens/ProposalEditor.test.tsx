import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ProposalEditor from './ProposalEditor';
import {
  createProposal,
  getProposal,
  patchProposal,
  submitProposal,
} from '../data/proposalsRepo';
import type { ProposalDetail, Proposal } from '../data/types';

vi.mock('../data/proposalsRepo', () => ({
  listProposals: vi.fn(),
  getProposal: vi.fn(),
  createProposal: vi.fn(),
  patchProposal: vi.fn(),
  submitProposal: vi.fn(),
  uploadAttachment: vi.fn(),
  removeAttachment: vi.fn(),
  downloadAttachment: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const DRAFT: Proposal = {
  id: 'p-1',
  studentId: 's-1',
  projectId: null,
  version: 1,
  title: 'Campus ledger',
  abstract: 'A study of append-only records.',
  body: '<p>Body text</p>',
  status: 'draft',
  submittedAt: null,
  createdAt: '2026-09-12T00:00:00.000Z',
  updatedAt: '2026-09-12T00:00:00.000Z',
  student: { id: 's-1', firstName: 'Ola', lastName: 'Nordmann', email: 'ola@test.local' },
};

const SUBMITTED: Proposal = {
  ...DRAFT,
  id: 'p-2',
  status: 'under_review',
  submittedAt: '2026-09-20T00:00:00.000Z',
};

function detailOf(proposal: Proposal, overrides: Partial<ProposalDetail> = {}): ProposalDetail {
  return {
    proposal,
    attachments: [],
    reviews: [],
    usedFallback: false,
    ...overrides,
  };
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Routes>
          <Route path="/proposals/new" element={<ProposalEditor />} />
          <Route path="/proposals/:proposalId/edit" element={<ProposalEditor />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getProposal).mockResolvedValue(detailOf(DRAFT));
  vi.mocked(createProposal).mockResolvedValue(DRAFT);
  vi.mocked(patchProposal).mockResolvedValue(DRAFT);
  vi.mocked(submitProposal).mockResolvedValue({ ...DRAFT, status: 'submitted' });
});

describe('ProposalEditor — create', () => {
  it('renders the §11.3 document rule: title, abstract, editor, file guidance', async () => {
    renderAt('/proposals/new');

    expect(await screen.findByRole('heading', { name: 'New proposal' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
    expect(screen.getByLabelText('Abstract')).toBeInTheDocument();
    expect(screen.getByRole('toolbar')).toBeInTheDocument();
    // Attachments need a proposal id first — the screen says so instead of
    // showing a dropzone that would fail.
    expect(screen.queryByRole('button', { name: /upload a document/i })).toBeNull();
  });

  it('validates before writing (title required)', async () => {
    const user = userEvent.setup();
    renderAt('/proposals/new');

    await user.click(await screen.findByRole('button', { name: /create draft/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A title is required.');
    expect(createProposal).not.toHaveBeenCalled();
  });

  it('creates the draft with title + abstract + body', async () => {
    const user = userEvent.setup();
    renderAt('/proposals/new');

    await screen.findByRole('toolbar');
    await user.type(screen.getByLabelText('Title'), 'Campus ledger');
    await user.type(screen.getByLabelText('Abstract'), 'A study of append-only records.');
    await user.click(screen.getByRole('button', { name: /create draft/i }));

    await waitFor(() =>
      expect(createProposal).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Campus ledger',
          abstract: 'A study of append-only records.',
        }),
      ),
    );
  });
});

describe('ProposalEditor — edit in place', () => {
  it('hydrates existing values and saves a patch', async () => {
    const user = userEvent.setup();
    renderAt('/proposals/p-1/edit');

    expect(await screen.findByDisplayValue('Campus ledger')).toBeInTheDocument();
    expect(screen.getByDisplayValue('A study of append-only records.')).toBeInTheDocument();

    const title = screen.getByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'Campus ledger v2');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(patchProposal).toHaveBeenCalledWith('p-1', expect.objectContaining({ title: 'Campus ledger v2' })),
    );
  });

  it('offers submit with a confirmation that names the I14 freeze', async () => {
    const user = userEvent.setup();
    renderAt('/proposals/p-1/edit');

    await user.click(await screen.findByRole('button', { name: /submit for review/i }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/document set will be locked/i);

    await user.click(within(dialog).getByRole('button', { name: /submit for review/i }));
    await waitFor(() => expect(submitProposal).toHaveBeenCalledWith('p-1'));
  });

  it('shows the attachments section with dropzone and frozen remove rules', async () => {
    vi.mocked(getProposal).mockResolvedValue(
      detailOf(DRAFT, {
        attachments: [
          {
            id: 'a-1',
            proposalId: 'p-1',
            proposalVersion: 1,
            originalFilename: 'proposal.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 2048,
            uploadedBy: 's-1',
            createdAt: '2026-09-12T00:00:00.000Z',
          },
        ],
      }),
    );
    renderAt('/proposals/p-1/edit');

    expect(await screen.findByRole('button', { name: /upload a document/i })).toBeInTheDocument();
    expect(screen.getByText('proposal.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove proposal.pdf' })).toBeEnabled();
  });

  it('hides the whole editor control on a frozen proposal (read-only after submit)', async () => {
    vi.mocked(getProposal).mockResolvedValue(detailOf(SUBMITTED));
    renderAt('/proposals/p-2/edit');

    expect(await screen.findByText(/can’t be edited right now/i)).toBeInTheDocument();
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(screen.queryByLabelText('Abstract')).toBeNull();
    expect(
      screen.getByRole('link', { name: /view proposal/i }),
    ).toHaveAttribute('href', '/proposals/p-2');
    expect(patchProposal).not.toHaveBeenCalled();
    expect(submitProposal).not.toHaveBeenCalled();
  });
});
