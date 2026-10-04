import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import AttachmentList from './AttachmentList';
import type { ProposalAttachment } from '../data/types';

const FILE: ProposalAttachment = {
  id: 'a-1',
  proposalId: 'p-1',
  proposalVersion: 2,
  originalFilename: 'proposal-v2.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 482_113,
  uploadedBy: 's-1',
  createdAt: '2026-10-01T00:00:00.000Z',
};

const onDownload = vi.fn();
const onRemove = vi.fn();

function renderList(props: Partial<Parameters<typeof AttachmentList>[0]> = {}) {
  return render(
    <AttachmentList
      attachments={[FILE]}
      editable
      onDownload={onDownload}
      onRemove={onRemove}
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AttachmentList (§11.3 / I14)', () => {
  it('shows filename, size and version for each document', () => {
    renderList();
    expect(screen.getByText('proposal-v2.pdf')).toBeInTheDocument();
    expect(screen.getByText(/471 KB/)).toBeInTheDocument();
    expect(screen.getByText(/version 2/)).toBeInTheDocument();
  });

  it('downloads through the repository path', async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole('button', { name: 'Download proposal-v2.pdf' }));
    expect(onDownload).toHaveBeenCalledWith(FILE);
  });

  it('removes after a destructive confirmation (§16.1)', async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole('button', { name: 'Remove proposal-v2.pdf' }));
    // The dialog asks first…
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/remove this document/i);
    await user.click(screen.getByRole('button', { name: 'Remove document' }));
    expect(onRemove).toHaveBeenCalledWith(FILE);
  });

  it('keeps Remove visible but disabled and explains why when frozen (I14)', async () => {
    renderList({ editable: false });
    const remove = screen.getByRole('button', { name: 'Remove proposal-v2.pdf' });
    expect(remove).toBeDisabled();
    expect(screen.getByText(/documents are frozen/i)).toBeInTheDocument();
    // Still downloadable while frozen.
    expect(screen.getByRole('button', { name: 'Download proposal-v2.pdf' })).toBeEnabled();
  });

  it('hides the remove affordance entirely for non-owners', () => {
    renderList({ editable: false, showRemove: false });
    expect(screen.queryByRole('button', { name: /remove proposal-v2/i })).toBeNull();
    expect(screen.queryByText(/documents are frozen/i)).toBeNull();
    expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument();
  });

  it('disables remove while a removal is in flight', async () => {
    renderList({ removingId: 'a-1' });
    expect(screen.getByRole('button', { name: 'Remove proposal-v2.pdf' })).toBeDisabled();
  });

  it('renders guidance instead of an empty list', () => {
    renderList({ attachments: [] });
    expect(screen.getByText(/no documents attached yet/i)).toBeInTheDocument();
  });
});
